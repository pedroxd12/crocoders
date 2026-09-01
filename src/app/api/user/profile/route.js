import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { limpiarUsuario } from '@/lib/plataformas';

/**
 * Esquema de edición de perfil.
 *
 * Antes el PUT hacía `await request.json()` y escribía lo que llegara: un
 * semestre vacío ('') iba a una columna `integer NOT NULL` y un teléfono de 30
 * caracteres a un varchar(20). Postgres respondía 22P02 / 22001 y el catch
 * genérico lo convertía en un 500 "Error al actualizar el perfil" que además
 * hacía ROLLBACK del resto de campos correctos de la misma petición.
 *
 * Se define aquí (y no en src/lib/validation.js) para no colisionar con otros
 * cambios en curso sobre ese archivo; su sitio natural es junto a
 * authRegisterSchema, que valida exactamente los mismos campos en el registro.
 */
const perfilUpdateSchema = z.object({
  nombre_completo: z.string().trim().min(1, 'Escribe tu nombre').max(200, 'El nombre es demasiado largo').optional(),
  numero_telefono: z
    .union([
      z.literal(''),
      z.string().trim().regex(/^[0-9]{10,15}$/, 'El teléfono debe tener entre 10 y 15 dígitos'),
    ])
    .optional()
    .nullable(),
  semestre: z
    .union([
      z.literal(''),
      z.coerce.number().int().min(1, 'El semestre debe estar entre 1 y 14').max(14, 'El semestre debe estar entre 1 y 14'),
    ])
    .optional()
    .nullable(),
  // El formulario envía id_carrera (viene de /api/user/carreras); `carrera` se
  // mantiene por compatibilidad con clientes que aún mandan el nombre.
  id_carrera: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().nullable(),
  carrera: z.string().trim().max(150).optional().nullable(),
  usuario_codeforces: z.string().trim().max(100).optional().nullable(),
  usuario_vjudge: z.string().trim().max(100).optional().nullable(),
  usuario_omegaup: z.string().trim().max(100).optional().nullable(),
  es_club_programacion: z.boolean().optional(),
  es_computer_society: z.boolean().optional(),
  numero_ieee: z
    .union([z.literal(''), z.string().trim().regex(/^\d+$/, 'El número IEEE solo admite dígitos').max(20)])
    .optional()
    .nullable(),
});

async function readProfile(client, id) {
  const userRes = await client.query(
    `SELECT
        m.id_miembro,
        m.nombre,
        m.apellido_paterno,
        m.apellido_materno,
        m.correo_electronico AS email,
        m.numero_telefono,
        m.rol AS role,
        m.semestre_actual AS semestre,
        m.es_club_programacion,
        m.es_computer_society,
        m.numero_ieee,
        m.id_carrera,
        c.nombre AS carrera
      FROM miembro m
      LEFT JOIN catalogo_carrera c ON m.id_carrera = c.id_carrera
     WHERE m.id_miembro = $1`,
    [id],
  );
  if (userRes.rows.length === 0) return null;

  const platsRes = await client.query(
    `SELECT p.nombre, cp.usuario
       FROM cuenta_plataforma cp
       JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
      WHERE cp.id_miembro = $1 AND cp.activo = true`,
    [id],
  );
  const platsMap = {};
  for (const r of platsRes.rows) platsMap[r.nombre] = r.usuario;

  const u = userRes.rows[0];
  const nombreCompleto = `${u.nombre} ${u.apellido_paterno} ${u.apellido_materno || ''}`.trim();
  return {
    id: u.id_miembro,
    name: nombreCompleto,
    nombre_completo: nombreCompleto,
    email: u.email,
    numero_telefono: u.numero_telefono,
    role: u.role,
    semestre: u.semestre,
    id_carrera: u.id_carrera,
    carrera: u.carrera,
    // La afiliación se pedía obligatoriamente en el registro y luego
    // desaparecía del producto: quien entraba al capítulo después no tenía
    // ninguna forma de añadir su número IEEE salvo pedírselo a un admin.
    es_club_programacion: u.es_club_programacion,
    es_computer_society: u.es_computer_society,
    numero_ieee: u.numero_ieee,
    usuario_codeforces: platsMap['Codeforces'] || null,
    usuario_vjudge: platsMap['VJudge'] || null,
    usuario_omegaup: platsMap['OmegaUp'] || null,
  };
}

