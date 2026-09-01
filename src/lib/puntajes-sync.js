// Sincronización de puntajes con Codeforces, VJudge y omegaUp.
//
// Reglas que hacen que esto sea rápido y consistente:
//
// 1. La página NUNCA espera a las APIs externas. `leerPuntajes()` responde
//    desde la BD en milisegundos; `sincronizar()` corre aparte y actualiza las
//    filas. Antes cada visita disparaba hasta 252 peticiones externas en vivo.
//
// 2. Codeforces limita a ~1 petición cada 2 segundos por IP. El código anterior
//    lanzaba 8 en paralelo (lotes de 4 usuarios x 2 endpoints) y Codeforces
//    respondía 429 "Call limit exceeded" a una parte: por eso en cada recarga
//    faltaban usuarios distintos y las fotos aparecían y desaparecían. Aquí hay
//    un limitador de 1 petición cada 2.1 s.
//
// 3. `user.status` ya devuelve 400 "User with handle X not found" para handles
//    inexistentes, así que sirve para detectarlos sin una llamada extra. Se
//    marcan como 'no_encontrado' y se dejan de consultar durante 7 días.
//
// 4. Las fotos de perfil se guardan en BD (`avatar_url`). Antes vivían sólo en
//    la caché en memoria del proceso, así que se perdían en cada arranque en
//    frío y la tabla salía sin avatares.
//
// 5. omegaUp: `rankinfo.problems_solved` es null/0 para quien no está en el
//    ranking global (verificado: un miembro con 137 problemas aparecía en 0).
//    Se usa `api/user/problemsSolved/`, que sí devuelve la lista real.

// `query` (no `pool.query`) para que los cortes de conexión de Railway se
// reintenten en vez de convertirse en un 503 con la tabla vacía.
import { query } from '@/lib/db-server';
import * as cheerio from 'cheerio';
import {
  PLATAFORMAS,
  limpiarUsuario,
  limpiarAvatar,
  urlPerfil,
  iniciales,
} from '@/lib/plataformas';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const TIMEOUT_MS = 12000;

// Cada cuenta se refresca como mucho cada 3 h; los totales de problemas
// resueltos no cambian minuto a minuto y así el rate limit alcanza para todos.
export const TTL_MINUTOS = 180;

// Un handle que la plataforma dice que no existe se reintenta a los 7 días
// (por si el miembro corrige su perfil o se cambia el nombre en la plataforma).
const REINTENTO_NO_ENCONTRADO_DIAS = 7;

// Codeforces: 1 petición / 2 s documentado. 2.1 s deja margen.
const CF_GAP_MS = 2100;
const CF_MAX_HANDLES_POR_INFO = 100;

const VJ_CONCURRENCIA = 2;
const OU_CONCURRENCIA = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Limitador de ritmo: garantiza un hueco mínimo entre peticiones a un host. */
function crearLimitador(gapMs) {
  let siguiente = 0;
  return async function esperarTurno() {
    const ahora = Date.now();
    const turno = Math.max(ahora, siguiente);
    siguiente = turno + gapMs;
    if (turno > ahora) await sleep(turno - ahora);
  };
}

async function fetchConTimeout(url, options = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, ...(options.headers || {}) },
    });
  } finally {
    clearTimeout(id);
  }
}

