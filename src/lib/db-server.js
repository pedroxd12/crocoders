import { Pool } from 'pg';

/**
 * Configuración TLS de la conexión a Postgres.
 *
 * Con `DB_CA_CERT` (el certificado de la autoridad que emite el del servidor,
 * en PEM) la conexión se verifica de verdad: se cifra Y se comprueba que del
 * otro lado está el servidor que decimos. Es la opción recomendada.
 *
 * Sin CA no hay forma de validar la cadena —el proxy público de Railway usa un
 * certificado autofirmado— así que la conexión se cifra pero no autentica al
 * servidor: alguien capaz de interponerse en la red podría leer credenciales y
 * datos. Se avisa por consola para que no pase inadvertido.
 */
function construirSsl() {
  if (process.env.DB_SSL !== 'true') return false;

  const ca = process.env.DB_CA_CERT;
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }

  if (!globalThis.__dbSslWarned) {
    globalThis.__dbSslWarned = true;
    console.warn(
      '⚠️ DB_SSL=true sin DB_CA_CERT: la conexión a Postgres va cifrada pero NO se ' +
      'verifica el certificado del servidor. Define DB_CA_CERT con el certificado ' +
      'de tu proveedor para cerrar el riesgo de intercepción.'
    );
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: construirSsl(),
  max: 10,
  // Railway/proxies cierran conexiones TCP inactivas; si el pool las retiene
  // demasiado, devuelve sockets muertos que fallan con ECONNRESET en el primer
  // uso. Reciclamos las conexiones idle agresivamente y activamos keepAlive
  // para que el SO detecte y descarte sockets caídos.
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  // Recicla cada conexión tras N usos para evitar acumular sockets longevos
  // que el proxy remoto pudo haber cerrado por su cuenta.
  maxUses: 7500,
  allowExitOnIdle: false
});

// ¿Es un error transitorio de red/arranque de Postgres por el que vale la pena
// reintentar? (sockets reseteados por el proxy, DB iniciando, etc.)
const TRANSIENT_NET_CODES = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'];
const TRANSIENT_PG_CODES = ['57P03', '57P02', '57P01'];

export function isTransientDbError(error) {
  return (
    TRANSIENT_NET_CODES.includes(error?.code) ||
    TRANSIENT_PG_CODES.includes(error?.code) ||
    /database system is starting up|the database system is shutting down|terminating connection|Connection terminated/i.test(error?.message || '')
  );
}

// ¿El fallo es «Postgres todavía no acepta conexiones» en vez de un socket
// caído? Se atienden de forma muy distinta (ver `crearPoliticaReintentos`).
function baseArrancando(error) {
  return (
    TRANSIENT_PG_CODES.includes(error?.code) ||
    /database system is starting up|shutting down/i.test(error?.message || '')
  );
}

// Cuánto se espera COMO MÁXIMO a que la base termine de arrancar. Railway duerme
// la instancia: la primera visita tras un rato de silencio la despierta, y
// Postgres tarda desde unos segundos hasta bastante más en aceptar conexiones.
// El esquema anterior (4 intentos con esperas de 1s+2s+3s) se rendía a los 6 s,
// así que un arranque perfectamente normal acababa en 503 y la página salía
// vacía con «the database system is starting up» en el log.
const PRESUPUESTO_ARRANQUE_MS = Number(process.env.DB_ARRANQUE_MS || 20000);
const ESPERA_ARRANQUE_MAX_MS = 3000;

/**
 * Política de reintentos de UNA operación. Devuelve cuántos ms esperar antes del
 * siguiente intento, o `null` si hay que rendirse y propagar el error.
 *
 * Son dos fallos con la misma pinta pero de naturaleza opuesta:
 *  - Socket muerto (ECONNRESET/EPIPE en una conexión que el pool creía viva): se
 *    arregla al instante con otra conexión, así que se reintenta rápido y pocas
 *    veces (150 ms · intento). Esperar un segundo aquí sólo alarga la respuesta.
 *  - Base arrancando (57P03): no hay nada que hacer salvo esperar, y el número
 *    de intentos es la medida equivocada. Aquí manda un PRESUPUESTO de tiempo,
 *    con espera creciente (0.5s, 1s, 2s, 3s, 3s…) hasta agotarlo.
 */