export async function GET(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  const client = await connectWithRetry();
  try {
    const user = await readProfile(client, userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener el perfil' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * Guarda el handle de una plataforma.
 *
 * Aquí se originaban buena parte de las inconsistencias de la tabla de
 * posiciones: sólo se hacía `.trim()`, así que entraban valores como
 * "No tengo " o "Zike 19" que después la sincronización intentaba consultar en
 * cada refresco. Ahora se normaliza (acepta que peguen la URL del perfil) y se
 * valida el formato; además, al cambiar de usuario se reinician las
 * estadísticas para que no se queden colgadas las del handle anterior.
 *
 * Devuelve el nombre de la plataforma si el valor era inválido, o null si todo
 * salió bien, para que el endpoint pueda avisar al usuario.
 */
async function updatePlatformInTx(client, idMiembro, pName, usuario) {
  if (usuario === undefined) return null;

  const pRes = await client.query(
    `SELECT id_plataforma FROM catalogo_plataforma WHERE nombre = $1`,
    [pName],
  );
  if (pRes.rows.length === 0) return null;
  const pid = pRes.rows[0].id_plataforma;

  const existing = await client.query(
    `SELECT id_cuenta, usuario FROM cuenta_plataforma WHERE id_miembro = $1 AND id_plataforma = $2`,
    [idMiembro, pid],
  );

  const enBruto = String(usuario ?? '').trim();
  const limpio = limpiarUsuario(pName, usuario);

  // Escribió algo, pero no puede ser un usuario de esa plataforma.
  if (enBruto && !limpio) return pName;

  if (existing.rows.length > 0) {
    const actual = existing.rows[0];
    if (limpio) {
      const cambió = actual.usuario !== limpio;
      await client.query(
        `UPDATE cuenta_plataforma
            SET usuario = $1,
                activo = true,
                -- Al cambiar de handle los números viejos ya no aplican: se
                -- ponen a cero y se marca la cuenta para resincronizar.
                problemas_resueltos_total = CASE WHEN $3 THEN 0 ELSE problemas_resueltos_total END,
                problema_mas_dificil      = CASE WHEN $3 THEN NULL ELSE problema_mas_dificil END,
                rating                    = CASE WHEN $3 THEN NULL ELSE rating END,
                rating_usuario            = CASE WHEN $3 THEN NULL ELSE rating_usuario END,
                rank_usuario              = CASE WHEN $3 THEN NULL ELSE rank_usuario END,
                avatar_url                = CASE WHEN $3 THEN NULL ELSE avatar_url END,
                estado_sync               = CASE WHEN $3 THEN 'pendiente' ELSE estado_sync END,
                ultimo_intento            = CASE WHEN $3 THEN NULL ELSE ultimo_intento END,
                ultima_actualizacion      = CASE WHEN $3 THEN NULL ELSE ultima_actualizacion END
          WHERE id_cuenta = $2`,
        [limpio, actual.id_cuenta, cambió],
      );
    } else {
      // Sólo se desactiva. Ponerlo en '' rompía la restricción UNIQUE
      // (id_plataforma, usuario) en cuanto un segundo miembro borraba su
      // usuario de la misma plataforma. Las consultas ya filtran por `activo`,
      // así que desactivar basta para que desaparezca del perfil y del ranking.
      await client.query(
        `UPDATE cuenta_plataforma
            SET activo = false, estado_sync = 'pendiente'
          WHERE id_cuenta = $1`,
        [actual.id_cuenta],
      );
    }
  } else if (limpio) {
    await client.query(
      `INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario, estado_sync)
       VALUES ($1, $2, $3, 'pendiente')`,
      [idMiembro, pid, limpio],
    );
  }

  return null;
}

/** Corta la transacción devolviendo un 400 que dice QUÉ campo está mal. */
async function abortar(client, error, campo) {
  try { await client.query('ROLLBACK'); } catch {}
  return NextResponse.json({ success: false, error, campo }, { status: 400 });
}

export async function PUT(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  let bruto;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const parsed = perfilUpdateSchema.safeParse(bruto);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: issue?.message || 'Datos inválidos',
        campo: issue?.path?.join('.') || undefined,
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');

    // Solo las columnas que se usan abajo: un `SELECT *` traería también el
    // hash de la contraseña a memoria sin ninguna necesidad.
    const currentRes = await client.query(
      `SELECT nombre, apellido_paterno, apellido_materno, numero_telefono,
              semestre_actual, id_carrera, es_club_programacion,
              es_computer_society, numero_ieee
         FROM miembro WHERE id_miembro = $1 FOR UPDATE`,
      [userId],
    );
    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 });
    }
    const currentUser = currentRes.rows[0];

    let nuevoNombre = currentUser.nombre;
    let nuevoApellidoP = currentUser.apellido_paterno;
    const nuevoApellidoM = currentUser.apellido_materno;

    if (data.nombre_completo) {
      const partes = String(data.nombre_completo).trim().split(/\s+/);
      if (partes.length > 1) {
        nuevoApellidoP = partes.pop();
        nuevoNombre = partes.join(' ');
      } else {
        // Una sola palabra: antes se escribía '.' como apellido (la columna es
        // NOT NULL) y ese punto salía luego en el saludo, en el sidebar y en
        // las listas de asistentes: "Madonna .". Se conserva el apellido que ya
        // estaba en la ficha.
        nuevoNombre = partes[0];
      }
    }

    // ---- Carrera -----------------------------------------------------------
    let idCarrera = currentUser.id_carrera;
    if (data.id_carrera !== undefined && data.id_carrera !== null && data.id_carrera !== '') {
      const porId = await client.query(
        `SELECT id_carrera FROM catalogo_carrera WHERE id_carrera = $1`,
        [data.id_carrera],
      );
      if (porId.rows.length === 0) {
        return abortar(client, 'La carrera seleccionada ya no existe', 'id_carrera');
      }
      idCarrera = porId.rows[0].id_carrera;
    } else if (data.carrera) {
      // Comparación insensible a acentos: ILIKE ignora mayúsculas pero no
      // tildes, así que "Ingeniería en Electronica" nunca casaba con la fila
      // real "Ingeniería en Electrónica" y el cambio se perdía en silencio.
      const ACENTOS = 'áéíóúüñÁÉÍÓÚÜÑ';
      const SIN_ACENTOS = 'aeiouunAEIOUUN';
      const carreraRes = await client.query(
        `SELECT id_carrera FROM catalogo_carrera
          WHERE lower(translate(nombre, $2, $3)) = lower(translate($1, $2, $3))
             OR lower(codigo) = lower($1)
          LIMIT 1`,
        [data.carrera, ACENTOS, SIN_ACENTOS],
      );
      if (carreraRes.rows.length === 0) {
        // Antes esto se ignoraba y se respondía "Perfil actualizado
        // correctamente" con la carrera sin cambiar.
        return abortar(client, 'No reconocemos esa carrera', 'carrera');
      }
      idCarrera = carreraRes.rows[0].id_carrera;
    }

    // ---- Semestre y teléfono ----------------------------------------------
    let semestre = currentUser.semestre_actual;
    if (data.semestre !== undefined && data.semestre !== null && data.semestre !== '') {
      semestre = Number(data.semestre);
    }

    let telefono = currentUser.numero_telefono;
    if (data.numero_telefono !== undefined) {
      // Cadena vacía = el usuario quiere borrarlo; la columna admite NULL.
      telefono = data.numero_telefono === '' || data.numero_telefono === null ? null : data.numero_telefono;
    }

    // ---- Afiliación e IEEE -------------------------------------------------
    const esClub = data.es_club_programacion ?? currentUser.es_club_programacion;
    const esCS = data.es_computer_society ?? currentUser.es_computer_society;

    let numeroIeee = currentUser.numero_ieee;
    if (data.numero_ieee !== undefined) {
      // NUNCA cadena vacía: numero_ieee es UNIQUE y el segundo miembro que
      // guardara '' rompería la restricción. Sin número, NULL.
      numeroIeee = data.numero_ieee === '' || data.numero_ieee === null ? null : String(data.numero_ieee).trim();
    }

    if (!esClub && !esCS) {
      return abortar(client, 'Debes pertenecer al menos al club o al capítulo', 'es_club_programacion');
    }
    if (esCS && !numeroIeee) {
      // Es también el CHECK numero_ieee_required_cs de la tabla: mejor avisar
      // que dejar que Postgres devuelva un 23514 opaco.
      return abortar(client, 'El número IEEE es obligatorio para Computer Society', 'numero_ieee');
    }

    await client.query(
      `UPDATE miembro SET
          nombre = $1,
          apellido_paterno = $2,
          apellido_materno = $3,
          numero_telefono = $4,
          semestre_actual = $5,
          id_carrera = $6,
          es_club_programacion = $7,
          es_computer_society = $8,
          numero_ieee = $9,
          updated_at = NOW()
        WHERE id_miembro = $10`,
      [
        nuevoNombre,
        nuevoApellidoP,
        nuevoApellidoM,
        telefono,
        semestre,
        idCarrera,
        esClub,
        esCS,
        numeroIeee,
        userId,
      ],
    );

    const invalidas = [
      await updatePlatformInTx(client, userId, 'Codeforces', data.usuario_codeforces),
      await updatePlatformInTx(client, userId, 'VJudge', data.usuario_vjudge),
      await updatePlatformInTx(client, userId, 'OmegaUp', data.usuario_omegaup),
    ].filter(Boolean);

    // Si algún handle no tiene formato válido no se guarda nada: es preferible
    // avisar a dejar en la BD un usuario que nunca va a resolver.
    if (invalidas.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        {
          success: false,
          error: `Usuario inválido para ${invalidas.join(', ')}. Escribe tu nombre de usuario (o la URL de tu perfil), sin espacios.`,
        },
        { status: 400 },
      );
    }

    await client.query('COMMIT');

    const user = await readProfile(client, userId);
    return NextResponse.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      user,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error al actualizar perfil:', error);

    // Las violaciones de restricción son culpa del dato enviado, no del
    // servidor: devolver 500 dejaba al usuario sin ninguna pista de qué campo
    // corregir. El detalle de Postgres se queda en el log.
    // 23505 lo pueden lanzar DOS restricciones distintas de esta transacción:
    // `miembro_numero_ieee_key` y `cuenta_plataforma_id_plataforma_usuario_key`
    // (otro miembro ya reclamó ese handle). Sin distinguirlas, quien escribía un
    // usuario de Codeforces ya tomado recibía "Ese número IEEE ya está
    // registrado", un mensaje sobre un campo que ni siquiera había tocado.
    if (error.code === '23505') {
      if (error.constraint === 'cuenta_plataforma_id_plataforma_usuario_key') {
        return NextResponse.json(
          {
            success: false,
            error: 'Ese usuario de plataforma ya está vinculado a otra cuenta. Si es tuyo, escríbenos para liberarlo.',
          },
          { status: 409 },
        );
      }
      if (error.constraint === 'miembro_numero_ieee_key') {
        return NextResponse.json(
          { success: false, error: 'Ese número IEEE ya está registrado por otro miembro', campo: 'numero_ieee' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'Alguno de los datos ya está registrado por otro miembro' },
        { status: 409 },
      );
    }
    if (error.code === '23514' || error.code === '22P02' || error.code === '22001') {
      return NextResponse.json(
        { success: false, error: 'Algún dato no tiene el formato esperado. Revisa el teléfono, el semestre y el número IEEE.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: false, error: 'Error al actualizar el perfil' }, { status: 500 });
  } finally {
    client.release();
  }
}
