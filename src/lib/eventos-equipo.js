// Lógica COMPARTIDA del registro de equipos a un concurso. La usan el flujo
// público (/api/eventos/register, donde el capitán es el miembro autenticado
// que registra) y el registro manual del panel admin
// (/api/admin/eventos/register, donde un admin inscribe al equipo en nombre de
// otros). Antes vivía inline en la ruta pública y el panel admin no tenía
// ninguna vía para inscribir equipos: el modal de "registrar manualmente" sólo
// sabía dar de alta a una persona suelta, incluso en concursos por equipos.

import { TALLAS_PLAYERA } from '@/lib/registro-campos';

// Errores de reglas de negocio (no fallos del servidor): el mensaje está
// redactado para mostrarse tal cual al usuario. Las rutas lo convierten en 400.
export class ValidationError extends Error {}

// Mismo catálogo que el CHECK de asesor_equipo (migración 011).
const TALLAS_VALIDAS = new Set(TALLAS_PLAYERA);

/**
 * Valida el payload del equipo contra la configuración del concurso y resuelve
 * cada integrante a un miembro o invitado existente (por correo).
 *
 * `evento` debe traer: permite_equipos, id_concurso, modalidad,
 * min_integrantes_equipo, max_integrantes_equipo, requiere_asesor,
 * max_asesores y solicitar_talla (ambas rutas los seleccionan con el mismo
 * JOIN de evento + catalogo_tipo_evento + concurso).
 *
 * `capitanId`: id del miembro autenticado que registra (flujo público). Exige
 * que forme parte del equipo y lo marca capitán. Con null (registro por un
 * admin) el capitán es el integrante marcado `es_capitan` o, en su defecto, el
 * primer integrante que sea miembro del club, o el primero de la lista.
 *
 * Devuelve { integrantesResueltos, asesores, lugaresSolicitados } listos para
 * `insertarEquipo`. Lanza ValidationError si algo no cumple.
 */
