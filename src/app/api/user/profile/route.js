import { NextResponse } from 'next/server';
import pool, { sql } from '@/lib/db-server';
import jwt from 'jsonwebtoken';

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

  const client = await pool.connect();
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

async function updatePlatformInTx(client, idMiembro, pName, usuario) {
  if (usuario === undefined) return;

  const pRes = await client.query(
    `SELECT id_plataforma FROM catalogo_plataforma WHERE nombre = $1`,
    [pName],
  );
  if (pRes.rows.length === 0) return;
  const pid = pRes.rows[0].id_plataforma;

  const existing = await client.query(
    `SELECT id_cuenta FROM cuenta_plataforma WHERE id_miembro = $1 AND id_plataforma = $2`,
    [idMiembro, pid],
  );

  const trimmed = (usuario || '').trim();

  if (existing.rows.length > 0) {
    if (trimmed) {
      await client.query(
        `UPDATE cuenta_plataforma SET usuario = $1, activo = true WHERE id_cuenta = $2`,
        [trimmed, existing.rows[0].id_cuenta],
      );
    } else {
      await client.query(
        `UPDATE cuenta_plataforma SET usuario = '', activo = false WHERE id_cuenta = $1`,
        [existing.rows[0].id_cuenta],
      );
    }
  } else if (trimmed) {
    await client.query(
      `INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario) VALUES ($1, $2, $3)`,
      [idMiembro, pid, trimmed],
    );
  }
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT * FROM miembro WHERE id_miembro = $1 FOR UPDATE`,
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

    await updatePlatformInTx(client, decoded.id, 'Codeforces', data.usuario_codeforces);
    await updatePlatformInTx(client, decoded.id, 'VJudge', data.usuario_vjudge);
    await updatePlatformInTx(client, decoded.id, 'OmegaUp', data.usuario_omegaup);

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
