import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
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

    const userData = await sql`
      SELECT 
        m.id_miembro,
        m.nombre_completo,
        m.correo_electronico as email,
        m.numero_telefono,
        m.tipo as role,
        m.semestre,
        m.carrera,
        cf.usuario as usuario_codeforces,
        vj.usuario as usuario_vjudge,
        ou.usuario as usuario_omegaup
      FROM miembro m
      LEFT JOIN codeforces cf ON m.id_miembro = cf.id_miembro
      LEFT JOIN vjudge vj ON m.id_miembro = vj.id_miembro
      LEFT JOIN omegaup ou ON m.id_miembro = ou.id_miembro
      WHERE m.id_miembro = ${decoded.id}
    `;

    if (!userData || userData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const user = userData[0];

    return NextResponse.json({
      success: true,
      user: {
        id: user.id_miembro,
        name: user.nombre_completo,
        nombre_completo: user.nombre_completo,
        email: user.email,
        numero_telefono: user.numero_telefono,
        role: user.role,
        semestre: user.semestre,
        carrera: user.carrera,
        usuario_codeforces: user.usuario_codeforces || null,
        usuario_vjudge: user.usuario_vjudge || null,
        usuario_omegaup: user.usuario_omegaup || null
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

    await sql`BEGIN`;

    try {
      // Actualizar datos básicos
      await sql`
        UPDATE miembro SET
          nombre_completo = ${data.nombre_completo},
          numero_telefono = ${data.numero_telefono || null},
          semestre = ${data.semestre || null},
          carrera = ${data.carrera || null}
        WHERE id_miembro = ${decoded.id}
      `;

      // Actualizar plataformas
      if (data.usuario_codeforces !== undefined) {
        await sql`
          INSERT INTO codeforces (id_miembro, usuario)
          VALUES (${decoded.id}, ${data.usuario_codeforces || null})
          ON CONFLICT (id_miembro) DO UPDATE
          SET usuario = ${data.usuario_codeforces || null}
        `;
      }

      if (data.usuario_vjudge !== undefined) {
        await sql`
          INSERT INTO vjudge (id_miembro, usuario)
          VALUES (${decoded.id}, ${data.usuario_vjudge || null})
          ON CONFLICT (id_miembro) DO UPDATE
          SET usuario = ${data.usuario_vjudge || null}
        `;
      }

      if (data.usuario_omegaup !== undefined) {
        await sql`
          INSERT INTO omegaup (id_miembro, usuario)
          VALUES (${decoded.id}, ${data.usuario_omegaup || null})
          ON CONFLICT (id_miembro) DO UPDATE
          SET usuario = ${data.usuario_omegaup || null}
        `;
      }

      await sql`COMMIT`;

      // Obtener datos actualizados
      const updatedUser = await sql`
        SELECT 
          m.nombre_completo,
          m.numero_telefono,
          m.semestre,
          m.carrera,
          cf.usuario as usuario_codeforces,
          vj.usuario as usuario_vjudge,
          ou.usuario as usuario_omegaup
        FROM miembro m
        LEFT JOIN codeforces cf ON m.id_miembro = cf.id_miembro
        LEFT JOIN vjudge vj ON m.id_miembro = vj.id_miembro
        LEFT JOIN omegaup ou ON m.id_miembro = ou.id_miembro
        WHERE m.id_miembro = ${decoded.id}
      `;

      return NextResponse.json({ 
        success: true,
        message: 'Perfil actualizado correctamente',
        user: {
          name: updatedUser[0].nombre_completo,
          nombre_completo: updatedUser[0].nombre_completo,
          numero_telefono: updatedUser[0].numero_telefono,
          semestre: updatedUser[0].semestre,
          carrera: updatedUser[0].carrera,
          usuario_codeforces: updatedUser[0].usuario_codeforces || null,
          usuario_vjudge: updatedUser[0].usuario_vjudge || null,
          usuario_omegaup: updatedUser[0].usuario_omegaup || null
        }
      });
    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    return NextResponse.json(
      { success: false, error: 'Error al actualizar el perfil' },
      { status: 500 }
    );
  }
}