/** Ejecuta `worker` sobre `items` con concurrencia limitada. */
async function conConcurrencia(items, limite, worker) {
  const resultados = [];
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      resultados[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

// ---------------------------------------------------------------------------
// Codeforces
// ---------------------------------------------------------------------------

const RE_HANDLE_NO_ENCONTRADO = /handles?:\s*User with handle (.+?) not found/i;

async function cfStatus(handle, esperarTurno) {
  await esperarTurno();
  // `count` acota la respuesta: el historial completo de un usuario muy activo
  // pesa varios MB y no aporta nada por encima de este límite.
  const res = await fetchConTimeout(
    `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10000`,
  );

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta no-JSON (página de mantenimiento de CF) */
  }

  if (res.status === 400 && RE_HANDLE_NO_ENCONTRADO.test(data?.comment || '')) {
    return { estado: 'no_encontrado' };
  }
  if (!res.ok || data?.status !== 'OK' || !Array.isArray(data.result)) {
    return { estado: 'error', motivo: data?.comment || `HTTP ${res.status}` };
  }

  // Un problema puede resolverse varias veces: contamos identificadores únicos.
  // Los problemas de gimnasios/ACM no traen `contestId`, así que caemos a
  // `problemsetName` para no colapsarlos todos en la misma clave.
  const resueltos = new Set();
  let maxDificultad = 0;
  let problemaMasDificil = '';

  for (const sub of data.result) {
    if (sub.verdict !== 'OK' || !sub.problem) continue;
    const p = sub.problem;
    resueltos.add(`${p.contestId ?? p.problemsetName ?? 'x'}-${p.index ?? p.name}`);
    if (p.rating && p.rating > maxDificultad) {
      maxDificultad = p.rating;
      problemaMasDificil = p.name || '';
    }
  }

  return {
    estado: 'ok',
    total: resueltos.size,
    dificil: problemaMasDificil.slice(0, 100),
    dificultad: maxDificultad,
  };
}

/**
 * Perfiles (avatar, rating, rango) de varios handles en UNA petición.
 * Ojo: si un solo handle no existe, Codeforces falla la llamada completa con
 * 400. Por eso se descarta el handle culpable y se reintenta; el bucle está
 * acotado para no gastar el rate limit en una lista muy sucia.
 */
async function cfInfo(handles, esperarTurno) {
  const perfiles = new Map();
  const noEncontrados = new Set();
  if (handles.length === 0) return { perfiles, noEncontrados };

  for (let i = 0; i < handles.length; i += CF_MAX_HANDLES_POR_INFO) {
    let lote = handles.slice(i, i + CF_MAX_HANDLES_POR_INFO);

    for (let intento = 0; intento < 5 && lote.length > 0; intento++) {
      await esperarTurno();
      const res = await fetchConTimeout(
        `https://codeforces.com/api/user.info?handles=${lote.map(encodeURIComponent).join(';')}`,
      );
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* ignorado */
      }

      if (res.ok && data?.status === 'OK' && Array.isArray(data.result)) {
        for (const u of data.result) {
          if (!u?.handle) continue;
          perfiles.set(u.handle.toLowerCase(), {
            avatar: limpiarAvatar(u.titlePhoto) || limpiarAvatar(u.avatar),
            ratingUsuario: Number.isFinite(u.rating) ? u.rating : null,
            rankUsuario: u.rank || null,
          });
        }
        break;
      }

      const culpable = (data?.comment || '').match(RE_HANDLE_NO_ENCONTRADO)?.[1];
      if (res.status === 400 && culpable) {
        noEncontrados.add(culpable.toLowerCase());
        lote = lote.filter((h) => h.toLowerCase() !== culpable.toLowerCase());
        continue;
      }
      break; // error no recuperable: se queda sin avatar hasta el próximo sync
    }
  }

  return { perfiles, noEncontrados };
}

async function sincronizarCodeforces(cuentas, deadline) {
  const esperarTurno = crearLimitador(CF_GAP_MS);
  const resultados = [];
  const handlesOk = [];

  for (const cuenta of cuentas) {
    // Se reserva tiempo para la llamada final de perfiles (avatares).
    if (Date.now() > deadline - CF_GAP_MS * 2) break;
    try {
      const r = await cfStatus(cuenta.usuarioLimpio, esperarTurno);
      resultados.push({ ...cuenta, ...r });
      if (r.estado === 'ok') handlesOk.push(cuenta.usuarioLimpio);
    } catch (e) {
      resultados.push({ ...cuenta, estado: 'error', motivo: e.message });
    }
  }

  if (handlesOk.length > 0) {
    try {
      const { perfiles, noEncontrados } = await cfInfo(handlesOk, esperarTurno);
      for (const r of resultados) {
        const clave = r.usuarioLimpio.toLowerCase();
        if (noEncontrados.has(clave)) {
          r.estado = 'no_encontrado';
          continue;
        }
        const perfil = perfiles.get(clave);
        if (perfil) {
          // Una respuesta OK de user.info es autoritativa: si no trae foto (o
          // trae el placeholder de Codeforces) se borra la que hubiera.
          r.avatar = perfil.avatar ?? '';
          r.ratingUsuario = perfil.ratingUsuario;
          r.rankUsuario = perfil.rankUsuario;
        }
      }
    } catch (e) {
      console.warn(`[puntajes] user.info falló: ${e.message}`);
    }
  }

  return resultados;
}

