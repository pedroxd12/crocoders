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

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const userData = await sql`
      SELECT 
        m.id_miembro,
        m.nombre,
        m.apellido_paterno,
        m.apellido_materno,
        m.correo_electronico as email,
        m.numero_telefono,
        'usuario' as role,
        m.semestre_actual as semestre,
        c.nombre as carrera
      FROM miembro m
      LEFT JOIN catalogo_carrera c ON m.id_carrera = c.id_carrera
      WHERE m.id_miembro = ${decoded.id}
    `;

    if (!userData || userData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Obtener cuentas de plataformas
    const plataformasResult = await sql`
        SELECT p.nombre, cp.usuario
        FROM cuenta_plataforma cp
        JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
        WHERE cp.id_miembro = ${decoded.id} AND cp.activo = true
    `;
    
    const plataformasMap = {};
    plataformasResult.forEach(row => {
        plataformasMap[row.nombre] = row.usuario;
    });

    const user = userData[0];
    const nombreCompleto = `${user.nombre} ${user.apellido_paterno} ${user.apellido_materno || ''}`.trim();

    return NextResponse.json({
      success: true,
      user: {
        id: user.id_miembro,
        name: nombreCompleto,
        nombre_completo: nombreCompleto,
        email: user.email,
        numero_telefono: user.numero_telefono,
        role: user.role,
        semestre: user.semestre,
        carrera: user.carrera,
        usuario_codeforces: plataformasMap['Codeforces'] || null,
        usuario_vjudge: plataformasMap['VJudge'] || null,
        usuario_omegaup: plataformasMap['OmegaUp'] || null
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const data = await request.json();

    await sql`BEGIN`;

    try {
      // 1. Obtener usuario actual para conservar datos no enviados
      const currentRes = await sql`SELECT * FROM miembro WHERE id_miembro = ${decoded.id}`;
      if (currentRes.length === 0) throw new Error("Usuario no existe");
      const currentUser = currentRes[0];

      // 2. Preparar datos
      
      // Separar nombre si se proporciona
      let nuevoNombre = currentUser.nombre;
      let nuevoApellidoP = currentUser.apellido_paterno;
      let nuevoApellidoM = currentUser.apellido_materno;
      
      if (data.nombre_completo) {
          const partesNombre = data.nombre_completo.split(' ');
          if (partesNombre.length > 1) {
             nuevoApellidoP = partesNombre.pop();
             nuevoNombre = partesNombre.join(' ');
          } else {
             nuevoNombre = partesNombre[0];
             nuevoApellidoP = '.'; // Fallback
          }
      }

      // Resolver carrera si se proporciona
      let idCarrera = currentUser.id_carrera;
      if (data.carrera) {
          const carreraResult = await sql`
            SELECT id_carrera FROM catalogo_carrera 
            WHERE nombre ILIKE ${data.carrera} OR codigo ILIKE ${data.carrera}
          `;
          if (carreraResult.length > 0) {
              idCarrera = carreraResult[0].id_carrera;
          }
      }

      // Actualizar miembro
      await sql`
            UPDATE miembro SET
                nombre = ${nuevoNombre},
                apellido_paterno = ${nuevoApellidoP},
                apellido_materno = ${nuevoApellidoM},
                numero_telefono = ${data.numero_telefono !== undefined ? data.numero_telefono : currentUser.numero_telefono},
                semestre_actual = ${data.semestre !== undefined ? data.semestre : currentUser.semestre_actual},
                id_carrera = ${idCarrera},
                updated_at = NOW()
            WHERE id_miembro = ${decoded.id}
         `;

      // Actualizar plataformas
      const updatePlatform = async (pName, usuario) => {
          if (usuario === undefined) return; 
          
          const pRes = await sql`SELECT id_plataforma FROM catalogo_plataforma WHERE nombre = ${pName}`;
          if (pRes.length === 0) return;
          const pid = pRes[0].id_plataforma;

          const existing = await sql`
             SELECT id_cuenta FROM cuenta_plataforma 
             WHERE id_miembro = ${decoded.id} AND id_plataforma = ${pid}
          `;
          
          if (existing.length > 0) {
              if (usuario && usuario.trim() !== '') {
                   await sql`UPDATE cuenta_plataforma SET usuario = ${usuario}, activo = true, ultima_actualizacion = NOW() WHERE id_cuenta = ${existing[0].id_cuenta}`;
              } else {
                   await sql`UPDATE cuenta_plataforma SET usuario = '', activo = false, ultima_actualizacion = NOW() WHERE id_cuenta = ${existing[0].id_cuenta}`;
              }
          } else if (usuario && usuario.trim() !== '') {
              await sql`INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario) VALUES (${decoded.id}, ${pid}, ${usuario})`;
          }
      };

      await updatePlatform('Codeforces', data.usuario_codeforces);
      await updatePlatform('VJudge', data.usuario_vjudge);
      await updatePlatform('OmegaUp', data.usuario_omegaup);

      await sql`COMMIT`;

      // Return updated logic (Reuse GET logic parts)
      const updatedData = await sql`
        SELECT 
            m.id_miembro, m.nombre, m.apellido_paterno, m.apellido_materno, m.correo_electronico, m.numero_telefono, m.semestre_actual,
            c.nombre as carrera
        FROM miembro m
        LEFT JOIN catalogo_carrera c ON m.id_carrera = c.id_carrera
        WHERE m.id_miembro = ${decoded.id}
      `;
      
      const upUser = updatedData[0];
      const upNombreCompleto = `${upUser.nombre} ${upUser.apellido_paterno} ${upUser.apellido_materno || ''}`.trim();
      
      const upPlats = await sql`
        SELECT p.nombre, cp.usuario
        FROM cuenta_plataforma cp
        JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
        WHERE cp.id_miembro = ${decoded.id} AND cp.activo = true
      `;
      const upPlatsMap = {};
      upPlats.forEach(r => upPlatsMap[r.nombre] = r.usuario);

      return NextResponse.json({ 
        success: true,
        message: 'Perfil actualizado correctamente',
        user: {
          name: upNombreCompleto,
          nombre_completo: upNombreCompleto,
          numero_telefono: upUser.numero_telefono,
          semestre: upUser.semestre_actual,
          carrera: upUser.carrera,
          usuario_codeforces: upPlatsMap['Codeforces'] || null,
          usuario_vjudge: upPlatsMap['VJudge'] || null,
          usuario_omegaup: upPlatsMap['OmegaUp'] || null
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