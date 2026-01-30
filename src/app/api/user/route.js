import { NextResponse } from 'next/server';
import db from '@/lib/db-server'; // Importa el cliente de base de datos desde db-server.js
import jwt from 'jsonwebtoken';

export async function GET(request) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Obtener datos básicos del usuario
    const userQuery = await db.query(
      `SELECT id_miembro, nombre_completo, correo_electronico, numero_telefono, tipo as role
       FROM miembro 
       WHERE id_miembro = $1`,
      [decoded.id]
    );

    if (userQuery.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const user = userQuery.rows[0];

    // Obtener perfiles en plataformas
    const codeforcesQuery = await db.query(
      `SELECT usuario FROM codeforces WHERE id_miembro = $1`,
      [decoded.id]
    );
    const vjudgeQuery = await db.query(
      `SELECT usuario FROM vjudge WHERE id_miembro = $1`,
      [decoded.id]
    );
    const omegaupQuery = await db.query(
      `SELECT usuario FROM omegaup WHERE id_miembro = $1`,
      [decoded.id]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: user.id_miembro,
        name: user.nombre_completo,
        email: user.correo_electronico,
        numero_telefono: user.numero_telefono,
        role: user.role,
        usuario_codeforces: codeforcesQuery.rows[0]?.usuario || null,
        usuario_vjudge: vjudgeQuery.rows[0]?.usuario || null,
        usuario_omegaup: omegaupQuery.rows[0]?.usuario || null
      }
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener el perfil' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const data = await request.json();

    // Iniciar una transacción
    await db.query('BEGIN');

    // Actualizar datos básicos
    await db.query(
      `UPDATE miembro SET
        nombre_completo = $1,
        numero_telefono = $2
       WHERE id_miembro = $3`,
      [data.nombre_completo, data.numero_telefono || null, decoded.id]
    );

    // Actualizar plataformas (usando UPSERT)
    if (data.usuario_codeforces !== undefined) {
      await db.query(
        `INSERT INTO codeforces (id_miembro, usuario)
         VALUES ($1, $2)
         ON CONFLICT (id_miembro) DO UPDATE
         SET usuario = $2`,
        [decoded.id, data.usuario_codeforces || null]
      );
    }

    if (data.usuario_vjudge !== undefined) {
      await db.query(
        `INSERT INTO vjudge (id_miembro, usuario)
         VALUES ($1, $2)
         ON CONFLICT (id_miembro) DO UPDATE
         SET usuario = $2`,
        [decoded.id, data.usuario_vjudge || null]
      );
    }

    if (data.usuario_omegaup !== undefined) {
      await db.query(
        `INSERT INTO omegaup (id_miembro, usuario)
         VALUES ($1, $2)
         ON CONFLICT (id_miembro) DO UPDATE
         SET usuario = $2`,
        [decoded.id, data.usuario_omegaup || null]
      );
    }

    // Confirmar la transacción
    await db.query('COMMIT');

    // Obtener los datos actualizados para devolverlos
    const [updatedUser] = await db.query(
      `SELECT nombre_completo, numero_telefono FROM miembro WHERE id_miembro = $1`,
      [decoded.id]
    );

    const codeforcesResult = await db.query(
      `SELECT usuario FROM codeforces WHERE id_miembro = $1`,
      [decoded.id]
    );
    const vjudgeResult = await db.query(
      `SELECT usuario FROM vjudge WHERE id_miembro = $1`,
      [decoded.id]
    );
    const omegaupResult = await db.query(
      `SELECT usuario FROM omegaup WHERE id_miembro = $1`,
      [decoded.id]
    );

    return NextResponse.json({ 
      success: true,
      message: 'Perfil actualizado correctamente',
      user: {
        name: updatedUser.nombre_completo,
        numero_telefono: updatedUser.numero_telefono,
        usuario_codeforces: codeforcesResult.rows[0]?.usuario || null,
        usuario_vjudge: vjudgeResult.rows[0]?.usuario || null,
        usuario_omegaup: omegaupResult.rows[0]?.usuario || null
      }
    });
  } catch (error) {
    // Revertir la transacción en caso de error
    await db.query('ROLLBACK');
    console.error('Error al actualizar perfil:', error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json(
        { success: false, error: 'Token inválido' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Error al actualizar el perfil' },
      { status: 500 }
    );
  }
}