// ---------------------------------------------------------------------------
// VJudge
// ---------------------------------------------------------------------------

async function sincronizarVJudge(cuenta) {
  const user = encodeURIComponent(cuenta.usuarioLimpio);

  const res = await fetchConTimeout(`https://vjudge.net/user/solveDetail/${user}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `https://vjudge.net/user/${user}`,
    },
    body: '',
  });

  // VJudge responde 404 en HTML cuando el usuario no existe. Antes se seguía al
  // scraping del perfil, que también fallaba: dos peticiones desperdiciadas por
  // cada handle inválido.
  if (res.status === 404) return { estado: 'no_encontrado' };

  if (res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* cae al scraping */
    }
    if (data && data.acRecords && typeof data.acRecords === 'object') {
      const unicos = new Set();
      for (const [oj, problemas] of Object.entries(data.acRecords)) {
        if (!Array.isArray(problemas)) continue;
        for (const p of problemas) unicos.add(`${oj}-${p}`);
      }
      return { estado: 'ok', total: unicos.size };
    }
  }

  // Respaldo: leer el total del HTML del perfil.
  const htmlRes = await fetchConTimeout(`https://vjudge.net/user/${user}`);
  if (htmlRes.status === 404) return { estado: 'no_encontrado' };
  if (!htmlRes.ok) return { estado: 'error', motivo: `HTTP ${htmlRes.status}` };

  const html = await htmlRes.text();
  const $ = cheerio.load(html);
  const candidatos = [
    $("a[title='Overall solved']").text().trim(),
    $("td:contains('Overall solved')").next().text().trim(),
    html.match(/Overall solved[\s\S]{0,200}?(\d+)/i)?.[1],
  ];
  for (const c of candidatos) {
    const n = parseInt(c, 10);
    if (Number.isFinite(n)) return { estado: 'ok', total: n };
  }
  return { estado: 'error', motivo: 'sin total en HTML' };
}

// ---------------------------------------------------------------------------
// omegaUp
// ---------------------------------------------------------------------------

/**
 * omegaUp entrega el gravatar de todos sus usuarios, tengan cuenta en Gravatar
 * o no. `limpiarAvatar` le añade `d=404`, así que basta una comprobación para
 * saber si la foto existe de verdad y guardar null cuando no. Así el navegador
 * nunca pide imágenes que van a fallar y `avatar` refleja la realidad.
 */
async function avatarQueExiste(url) {
  if (!url) return null;
  try {
    const res = await fetchConTimeout(url, { method: 'HEAD' }, 6000);
    return res.ok ? url : null;
  } catch {
    // Ante la duda no se guarda: la tarjeta muestra las iniciales.
    return null;
  }
}