export async function resolverEquipo(
  client,
  evento,
  { equipo, integrantes, asesores: asesoresCrudos },
  { capitanId = null } = {},
) {
  // Se descartan las filas de asesor completamente vacías (el formulario
  // siempre pinta al menos una).
  const asesores = (Array.isArray(asesoresCrudos) ? asesoresCrudos : [])
    .filter((a) => a && (a.nombre || a.email || a.telefono));

  if (!evento.permite_equipos) throw new ValidationError('Este evento no permite registro por equipos.');
  if (!evento.id_concurso) throw new ValidationError('Configuración de concurso no encontrada para este evento.');
  // La modalidad del concurso manda sobre el flag del catálogo de tipos:
  // en 'individual' el esquema obliga a max_integrantes_equipo NULL, así
  // que sin esta comprobación entraban "equipos" de hasta 10 personas.
  if (evento.modalidad !== 'equipos') {
    throw new ValidationError('Este concurso es de modalidad individual; no admite registro por equipos.');
  }
  if (!equipo?.nombre) throw new ValidationError('Nombre del equipo requerido.');
  if (!integrantes || integrantes.length === 0) throw new ValidationError('Se requiere al menos un integrante.');
  if (evento.min_integrantes_equipo && integrantes.length < evento.min_integrantes_equipo) {
    throw new ValidationError(`El mínimo de integrantes por equipo es ${evento.min_integrantes_equipo}.`);
  }
  // Tope duro aunque el concurso no lo configure, para no depender de un NULL.
  const maxIntegrantes = evento.max_integrantes_equipo || 5;
  if (integrantes.length > maxIntegrantes) {
    throw new ValidationError(`El máximo de integrantes por equipo es ${maxIntegrantes}.`);
  }
  if (evento.requiere_asesor && (!asesores[0]?.nombre || !asesores[0]?.email)) {
    throw new ValidationError('Datos del asesor requeridos.');
  }
  // Tope de asesores configurado en el concurso (1 por defecto).
  const maxAsesores = Number(evento.max_asesores) || 1;
  if (asesores.length > maxAsesores) {
    throw new ValidationError(`Este concurso admite como máximo ${maxAsesores} asesor(es) por equipo.`);
  }
  // Un asesor a medias (sólo teléfono, sin nombre) no sirve para contactarlo.
  if (asesores.some((a) => !a.nombre)) {
    throw new ValidationError('Cada asesor registrado debe incluir al menos su nombre.');
  }
  // Evento con playera/kit: hace falta la talla de CADA integrante (el
  // formulario la pide; una petición directa sin tallas no debe colarse).
  if (evento.solicitar_talla && integrantes.some((i) => !i.talla_playera)) {
    throw new ValidationError('Este evento requiere la talla de playera de cada integrante del equipo.');
  }
  // Al asesor también se le entrega playera (el escáner deja marcarla), así que
  // su talla se pide igual. Se valida sólo la forma: que falte no bloquea el
  // registro —el asesor a veces se confirma después— pero un valor inventado sí.
  if (asesores.some((a) => a.talla_playera && !TALLAS_VALIDAS.has(a.talla_playera))) {
    throw new ValidationError('La talla de playera del asesor no es válida.');
  }

  // Correos únicos: repetir uno creaba dos filas en integrante_equipo para
  // la misma persona y consumía dos lugares.
  const correos = integrantes.map((i) => String(i.email || '').trim().toLowerCase());
  if (correos.some((c) => !c)) throw new ValidationError('Todos los integrantes deben indicar su correo.');
  if (new Set(correos).size !== correos.length) {
    throw new ValidationError('Hay correos repetidos entre los integrantes del equipo.');
  }

  // 1) Resolver TODOS los integrantes antes de escribir nada: quién es
  //    miembro y quién es un invitado que ya existe.
  const miembrosRes = await client.query(
    `SELECT id_miembro, LOWER(correo_electronico) AS correo
       FROM miembro
      WHERE LOWER(correo_electronico) = ANY($1::text[]) AND deleted_at IS NULL`,
    [correos],
  );
  const porCorreoMiembro = new Map(miembrosRes.rows.map((r) => [r.correo, r.id_miembro]));

  const invitadosRes = await client.query(
    `SELECT id_invitado, LOWER(correo_electronico) AS correo
       FROM invitado
      WHERE LOWER(correo_electronico) = ANY($1::text[])`,
    [correos],
  );
  const porCorreoInvitado = new Map(invitadosRes.rows.map((r) => [r.correo, r.id_invitado]));

  const integrantesResueltos = integrantes.map((integrante, i) => ({
    datos: integrante,
    correo: correos[i],
    idMiembro: porCorreoMiembro.get(correos[i]) ?? null,
    idInvitado: porCorreoMiembro.has(correos[i]) ? null : (porCorreoInvitado.get(correos[i]) ?? null),
    esCapitan: false,
  }));

  // 2) Capitán. Ningún equipo puede quedarse sin uno: sin capitán nadie puede
  //    darlo de baja y el correo de confirmación se queda sin destinatario.
  const capitanesMarcados = integrantesResueltos.filter((r) => r.datos.es_capitan);
  if (capitanesMarcados.length > 1) throw new ValidationError('El equipo sólo puede tener un capitán.');

  if (capitanId != null) {
    // Flujo público: el capitán tiene que ser quien está registrando el
    // equipo. Así nadie inscribe a terceros a su nombre.
    const yo = integrantesResueltos.find((r) => r.idMiembro === capitanId);
    if (!yo) {
      throw new ValidationError('Debes formar parte del equipo que registras: incluye tu propio correo entre los integrantes.');
    }
    if (capitanesMarcados.length === 1 && capitanesMarcados[0] !== yo) {
      throw new ValidationError('El capitán del equipo debe ser quien realiza el registro.');
    }
    yo.esCapitan = true;
  } else {
    // Registro por un admin en nombre del equipo: capitán = el marcado o, en
    // su defecto, el primer miembro del club (tiene cuenta y puede gestionar
    // la inscripción) o el primer integrante.
    const capitan = capitanesMarcados[0]
      || integrantesResueltos.find((r) => r.idMiembro)
      || integrantesResueltos[0];
    capitan.esCapitan = true;
  }

  // 3) Ningún integrante puede estar ya inscrito (ni por su cuenta ni en
  //    otro equipo): antes la misma persona ocupaba dos o tres lugares.
  const idsMiembro = integrantesResueltos.map((r) => r.idMiembro).filter(Boolean);
  const idsInvitado = integrantesResueltos.map((r) => r.idInvitado).filter(Boolean);
  if (idsMiembro.length > 0 || idsInvitado.length > 0) {
    const yaRes = await client.query(
      `SELECT ie.id_miembro AS ins_miembro, ie.id_invitado AS ins_invitado,
              int_eq.id_miembro AS eq_miembro, int_eq.id_invitado AS eq_invitado
         FROM inscripcion_evento ie
         LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
         LEFT JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
        WHERE ie.id_evento = $1
          AND ie.estado <> 'cancelada'
          AND (ie.id_miembro = ANY($2::int[]) OR int_eq.id_miembro = ANY($2::int[])
            OR ie.id_invitado = ANY($3::int[]) OR int_eq.id_invitado = ANY($3::int[]))`,
      [evento.id_evento, idsMiembro, idsInvitado],
    );
    if (yaRes.rows.length > 0) {
      const miembrosOcupados = new Set();
      const invitadosOcupados = new Set();
      for (const fila of yaRes.rows) {
        if (fila.ins_miembro) miembrosOcupados.add(fila.ins_miembro);
        if (fila.eq_miembro) miembrosOcupados.add(fila.eq_miembro);
        if (fila.ins_invitado) invitadosOcupados.add(fila.ins_invitado);
        if (fila.eq_invitado) invitadosOcupados.add(fila.eq_invitado);
      }
      const enConflicto = integrantesResueltos
        .filter((r) => (r.idMiembro && miembrosOcupados.has(r.idMiembro))
                    || (r.idInvitado && invitadosOcupados.has(r.idInvitado)))
        .map((r) => r.correo);
      if (enConflicto.length > 0) {
        throw new ValidationError(`Ya hay integrantes inscritos en este evento: ${enConflicto.join(', ')}.`);
      }
    }
  }

  return {
    integrantesResueltos,
    asesores,
    // Lugares que consume esta inscripción (un equipo ocupa uno por integrante).
    lugaresSolicitados: integrantesResueltos.length,
  };
}

