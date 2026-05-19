import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { authRegisterSchema, parseOrError } from '@/lib/validation';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [data, errPayload] = parseOrError(authRegisterSchema, body);
  if (errPayload) {
    return NextResponse.json(errPayload, { status: 400 });
  }
  const {
    nombre,
    apellido_paterno,
    apellido_materno,
    correo_electronico,
    contrasena,
    numero_telefono,
    usuario_codeforces,
    usuario_vjudge,
    usuario_omegaup,
    semestre,
    carrera,
    es_computer_society,
    es_club_programacion,
    numero_ieee,
  } = data;

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Verificar si el usuario ya existe
      const existingUser = await client.query(
        'SELECT id_miembro FROM miembro WHERE correo_electronico = $1',
        [correo_electronico]
      );

      if (existingUser.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'El correo electrónico ya está registrado' },
          { status: 400 }
        );
      }

      // 2. Obtener IDs de catálogos necesarios
      
      // Carrera: buscar por nombre o código (case insensitive)
      let idCarrera;
      const carreraRes = await client.query(
        'SELECT id_carrera FROM catalogo_carrera WHERE nombre ILIKE $1 OR codigo ILIKE $1',
        [carrera]
      );
      
      if (carreraRes.rows.length > 0) {
        idCarrera = carreraRes.rows[0].id_carrera;
      } else {
        // Generar un código único basado en iniciales + sufijo aleatorio,
        // reintentando si hay colisión con la constraint UNIQUE.
        const baseCodigo = carrera.replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase() || 'CAR';
        const { randomBytes } = await import('crypto');
        let inserted = false;
        let lastErr;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
            const codigoGenerado = `${baseCodigo}${randomBytes(2).toString('hex').toUpperCase()}`;
            try {
                const nuevaCarreraRes = await client.query(
                    'INSERT INTO catalogo_carrera (nombre, codigo) VALUES ($1, $2) RETURNING id_carrera',
                    [carrera, codigoGenerado]
                );
                idCarrera = nuevaCarreraRes.rows[0].id_carrera;
                inserted = true;
            } catch (err) {
                lastErr = err;
                // Solo reintentar si es violación de unique constraint (23505)
                if (err.code !== '23505') break;
            }
        }
        if (!inserted) {
            console.error('Error creando nueva carrera:', lastErr);
            await client.query('ROLLBACK');
            return NextResponse.json(
                { success: false, error: 'Error al registrar la nueva carrera. Intente nuevamente.' },
                { status: 500 }
            );
        }
      }

      // Plataformas
      const plataformasRes = await client.query(
        'SELECT id_plataforma, nombre FROM catalogo_plataforma WHERE nombre IN (\'Codeforces\', \'OmegaUp\', \'VJudge\')'
      );
      
      const plataformasMap = {};
      plataformasRes.rows.forEach(p => {
        plataformasMap[p.nombre] = p.id_plataforma;
      });

      // 3. Preparar datos del miembro
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
      
      // Calcular periodo ingreso
      const mesActual = new Date().getMonth() + 1;
      const periodoIngreso = mesActual >= 1 && mesActual <= 7 ? 'enero-julio' : 'agosto-diciembre';

      // 4. Insertar miembro
      const nuevoMiembroRes = await client.query(
        `INSERT INTO miembro (
          nombre,
          apellido_paterno,
          apellido_materno,
          correo_electronico,
          contrasena,
          numero_telefono,
          id_carrera,
          semestre_ingreso,
          semestre_actual,
          periodo_ingreso,
          estado,
          rol,
          es_club_programacion,
          es_computer_society,
          numero_ieee
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'activo', 'usuario', $11, $12, $13)
        RETURNING id_miembro, nombre, apellido_paterno, correo_electronico, rol`,
        [
          nombre, 
          apellido_paterno,
          apellido_materno || null,
          correo_electronico, 
          hashedPassword, 
          numero_telefono, 
          idCarrera,
          semestre, 
          semestre,
          periodoIngreso,
          es_club_programacion || false,
          es_computer_society || false,
          es_computer_society ? numero_ieee : null
        ]
      );
      
      const nuevoIdMiembro = nuevoMiembroRes.rows[0].id_miembro;

      // 5. Insertar cuentas de plataformas
      const cuentasAInsertar = [
        { nombre: 'Codeforces', usuario: usuario_codeforces },
        { nombre: 'OmegaUp', usuario: usuario_omegaup },
        { nombre: 'VJudge', usuario: usuario_vjudge }
      ];

      for (const cuenta of cuentasAInsertar) {
        if (cuenta.usuario && plataformasMap[cuenta.nombre]) {
          await client.query(
            `INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario, activo)
             VALUES ($1, $2, $3, true)`,
            [nuevoIdMiembro, plataformasMap[cuenta.nombre], cuenta.usuario]
          );
        }
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        message: 'Registro exitoso. Por favor inicie sesión.'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error interno en registro:', error);
      return NextResponse.json(
        { success: false, error: 'Error al registrar usuario: ' + error.message },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error general en registro:', error);
    return NextResponse.json(
      { success: false, error: 'Error en el servidor' },
      { status: 500 }
    );
  }
}