async function sincronizarOmegaUp(cuenta) {
  const user = encodeURIComponent(cuenta.usuarioLimpio);

  // `problemsSolved` devuelve la lista real de problemas. `profile.rankinfo`
  // sólo tiene datos de quien aparece en el ranking global, y devolvía 0 (o
  // null) para la mayoría de los miembros del club.
  const [resProblemas, resPerfil] = await Promise.all([
    fetchConTimeout(`https://omegaup.com/api/user/problemsSolved/?username=${user}`),
    fetchConTimeout(`https://omegaup.com/api/user/profile/?username=${user}`),
  ]);

  let problemas = null;
  try {
    problemas = await resProblemas.json();
  } catch {
    /* ignorado */
  }

  if (problemas?.errorname === 'userNotExist' || problemas?.errorname === 'parameterInvalid') {
    return { estado: 'no_encontrado' };
  }

  let perfil = null;
  try {
    perfil = await resPerfil.json();
  } catch {
    /* ignorado */
  }

  // '' = el perfil respondió y no hay foto; null = no se pudo comprobar.
  const avatar = perfil?.status === 'ok'
    ? ((await avatarQueExiste(limpiarAvatar(perfil.gravatar_92))) ?? '')
    : null;

  if (Array.isArray(problemas?.problems)) {
    return { estado: 'ok', total: problemas.problems.length, avatar };
  }

  // Respaldo si `problemsSolved` falla pero el perfil sí responde.
  const desdeRanking = perfil?.rankinfo?.problems_solved;
  if (perfil?.status === 'ok' && Number.isFinite(desdeRanking)) {
    return { estado: 'ok', total: desdeRanking, avatar };
  }

  return { estado: 'error', motivo: problemas?.error || `HTTP ${resProblemas.status}` };
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

async function guardarResultados(resultados) {
  const utiles = resultados.filter((r) => r && r.estado);
  if (utiles.length === 0) return 0;

  // Un solo UPDATE para todas las cuentas del lote. COALESCE conserva el valor
  // anterior cuando la plataforma no informó ese campo, para que un fallo
  // parcial nunca borre datos buenos.
  const { rowCount } = await query(
    `UPDATE cuenta_plataforma cp SET
        problemas_resueltos_total = COALESCE(d.total, cp.problemas_resueltos_total),
        problema_mas_dificil      = COALESCE(d.dificil, cp.problema_mas_dificil),
        rating                    = COALESCE(d.dificultad, cp.rating),
        rating_usuario            = COALESCE(d.rating_usuario, cp.rating_usuario),
        rank_usuario              = COALESCE(d.rank_usuario, cp.rank_usuario),
        -- '' significa "la plataforma confirmó que no tiene foto" y limpia la
        -- columna; NULL significa "no pudimos averiguarlo" y conserva la que ya
        -- estaba guardada.
        avatar_url                = CASE WHEN d.avatar = ''  THEN NULL
                                         WHEN d.avatar IS NOT NULL THEN d.avatar
                                         ELSE cp.avatar_url END,
        estado_sync               = d.estado,
        ultimo_intento            = NOW(),
        ultima_actualizacion      = CASE WHEN d.estado = 'ok'
                                         THEN NOW()
                                         ELSE cp.ultima_actualizacion END
       FROM (
         SELECT * FROM unnest(
           $1::int[], $2::int[], $3::text[], $4::int[],
           $5::int[], $6::text[], $7::text[], $8::text[]
         ) AS t(id_cuenta, total, dificil, dificultad,
                rating_usuario, rank_usuario, avatar, estado)
       ) d
      WHERE cp.id_cuenta = d.id_cuenta`,
    [
      utiles.map((r) => r.id_cuenta),
      utiles.map((r) => (Number.isFinite(r.total) ? r.total : null)),
      utiles.map((r) => r.dificil ?? null),
      utiles.map((r) => (Number.isFinite(r.dificultad) ? r.dificultad : null)),
      utiles.map((r) => (Number.isFinite(r.ratingUsuario) ? r.ratingUsuario : null)),
      utiles.map((r) => r.rankUsuario ?? null),
      utiles.map((r) => r.avatar ?? null),
      utiles.map((r) => r.estado),
    ],
  );

  return rowCount;
}

// ---------------------------------------------------------------------------
// Selección de trabajo + orquestación
// ---------------------------------------------------------------------------

const SQL_CUENTAS_PENDIENTES = `
  SELECT cp.id_cuenta, cp.id_miembro, cp.usuario, p.nombre AS plataforma
    FROM cuenta_plataforma cp
    JOIN catalogo_plataforma p ON p.id_plataforma = cp.id_plataforma
    JOIN miembro m            ON m.id_miembro = cp.id_miembro
   WHERE cp.activo = true
     AND p.activo = true
     AND m.deleted_at IS NULL
     AND m.estado = 'activo'
     AND COALESCE(TRIM(cp.usuario), '') <> ''
     AND (
           $1::boolean
           OR cp.ultima_actualizacion IS NULL
           OR cp.ultima_actualizacion < NOW() - make_interval(mins => $2::int)
         )
     AND (
           cp.estado_sync IS DISTINCT FROM 'no_encontrado'
           OR cp.ultimo_intento IS NULL
           OR cp.ultimo_intento < NOW() - make_interval(days => $3::int)
         )
   ORDER BY cp.ultima_actualizacion ASC NULLS FIRST, cp.id_cuenta
   LIMIT $4`;

/**
 * Cuánto trabajo queda. Devuelve las dos medidas porque no son lo mismo y
 * confundirlas se veía en pantalla: `cuentas` son PERFILES de plataforma (cada
 * miembro tiene hasta tres: Codeforces, VJudge y omegaUp), así que con 20
 * miembros el contador llegaba a 53 y parecía un número inventado; `miembros`
 * es la cifra que la gente reconoce.
 */
export async function contarPendientes() {
  const { rows } = await query(
    `SELECT count(*)::int AS cuentas,
            count(DISTINCT id_miembro)::int AS miembros
       FROM (${SQL_CUENTAS_PENDIENTES}) s`,
    [false, TTL_MINUTOS, REINTENTO_NO_ENCONTRADO_DIAS, 1000],
  );
  return { cuentas: rows[0]?.cuentas ?? 0, miembros: rows[0]?.miembros ?? 0 };
}

// Lote en vuelo, junto con las opciones con que se lanzó. Guardar `forzar` es
// necesario para no mentir: quien pide un refresco completo mientras corre un
// lote parcial NO obtiene lo que pidió.
let sincronizacionEnCurso = null; // { tarea, forzar }

/**
 * Refresca un lote de cuentas. Acotada en tiempo y en cantidad para que una
 * sola invocación nunca se alargue: las cuentas se toman de la más antigua a la
 * más reciente, así que llamadas sucesivas recorren a todos por turnos.
 *
 * Si ya hay un lote corriendo se engancha a él (no tiene sentido machacar las
 * APIs externas en paralelo) pero el resultado sale marcado con
 * `reutilizada: true` y con el `forzar` REAL del lote al que se enganchó. Antes
 * se devolvía la tarea en curso a secas y las opciones recibidas se perdían en
 * silencio: el botón "Actualizar" de /puntajes (que pide `?forzar=1`) se
 * colgaba del lote de fondo que el GET acababa de lanzar SIN forzar, así que
 * sólo se refrescaban las cuentas vencidas por TTL mientras la pantalla decía
 * que se había actualizado todo.
 */
export async function sincronizar({ presupuestoMs = 25000, limite = 40, forzar = false } = {}) {
  if (sincronizacionEnCurso) {
    const { tarea: enCurso, forzar: forzarEnCurso } = sincronizacionEnCurso;
    const resultado = await enCurso;
    return { ...resultado, reutilizada: true, forzada: forzarEnCurso, forzarSolicitado: forzar };
  }

  const tarea = (async () => {
    const deadline = Date.now() + presupuestoMs;

    const { rows } = await query(SQL_CUENTAS_PENDIENTES, [
      forzar,
      TTL_MINUTOS,
      REINTENTO_NO_ENCONTRADO_DIAS,
      limite,
    ]);

    const porPlataforma = {
      [PLATAFORMAS.CODEFORCES]: [],
      [PLATAFORMAS.VJUDGE]: [],
      [PLATAFORMAS.OMEGAUP]: [],
    };
    const invalidas = [];

    for (const row of rows) {
      const usuarioLimpio = limpiarUsuario(row.plataforma, row.usuario);
      // Handles como "No tengo" o "Zike 19" nunca van a resolver: se marcan una
      // vez y dejan de consumir peticiones en cada refresco.
      if (!usuarioLimpio) {
        invalidas.push({ id_cuenta: row.id_cuenta, estado: 'no_encontrado' });
        continue;
      }
      porPlataforma[row.plataforma]?.push({ ...row, usuarioLimpio });
    }

    const conError = (cuentas) => (e) => {
      console.warn(`[puntajes] lote falló: ${e.message}`);
      return cuentas.map((c) => ({ ...c, estado: 'error', motivo: e.message }));
    };

    // Se guarda en cuanto CADA plataforma termina, no al final de las tres.
    // Con un único guardado al cierre, si la invocación se cortaba antes
    // (límite de duración de la función, redeploy, red caída) se perdía el
    // lote entero: esas cuentas seguían pendientes, el siguiente pase repetía
    // el mismo trabajo y la cola no bajaba nunca.
    let guardadas = 0;
    const guardarLote = async (lista) => {
      try {
        guardadas += await guardarResultados(lista);
      } catch (e) {
        console.error(`[puntajes] guardado parcial falló: ${e.message}`);
      }
      return lista;
    };
    const guardarAlTerminar = async (promesa) => guardarLote((await promesa).filter(Boolean));

    // Los handles imposibles ("No tengo") no gastan red: se marcan de entrada.
    await guardarLote(invalidas);

    // Las tres plataformas corren en paralelo entre sí (hosts distintos, sin
    // rate limit compartido); dentro de cada una se respeta su propio ritmo.
    const [cf, vj, ou] = await Promise.all([
      guardarAlTerminar(
        sincronizarCodeforces(porPlataforma[PLATAFORMAS.CODEFORCES], deadline).catch(
          conError(porPlataforma[PLATAFORMAS.CODEFORCES]),
        ),
      ),

      guardarAlTerminar(
        conConcurrencia(porPlataforma[PLATAFORMAS.VJUDGE], VJ_CONCURRENCIA, async (c) => {
          if (Date.now() > deadline) return null;
          try {
            return { ...c, ...(await sincronizarVJudge(c)) };
          } catch (e) {
            return { ...c, estado: 'error', motivo: e.message };
          }
        }),
      ),

      guardarAlTerminar(
        conConcurrencia(porPlataforma[PLATAFORMAS.OMEGAUP], OU_CONCURRENCIA, async (c) => {
          if (Date.now() > deadline) return null;
          try {
            return { ...c, ...(await sincronizarOmegaUp(c)) };
          } catch (e) {
            return { ...c, estado: 'error', motivo: e.message };
          }
        }),
      ),
    ]);

    const todos = [...invalidas, ...cf, ...vj, ...ou];

    return {
      revisadas: rows.length,
      guardadas,
      ok: todos.filter((r) => r.estado === 'ok').length,
      noEncontradas: todos.filter((r) => r.estado === 'no_encontrado').length,
      errores: todos.filter((r) => r.estado === 'error').length,
    };
  })();

  sincronizacionEnCurso = { tarea, forzar };
  try {
    return { ...(await tarea), reutilizada: false, forzada: forzar };
  } finally {
    sincronizacionEnCurso = null;
  }
}

export function haySincronizacionEnCurso() {
  return sincronizacionEnCurso !== null;
}

/**
 * Lanza una sincronización sin bloquear la respuesta. DEVUELVE la promesa: en
 * un entorno serverless (esta web está en Vercel) hay que entregársela a
 * `after()` para que la plataforma mantenga viva la invocación. Como promesa
 * suelta, el proceso se congela al enviar la respuesta y el lote se queda a
 * medias.
 */
export function sincronizarEnSegundoPlano(opciones) {
  if (sincronizacionEnCurso) return sincronizacionEnCurso.tarea;
  return sincronizar(opciones).catch((e) =>
    console.error('[puntajes] sincronización en segundo plano falló:', e.message),
  );
}

// ---------------------------------------------------------------------------
// Lectura (lo que consume la página)
// ---------------------------------------------------------------------------

const CLAVE_PLATAFORMA = {
  [PLATAFORMAS.CODEFORCES]: 'codeforces',
  [PLATAFORMAS.VJUDGE]: 'vjudge',
  [PLATAFORMAS.OMEGAUP]: 'omegaup',
};

/**
 * Arma la tabla de posiciones desde la BD. Sin peticiones externas: siempre
 * responde rápido y con exactamente los mismos datos para todos los visitantes.
 */
export async function leerPuntajes() {
  const { rows } = await query(`
    SELECT
      cp.id_miembro,
      -- CONCAT_WS ignora NULL (antes un apellido nulo dejaba el nombre completo
      -- en NULL) y el REGEXP colapsa los espacios dobles de los datos sucios.
      TRIM(REGEXP_REPLACE(
        CONCAT_WS(' ', m.nombre, m.apellido_paterno), '\\s+', ' ', 'g'
      )) AS nombre_completo,
      p.nombre                                  AS plataforma,
      cp.usuario,
      COALESCE(cp.problemas_resueltos_total, 0) AS total,
      COALESCE(cp.problema_mas_dificil, '')     AS dificil,
      COALESCE(cp.rating, 0)                    AS dificultad,
      cp.rating_usuario,
      cp.rank_usuario,
      cp.avatar_url,
      cp.estado_sync,
      cp.ultima_actualizacion
    FROM cuenta_plataforma cp
    JOIN catalogo_plataforma p ON p.id_plataforma = cp.id_plataforma
    JOIN miembro m             ON m.id_miembro = cp.id_miembro
   WHERE cp.activo = true
     AND p.activo = true
     -- Los miembros dados de baja seguían apareciendo en el ranking.
     AND m.deleted_at IS NULL
     AND m.estado = 'activo'
     AND COALESCE(TRIM(cp.usuario), '') <> ''
     -- Sólo cuentas verificadas contra la plataforma: así no se listan los
     -- handles inexistentes (las cuentas de prueba) ni los que aún no se han
     -- comprobado, que sólo aportarían ceros falsos.
     AND cp.estado_sync IS DISTINCT FROM 'no_encontrado'
     AND cp.ultima_actualizacion IS NOT NULL
   ORDER BY cp.id_miembro
  `);

  const porMiembro = new Map();
  let actualizadoEn = null;

  for (const row of rows) {
    const clave = CLAVE_PLATAFORMA[row.plataforma];
    if (!clave) continue;

    const usuario = limpiarUsuario(row.plataforma, row.usuario);
    if (!usuario) continue; // handle con formato imposible ("No tengo")

    if (!porMiembro.has(row.id_miembro)) {
      porMiembro.set(row.id_miembro, {
        id_miembro: row.id_miembro,
        nombre_completo: row.nombre_completo || 'Miembro del club',
        iniciales: iniciales(row.nombre_completo),
        avatar: null,
        codeforces: null,
        vjudge: null,
        omegaup: null,
        total_problemas: 0,
      });
    }

    const miembro = porMiembro.get(row.id_miembro);
    const total = Number(row.total) || 0;

    miembro[clave] = {
      usuario,
      perfil_url: urlPerfil(row.plataforma, usuario),
      problemas_total: total,
      estado: row.estado_sync || 'ok',
      actualizado_en: row.ultima_actualizacion,
      ...(clave === 'codeforces'
        ? {
            problema_mas_dificil: row.dificil || '',
            max_dificultad: Number(row.dificultad) || 0,
            rating_usuario: row.rating_usuario ?? null,
            rank_usuario: row.rank_usuario || null,
          }
        : {}),
    };

    miembro.total_problemas += total;

    // Codeforces tiene la mejor foto; el gravatar de omegaUp sirve de respaldo.
    const avatar = limpiarAvatar(row.avatar_url);
    if (avatar && (!miembro.avatar || row.plataforma === PLATAFORMAS.CODEFORCES)) {
      miembro.avatar = avatar;
    }

    if (row.ultima_actualizacion && (!actualizadoEn || row.ultima_actualizacion > actualizadoEn)) {
      actualizadoEn = row.ultima_actualizacion;
    }
  }

  // Orden determinista: el desempate por nombre e id evita que las posiciones
  // bailen entre recargas cuando dos miembros tienen el mismo total.
  const resultados = [...porMiembro.values()].sort(
    (a, b) =>
      b.total_problemas - a.total_problemas ||
      a.nombre_completo.localeCompare(b.nombre_completo, 'es') ||
      a.id_miembro - b.id_miembro,
  );

  return { resultados, actualizadoEn };
}