/**
 * Inserta equipo + asesores + integrantes + inscripción. Debe llamarse dentro
 * de la misma transacción que `resolverEquipo` y después de verificar cupos.
 * Devuelve el id_inscripcion creado.
 */
export async function insertarEquipo(
  client,
  { eventoId, idConcurso, equipo, asesores, integrantesResueltos, estadoInicial, requierePago },
) {
  // Las columnas *_asesor de equipo_concurso son LEGADAS (las lee el panel
  // de asistentes): se escribe ahí el primer asesor, y TODOS van además a
  // la tabla asesor_equipo (hasta concurso.max_asesores).
  const teamRes = await client.query(
    `INSERT INTO equipo_concurso (id_concurso, nombre_equipo, nombre_asesor, correo_asesor, telefono_asesor, registro_completo)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id_equipo`,
    [
      idConcurso,
      equipo.nombre,
      asesores[0]?.nombre || null,
      asesores[0]?.email || null,
      asesores[0]?.telefono || null,
    ],
  );
  const teamId = teamRes.rows[0].id_equipo;

  for (const a of asesores) {
    await client.query(
      'INSERT INTO asesor_equipo (id_equipo, nombre, correo, telefono, talla_playera) VALUES ($1, $2, $3, $4, $5)',
      [teamId, a.nombre, a.email || null, a.telefono || null, a.talla_playera || null],
    );
  }

  for (const r of integrantesResueltos) {
    const talla = r.datos.talla_playera || null;
    const numeroControl = r.datos.numero_control || null;

    // Los integrantes que no son miembros se dan de alta como invitados.
    if (!r.idMiembro && !r.idInvitado) {
      const guestRes = await client.query(
        `INSERT INTO invitado (nombre_completo, correo_electronico, numero_telefono, escuela_institucion, carrera, numero_control, semestre, talla_playera)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_invitado`,
        [
          r.datos.nombre,
          r.correo,
          r.datos.telefono || null,
          r.datos.institucion || null,
          r.datos.carrera || null,
          numeroControl,
          r.datos.semestre ? parseInt(r.datos.semestre) : null,
          talla,
        ],
      );
      r.idInvitado = guestRes.rows[0].id_invitado;
    } else if ((talla || numeroControl) && r.idInvitado) {
      // Invitado ya existente: quien registra trae los datos frescos (talla y
      // número de control cambian con el tiempo; el nuevo pisa al viejo, y un
      // hueco no borra lo guardado).
      await client.query(
        `UPDATE invitado
            SET talla_playera = COALESCE($1, talla_playera),
                numero_control = COALESCE($2, numero_control),
                updated_at = NOW()
          WHERE id_invitado = $3`,
        [talla, numeroControl, r.idInvitado],
      );
    } else if (talla && r.idMiembro) {
      // Miembro del club: sólo se RELLENA si no tiene talla guardada (quien
      // registra no debe poder pisar el dato que el propio miembro registró).
      await client.query(
        'UPDATE miembro SET talla_playera = COALESCE(talla_playera, $1) WHERE id_miembro = $2',
        [talla, r.idMiembro],
      );
    }

    await client.query(
      'INSERT INTO integrante_equipo (id_equipo, id_miembro, id_invitado, es_capitan) VALUES ($1, $2, $3, $4)',
      [teamId, r.idMiembro, r.idInvitado, r.esCapitan],
    );
  }

  const insRes = await client.query(
    `INSERT INTO inscripcion_evento (id_evento, id_equipo, estado, requiere_pago, fecha_inscripcion)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING id_inscripcion`,
    [eventoId, teamId, estadoInicial, requierePago],
  );
  return insRes.rows[0].id_inscripcion;
}
