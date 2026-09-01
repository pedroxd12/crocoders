import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { authRegisterSchema, parseOrError } from '@/lib/validation';
import { limpiarUsuario } from '@/lib/plataformas';
import { rateLimit } from '@/lib/rate-limit';

// Nombres de constraint de la BD que sabemos traducir a un mensaje útil.
// Sin este mapeo, cualquier duplicado (correo, IEEE o handle de plataforma)
// terminaba en el catch genérico con un 500 "Intenta de nuevo" que invitaba a
// reintentar eternamente sin decir qué campo estaba mal.
const MENSAJE_POR_CONSTRAINT = {
  miembro_correo_electronico_key: 'El correo electrónico ya está registrado',
  miembro_numero_ieee_key: 'Ese número IEEE ya está registrado',
  cuenta_plataforma_id_plataforma_usuario_key:
    'Uno de los nombres de usuario de plataforma ya está asociado a otra cuenta. Revisa Codeforces, VJudge y OmegaUp.',
};

export async function POST(request) {
  // Alta pública: sin límite, un script puede llenar la tabla `miembro` de
  // cuentas basura (y de paso crear carreras nuevas en el catálogo).
  const rl = rateLimit(request, { scope: 'register', limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados registros desde esta conexión. Intenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

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

  // La carrera llega como texto libre. Se colapsan los espacios repetidos y se
  // corta a los 100 caracteres de `catalogo_carrera.nombre` para que "ISC" e
  // "ISC  " no generen dos filas distintas ni revienten el INSERT.
  const carreraNombre = carrera.replace(/\s+/g, ' ').trim().slice(0, 100);

  try {
    const client = await connectWithRetry();

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

      // `numero_ieee` es UNIQUE: sin esta comprobación, repetir el número de un
      // compañero acababa en un 500 genérico.
      if (numero_ieee) {
        const ieeeRes = await client.query(
          'SELECT 1 FROM miembro WHERE numero_ieee = $1 LIMIT 1',
          [numero_ieee]
        );
        if (ieeeRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { success: false, error: 'Ese número IEEE ya está registrado' },
            { status: 409 }
          );
        }
      }

      // 2. Obtener IDs de catálogos necesarios

      // Carrera: comparación EXACTA insensible a mayúsculas. Antes se usaba
      // ILIKE con el texto del usuario, así que un '%' o un '_' escritos en el
      // campo actuaban como comodines y asignaban una carrera cualquiera.
      // Se buscan también las inactivas (las propuestas desde este formulario
      // entran así) para no crear la misma carrera una y otra vez, pero una
      // coincidencia activa siempre gana.
      let idCarrera;
      const carreraRes = await client.query(
        `SELECT id_carrera FROM catalogo_carrera
         WHERE lower(nombre) = lower($1) OR lower(codigo) = lower($1)
         ORDER BY activo DESC, id_carrera ASC
         LIMIT 1`,
        [carreraNombre]
      );

      if (carreraRes.rows.length > 0) {
        idCarrera = carreraRes.rows[0].id_carrera;
      } else {
        // Generar un código único basado en iniciales + sufijo aleatorio,
        // reintentando si hay colisión con la constraint UNIQUE.
        const baseCodigo = carreraNombre.replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase() || 'CAR';
        const { randomBytes } = await import('crypto');
        let inserted = false;
        let lastErr;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
            const codigoGenerado = `${baseCodigo}${randomBytes(2).toString('hex').toUpperCase()}`;
            try {
                // El SAVEPOINT es imprescindible: estamos DENTRO de una
                // transacción y en Postgres un INSERT fallido la deja abortada,
                // así que el siguiente intento moría con 25P02
                // ("current transaction is aborted") y el bucle de reintentos no
                // servía para nada. Con el punto de guardado sólo se deshace el
                // intento fallido.
                await client.query('SAVEPOINT alta_carrera');
                // `activo = false`: la carrera la propone un formulario público,
                // así que entra como pendiente de revisión y no contamina los
                // desplegables hasta que un administrador la apruebe.
                const nuevaCarreraRes = await client.query(
                    'INSERT INTO catalogo_carrera (nombre, codigo, activo) VALUES ($1, $2, false) RETURNING id_carrera',
                    [carreraNombre, codigoGenerado]
                );
                await client.query('RELEASE SAVEPOINT alta_carrera');
                idCarrera = nuevaCarreraRes.rows[0].id_carrera;
                inserted = true;
            } catch (err) {
                lastErr = err;
                try {
                    await client.query('ROLLBACK TO SAVEPOINT alta_carrera');
                } catch {
                    // La transacción ya no existe (conexión caída): se sale del
                    // bucle igualmente por el break de abajo o por el !inserted.
                    break;
                }
                // Solo reintentar si es violación de unique constraint (23505)
                if (err.code !== '23505') break;
            }
        }
        if (!inserted) {
            console.error('Error creando nueva carrera:', lastErr);
            // Guardado igual que el ROLLBACK del catch general: si la conexión ya
            // está rota, su excepción no debe tapar el mensaje útil de abajo.
            try {
              await client.query('ROLLBACK');
            } catch (errorRollback) {
              console.error('No se pudo deshacer la transacción de registro:', errorRollback.message);
            }
            // 22001 = el texto no cabe en la columna: es un dato del usuario,
            // no un fallo del servidor, y reintentar igual nunca funcionaría.
            if (lastErr?.code === '22001') {
              return NextResponse.json(
                { success: false, error: 'Carrera: el nombre es demasiado largo (máximo 100 caracteres)' },
                { status: 400 }
              );
            }
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
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

      // Calcular periodo ingreso. El servidor corre en UTC (Vercel), así que un
      // registro del 31 de julio por la tarde en México ya sería agosto y se
      // etiquetaría en el periodo equivocado: se pregunta el mes en la zona
      // horaria del club.
      const mesActual = Number(
        new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', month: 'numeric' })
      );
      const periodoIngreso = mesActual >= 1 && mesActual <= 7 ? 'enero-julio' : 'agosto-diciembre';

      // 4. Insertar miembro
      // NOTA: `semestre_ingreso` recibe el semestre actual porque el formulario
      // no pregunta en qué semestre entró la persona al club. Es un dato que
      // nace incorrecto para quien se inscribe en 6º; corregirlo requiere
      // preguntarlo en el formulario (o permitir NULL en la columna).
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
          // El schema ya lo dejó en null si no es de Computer Society; nunca ''
          // (la columna es UNIQUE y el segundo registro vacío chocaría).
          numero_ieee || null
        ]
      );

      const nuevoIdMiembro = nuevoMiembroRes.rows[0].id_miembro;

      // 5. Insertar cuentas de plataformas
      const cuentasAInsertar = [
        { nombre: 'Codeforces', usuario: usuario_codeforces },
        { nombre: 'OmegaUp', usuario: usuario_omegaup },
        { nombre: 'VJudge', usuario: usuario_vjudge }
      ];

      // `cuenta_plataforma` tiene UNIQUE (id_plataforma, usuario): si el handle
      // ya es de otro miembro hay que decir CUÁL, no devolver un 500 mudo.
      const handlesOcupados = [];

      for (const cuenta of cuentasAInsertar) {
        // Los handles son opcionales (sólo el club necesita al menos uno) y el
        // schema ya rechazó los de formato imposible; aquí sólo se normalizan.
        const usuarioLimpio = limpiarUsuario(cuenta.nombre, cuenta.usuario);
        if (!usuarioLimpio || !plataformasMap[cuenta.nombre]) continue;

        const ocupado = await client.query(
          'SELECT 1 FROM cuenta_plataforma WHERE id_plataforma = $1 AND usuario = $2 LIMIT 1',
          [plataformasMap[cuenta.nombre], usuarioLimpio]
        );
        if (ocupado.rows.length > 0) {
          handlesOcupados.push(cuenta.nombre);
          continue;
        }

        await client.query(
          `INSERT INTO cuenta_plataforma (id_miembro, id_plataforma, usuario, activo, estado_sync)
           VALUES ($1, $2, $3, true, 'pendiente')`,
          [nuevoIdMiembro, plataformasMap[cuenta.nombre], usuarioLimpio]
        );
      }

      if (handlesOcupados.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            success: false,
            error: `Estos nombres de usuario ya pertenecen a otra cuenta: ${handlesOcupados.join(', ')}. Revísalos e inténtalo de nuevo.`,
            plataformas_en_conflicto: handlesOcupados,
          },
          { status: 409 }
        );
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        message: 'Registro exitoso. Por favor inicie sesión.'
      });

    } catch (error) {
      // El ROLLBACK va en su propio try: si la conexión se cayó también falla, y
      // dejarlo desnudo hacía que su excepción sustituyera al error de verdad
      // (perdiendo, por ejemplo, el 23505 que sí sabemos traducir abajo).
      try {
        await client.query('ROLLBACK');
      } catch (errorRollback) {
        console.error('No se pudo deshacer la transacción de registro:', errorRollback.message);
      }
      console.error('Error interno en registro:', error);

      // Dos peticiones simultáneas con el mismo correo (o el mismo IEEE/handle)
      // pasan las comprobaciones previas y chocan aquí: es un error del dato,
      // no del servidor, y merece un mensaje concreto en vez de un 500.
      if (error.code === '23505') {
        const mensaje = MENSAJE_POR_CONSTRAINT[error.constraint];
        if (mensaje) {
          return NextResponse.json({ success: false, error: mensaje }, { status: 409 });
        }
      }

      // El mensaje interno (nombre de tabla/columna, constraint violada, texto
      // del driver de Postgres) queda solo en los logs del servidor.
      return NextResponse.json(
        { success: false, error: 'No se pudo completar el registro. Intenta de nuevo.' },
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
