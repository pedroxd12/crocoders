import { NextResponse } from 'next/server';
import pool, { sql, connectWithRetry } from '@/lib/db-server';
import jwt from 'jsonwebtoken';
import { limpiarUsuario } from '@/lib/plataformas';

function verifyAuth(request) {
  const token = request.cookies.get('token')?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

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
    carrera: u.carrera,
    usuario_codeforces: platsMap['Codeforces'] || null,
    usuario_vjudge: platsMap['VJudge'] || null,
    usuario_omegaup: platsMap['OmegaUp'] || null,
  };
}

export async function GET(request) {
  const decoded = verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }

  const client = await connectWithRetry();
  try {
    const user = await readProfile(client, decoded.id);
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

export async function PUT(request) {
  const decoded = verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');

    // Solo las columnas que se usan abajo: un `SELECT *` traería también el
    // hash de la contraseña a memoria sin ninguna necesidad.
    const currentRes = await client.query(
      `SELECT nombre, apellido_paterno, apellido_materno, numero_telefono,
              semestre_actual, id_carrera
         FROM miembro WHERE id_miembro = $1 FOR UPDATE`,
      [decoded.id],
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
      } else if (partes.length === 1 && partes[0]) {
        nuevoNombre = partes[0];
        nuevoApellidoP = '.';
      }
    }

    let idCarrera = currentUser.id_carrera;
    if (data.carrera) {
      const carreraRes = await client.query(
        `SELECT id_carrera FROM catalogo_carrera WHERE nombre ILIKE $1 OR codigo ILIKE $1`,
        [data.carrera],
      );
      if (carreraRes.rows.length > 0) idCarrera = carreraRes.rows[0].id_carrera;
    }

    await client.query(
      `UPDATE miembro SET
          nombre = $1,
          apellido_paterno = $2,
          apellido_materno = $3,
          numero_telefono = $4,
          semestre_actual = $5,
          id_carrera = $6,
          updated_at = NOW()
        WHERE id_miembro = $7`,
      [
        nuevoNombre,
        nuevoApellidoP,
        nuevoApellidoM,
        data.numero_telefono !== undefined ? data.numero_telefono : currentUser.numero_telefono,
        data.semestre !== undefined ? data.semestre : currentUser.semestre_actual,
        idCarrera,
        decoded.id,
      ],
    );

    const invalidas = [
      await updatePlatformInTx(client, decoded.id, 'Codeforces', data.usuario_codeforces),
      await updatePlatformInTx(client, decoded.id, 'VJudge', data.usuario_vjudge),
      await updatePlatformInTx(client, decoded.id, 'OmegaUp', data.usuario_omegaup),
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

    const user = await readProfile(client, decoded.id);
    return NextResponse.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      user,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error al actualizar perfil:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar el perfil' }, { status: 500 });
  } finally {
    client.release();
  }
}