function crearPoliticaReintentos(intentosRapidosMax) {
  const inicio = Date.now();
  let intentosRapidos = 0;
  let esperaArranque = 500;

  return function siguienteEspera(error) {
    if (!isTransientDbError(error)) return null;

    if (baseArrancando(error)) {
      const restante = PRESUPUESTO_ARRANQUE_MS - (Date.now() - inicio);
      if (restante <= 0) return null;
      const espera = Math.min(esperaArranque, restante);
      esperaArranque = Math.min(esperaArranque * 2, ESPERA_ARRANQUE_MAX_MS);
      return espera;
    }

    intentosRapidos += 1;
    if (intentosRapidos >= intentosRapidosMax) return null;
    return 150 * intentosRapidos;
  };
}

// Manejo de errores de conexión.
//
// `pg` cuelga el objeto Client entero del error, así que imprimirlo tal cual
// vuelca ~80 líneas (credenciales de conexión incluidas) por cada socket que se
// cae. Cuando la base está caída eso pasa varias veces por segundo y tapa el
// resto del log, así que se resume a código + mensaje.
//
// Además, estos errores llegan de conexiones ociosas que el proxy cerró por su
// cuenta: el pool ya las descarta solo y el request en curso los reintenta, no
// hay ninguna acción pendiente. Se agrupan los repetidos dentro de una misma
// ventana para no repetir la misma línea decenas de veces.
let ultimoErrorPool = { clave: null, desde: 0, repeticiones: 0 };

pool.on('error', (err) => {
  const clave = `${err?.code || 'sin-codigo'}:${err?.message || ''}`;
  const ahora = Date.now();

  if (clave === ultimoErrorPool.clave && ahora - ultimoErrorPool.desde < 10000) {
    ultimoErrorPool.repeticiones++;
    return;
  }

  const omitidos = ultimoErrorPool.repeticiones;
  ultimoErrorPool = { clave, desde: ahora, repeticiones: 0 };

  console.error(
    `💥 Error en el pool de PostgreSQL: ${err?.code || 'sin código'} — ${err?.message || err}` +
    (omitidos > 0 ? ` (se omitieron ${omitidos} repeticiones del error anterior)` : '')
  );

  if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED') {
    console.error(
      `⚠️ No se llega a ${process.env.DB_HOST}:${process.env.DB_PORT}. Revisa DB_HOST/DB_PORT ` +
      'y que la base esté levantada.'
    );
  } else if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
    console.error(
      `⚠️ ${process.env.DB_HOST}:${process.env.DB_PORT} acepta la conexión TCP pero la corta sin ` +
      'responder. Suele ser el proxy del proveedor apuntando a una base apagada, dormida o ' +
      'recién redesplegada (host/puerto del proxy cambian al redesplegar).'
    );
  }
});

/**
 * Adquiere una conexión del pool reintentando ante errores transitorios.
 * Reemplaza a `pool.connect()` directo en los endpoints: Railway sirve a veces
 * sockets muertos que fallan con ECONNRESET al conectar/primer query.
 * Devuelve un client del pool — el caller DEBE hacer `client.release()`.
 */
