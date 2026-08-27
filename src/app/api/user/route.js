import { NextResponse } from 'next/server';
import pool, { connectWithRetry } from '@/lib/db-server'; 
import jwt from 'jsonwebtoken';
import { limpiarUsuario } from '@/lib/plataformas';

export async function GET(request) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const client = await connectWithRetry();
    
    try {
        // Obtener datos básicos del usuario y sus plataformas
        const query = `
          SELECT 
            m.id_miembro, 
            m.nombre,
            m.apellido_paterno,
            m.correo_electronico, 
            m.numero_telefono, 
            m.rol as role,
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const data = await request.json();
    const client = await connectWithRetry();

    try {
        // Iniciar transacción
        await client.query('BEGIN');

        // Actualizar datos básicos
        if (data.nombre_completo || data.numero_telefono) {
            let nombre = undefined;
            // apellido = null => conservar el apellido_paterno actual (vía COALESCE).
            // Antes, un nombre de una sola palabra ponía apellido_paterno = '' y
            // borraba el apellido existente del miembro.
            let apellido = null;
            if (data.nombre_completo) {
                const parts = String(data.nombre_completo).trim().split(/\s+/);
                if (parts.length > 1) {
                    apellido = parts.pop();
                    nombre = parts.join(' ');
                } else if (parts[0]) {
                    nombre = parts[0]; // una sola palabra: actualizar nombre, conservar apellido
                }
            }

            if (nombre !== undefined) {
                 await client.query(
                    'UPDATE miembro SET nombre = $1, apellido_paterno = COALESCE($2, apellido_paterno), numero_telefono = COALESCE($3, numero_telefono), updated_at = NOW() WHERE id_miembro = $4',
                    [nombre, apellido, data.numero_telefono ?? null, decoded.id]
                 );
            } else if (data.numero_telefono) {
                 await client.query(
                    'UPDATE miembro SET numero_telefono = $1, updated_at = NOW() WHERE id_miembro = $2',
                    [data.numero_telefono, decoded.id]
                 );
            }
        }

        // Helper para upsert plataforma
        const upsertPlataforma = async (nombrePlataforma, usuario) => {
            // Se normaliza (acepta la URL del perfil) y se descarta lo que no
            // pueda ser un handle real: si no, la tabla de posiciones acaba
            // consultando valores como "No tengo" en cada sincronización.
            const limpio = limpiarUsuario(nombrePlataforma, usuario);
            if (!limpio) return;

            // Buscar ID plataforma
            const platRes = await client.query('SELECT id_plataforma FROM catalogo_plataforma WHERE nombre = $1', [nombrePlataforma]);
            if (platRes.rows.length === 0) return;
            const idPlataforma = platRes.rows[0].id_plataforma;

            // Upsert. Si el handle cambió, las estadísticas del anterior dejan de
            // aplicar: se reinician y la cuenta se vuelve a sincronizar.
            await client.query(`
                INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario, activo, estado_sync)
                VALUES ($1, $2, $3, true, 'pendiente')
                ON CONFLICT (id_miembro, id_plataforma)
                DO UPDATE SET
                    usuario = EXCLUDED.usuario,
                    activo = true,
                    problemas_resueltos_total = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN 0 ELSE cuenta_plataforma.problemas_resueltos_total END,
                    problema_mas_dificil      = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.problema_mas_dificil END,
                    rating                    = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.rating END,
                    rating_usuario            = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.rating_usuario END,
                    rank_usuario              = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.rank_usuario END,
                    avatar_url                = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.avatar_url END,
                    ultima_actualizacion      = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.ultima_actualizacion END,
                    ultimo_intento            = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN NULL ELSE cuenta_plataforma.ultimo_intento END,
                    estado_sync               = CASE WHEN cuenta_plataforma.usuario IS DISTINCT FROM EXCLUDED.usuario THEN 'pendiente' ELSE cuenta_plataforma.estado_sync END
            `, [decoded.id, idPlataforma, limpio]);
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
