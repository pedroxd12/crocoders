import { NextResponse } from 'next/server';
import pool from '@/lib/db-server'; 
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
    const client = await pool.connect();
    
    try {
        // Obtener datos básicos del usuario y sus plataformas
        const query = `
          SELECT 
            m.id_miembro, 
            m.nombre,
            m.apellido_paterno,
            m.correo_electronico, 
            m.numero_telefono, 
            'usuario' as role, -- Mock role
            MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.usuario END) as usuario_codeforces,
            MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.usuario END) as usuario_vjudge,
            MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.usuario END) as usuario_omegaup
          FROM miembro m
          LEFT JOIN cuenta_plataforma cp ON m.id_miembro = cp.id_miembro
          LEFT JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
          WHERE m.id_miembro = $1
          GROUP BY m.id_miembro
        `;
        
        const userQuery = await client.query(query, [decoded.id]);

        if (userQuery.rows.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Usuario no encontrado' },
            { status: 404 }
          );
        }

        const user = userQuery.rows[0];

        return NextResponse.json({
          success: true,
          user: {
            id: user.id_miembro,
            name: `${user.nombre} ${user.apellido_paterno}`.trim(),
            email: user.correo_electronico,
            numero_telefono: user.numero_telefono,
            role: user.role,
            usuario_codeforces: user.usuario_codeforces || null,
            usuario_vjudge: user.usuario_vjudge || null,
            usuario_omegaup: user.usuario_omegaup || null
          }
        });
    } finally {
        client.release();
    }
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
    const client = await pool.connect();

    try {
        // Iniciar transacción
        await client.query('BEGIN');

        // Actualizar datos básicos
        if (data.nombre_completo || data.numero_telefono) {
            let nombre = undefined;
            let apellido = undefined;
            if (data.nombre_completo) {
                const parts = data.nombre_completo.split(' ');
                apellido = parts.length > 1 ? parts.pop() : '';
                nombre = parts.join(' ');
            }
            
            // Construir query dinámicamente o usar COALESCE
            // Preferimos update explícito
            if (nombre !== undefined) {
                 await client.query(
                    'UPDATE miembro SET nombre = $1, apellido_paterno = $2, numero_telefono = COALESCE($3, numero_telefono) WHERE id_miembro = $4',
                    [nombre, apellido, data.numero_telefono, decoded.id]
                 );
            } else if (data.numero_telefono) {
                 await client.query(
                    'UPDATE miembro SET numero_telefono = $1 WHERE id_miembro = $2',
                    [data.numero_telefono, decoded.id]
                 );
            }
        }

        // Helper para upsert plataforma
        const upsertPlataforma = async (nombrePlataforma, usuario) => {
            if (!usuario) return;
            
            // Buscar ID plataforma
            const platRes = await client.query('SELECT id_plataforma FROM catalogo_plataforma WHERE nombre = $1', [nombrePlataforma]);
            if (platRes.rows.length === 0) return;
            const idPlataforma = platRes.rows[0].id_plataforma;
            
            // Upsert
            await client.query(`
                INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario, activo)
                VALUES ($1, $2, $3, true)
                ON CONFLICT (id_miembro, id_plataforma) 
                DO UPDATE SET usuario = $3, ultima_actualizacion = NOW()
            `, [decoded.id, idPlataforma, usuario]);
        };

        if (data.usuario_codeforces !== undefined) await upsertPlataforma('Codeforces', data.usuario_codeforces);
        if (data.usuario_vjudge !== undefined) await upsertPlataforma('VJudge', data.usuario_vjudge);
        if (data.usuario_omegaup !== undefined) await upsertPlataforma('OmegaUp', data.usuario_omegaup);

        await client.query('COMMIT');

        // Devolver datos actualizados (reutilizando lógica GET simplificada)
        // O simplemente éxito
        return NextResponse.json({ success: true, message: 'Perfil actualizado' });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar perfil:', error);
        return NextResponse.json(
            { success: false, error: 'Error al actualizar el perfil' },
            { status: 500 }
        );
    } finally {
        client.release();
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error en el servidor' },
      { status: 500 }
    );
  }
}