export async function connectWithRetry(maxRetries = 3) {
  const siguienteEspera = crearPoliticaReintentos(maxRetries);
  let intento = 0;

  for (;;) {
    intento++;
    let client;
    try {
      client = await pool.connect();
      // Sanity check: una conexión "viva" del pool puede estar muerta a nivel TCP.
      // Un SELECT 1 barato detecta el socket reseteado AQUÍ (reintenta) en vez
      // de explotar más adelante a mitad de la lógica del endpoint.
      await client.query('SELECT 1');
      return client;
    } catch (error) {
      // Si el SELECT 1 falló, el client ya está tomado del pool: hay que
      // devolverlo DESTRUYÉNDOLO (release(true)), o el pool se queda sin slots
      // tras unos pocos fallos y además reparte otra vez el mismo socket muerto.
      if (client) {
        try { client.release(true); } catch { /* ya liberado */ }
      }
      // `null` = no es transitorio, o se acabó el presupuesto de espera.
      const espera = siguienteEspera(error);
      if (espera === null) throw error;
      console.warn(`⚠️ connectWithRetry intento ${intento} falló (${error.code || 'transient'}). Reintentando en ${espera}ms...`);
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }
}

// Construye el texto parametrizado a partir del template literal.
// Se numeran los placeholders sobre los valores REALMENTE enviados: antes el
// texto usaba `$${i + 1}` (índice del template) mientras que los values venían
// de un `.filter(v => v !== undefined)`, así que un undefined en medio dejaba
// el texto pidiendo $3 con sólo 2 parámetros y la query reventaba.
//
// Un `undefined` interpolado se rechaza en vez de omitirse: al saltarse el
// placeholder, el hueco quedaba VACÍO en el SQL (`WHERE publica =  AND ...`) y
// además corría la numeración de los parámetros siguientes, de modo que se
// ejecutaba una consulta distinta de la escrita y el error llegaba al cliente
// como un 500 opaco. Fallar aquí señala la línea del template. Para decir
// «NULL» hay que escribirlo: `${valor ?? null}`.
function buildQuery(strings, values) {
  let text = '';
  const params = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      if (values[i] === undefined) {
        throw new Error(
          `sql(): parámetro undefined en la posición ${i} del template. ` +
            'Usa `${valor ?? null}` si de verdad quieres enviar NULL.',
        );
      }
      params.push(values[i]);
      text += `$${params.length}`;
    }
  }
  return { text, values: params };
}

/**
 * Ejecuta una consulta reintentando los fallos transitorios, igual que `sql`
 * pero para consultas ya construidas (texto + parámetros) y devolviendo el
 * resultado COMPLETO de `pg` (con `rows` y `rowCount`).
 *
 * Es lo que hay que usar en lugar de `pool.query()` a secas: el proxy de
 * Railway reparte sockets que ya cerró (ECONNRESET al primer uso) y la base se
 * duerme, así que la primera consulta tras un rato de silencio falla con
 * ECONNRESET o con 57P03 "the database system is starting up". Sin reintento,
 * ese fallo se convertía en un 503 y la página salía vacía hasta que alguien
 * recargaba a mano.
 */
export async function query(text, values = []) {
  const consulta = typeof text === 'string' ? { text, values } : text;
  const siguienteEspera = crearPoliticaReintentos(4);
  let intento = 0;

  for (;;) {
    intento++;
    let client;
    let socketIsDead = false;
    try {
      client = await pool.connect();
      return await client.query(consulta);
    } catch (error) {
      // Un ECONNRESET/EPIPE significa que ESTE socket está muerto. Devolverlo
      // al pool con release() normal lo deja disponible para el siguiente
      // request, que vuelve a fallar igual — era la causa de que el error se
      // repitiera entre intentos y entre endpoints. release(true) lo destruye.
      socketIsDead = TRANSIENT_NET_CODES.includes(error?.code);

      // `null` = no es transitorio, o se acabó el presupuesto de espera.
      const espera = siguienteEspera(error);
      if (espera === null) throw error;

      console.warn(`⚠️ Intento ${intento} falló (${error.code || 'transient'}). Reintentando en ${espera}ms...`);
      if (client) {
        try { client.release(socketIsDead); } catch { /* ya liberado */ }
        client = null;
      }
      await new Promise(resolve => setTimeout(resolve, espera));
    } finally {
      if (client) client.release(socketIsDead);
    }
  }
}

// Consultas como template literal. Mismo reintento que `query`; devuelve filas.
export async function sql(strings, ...values) {
  const { rows } = await query(buildQuery(strings, values));
  return rows;
}

// Función para probar la conexión
export async function initializeDB() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('✅ Conexión a PostgreSQL establecida correctamente');
    return pool;
  } catch (error) {
    console.error('❌ Error al conectar con PostgreSQL:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export default pool;