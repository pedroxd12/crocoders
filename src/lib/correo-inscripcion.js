// Correo de confirmación de inscripción (evento o programa) con el ticket QR.
//
// Vivía entero dentro de /api/confirmation. Se saca a una lib porque ahora lo
// disparan DOS caminos: el cliente tras inscribirse (vía /api/confirmation,
// con el ticket firmado) y el registro manual del panel de administración
// (server-side, justo después del COMMIT).
//
// EQUIPOS: el ticket es UNO por inscripción, pero el correo va a TODAS las
// personas del equipo —integrantes y asesores con correo—, cada una con su
// nombre y su papel. Antes sólo lo recibía el capitán y el resto del equipo
// llegaba al evento sin ticket y sin saber que estaba inscrito.
//
// SEGURIDAD: el destinatario y el contenido salen SIEMPRE de la base de datos;
// lo único que entra de fuera es el ticket firmado (HMAC con PAYLOAD_SECRET).

import { toDataURL } from 'qrcode';
import { sql } from '@/lib/db-server';
import { formatearDiasSemana } from '@/lib/programas-fechas';
import {
  sendMail,
  escapeHtml,
  institutionalFrom,
  isSingleEmailAddress,
  mailIsConfigured,
} from '@/lib/mailer';

const CID_QR = 'uniquexqr@crocoders';

function formatearFecha(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(fecha ?? '');
  return d.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Las columnas DATE llegan del driver como Date en UTC: se recorta al día para
// no imprimir el día anterior (misma regla que src/lib/fechas.js).
function formatearDia(fecha) {
  if (fecha instanceof Date) return formatearFecha(fecha.toISOString().slice(0, 10));
  return formatearFecha(String(fecha ?? '').slice(0, 10));
}

function formatearHora(hora) {
  if (!hora) return '--:--';
  const [h, m] = String(hora).split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  if (Number.isNaN(d.getTime())) return String(hora);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Adjunto PNG del QR (o null si la generación falla: el correo sale sin él). */
async function adjuntoQR(qrToken) {
  try {
    const qrDataUrl = await toDataURL(qrToken, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return {
      filename: 'ticket-qr.png',
      content: Buffer.from(qrDataUrl.split(';base64,').pop(), 'base64'),
      cid: CID_QR,
    };
  } catch (e) {
    console.error('[confirmacion] Error generando el QR:', e.message);
    return null;
  }
}

function envolverHtml(nombre, cuerpo) {
  return `
      <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
          <h1 style="color: #1ef184; margin: 0;">Club Crocoders</h1>
        </div>
        <div style="padding: 25px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; border: 1px solid #e1e1e1;">
          <h2 style="color: #1a1a1a; margin-top: 0;">¡Hola ${nombre}!</h2>
          ${cuerpo}
          <p style="font-size: 14px; color: #666;">Si tienes alguna pregunta, contáctanos respondiendo a este correo.</p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
          <p>© ${new Date().getFullYear()} Club Crocoders. Todos los derechos reservados.</p>
        </div>
      </div>
    `;
}

function bloqueTicket(leyenda) {
  return `
          <div style="text-align: center; margin: 30px 0; padding: 20px; background: white; border-radius: 10px; border: 2px dashed #1ef184;">
            <p style="margin-top: 0; font-weight: bold; color: #333;">TU TICKET DE ACCESO</p>
            <img src="cid:${CID_QR}" alt="Código QR de acceso" style="width: 200px; height: 200px;" />
            <p style="margin-bottom: 0; font-size: 12px; color: #888;">${leyenda}</p>
          </div>
          `;
}

const ETIQUETA_ROL = {
  participante: null,
  capitan: 'como capitán del equipo',
  integrante: 'como integrante del equipo',
  asesor: 'como asesor del equipo',
};

/**
 * Personas a las que va el correo de una inscripción de evento. Devuelve una
 * lista deduplicada por correo (una persona no recibe dos copias aunque
 * aparezca como integrante y como asesor).
 */
async function destinatariosEvento(inscripcion) {
  if (!inscripcion.id_equipo) {
    return [{
      email: inscripcion.destinatario_email,
      nombre: inscripcion.destinatario_nombre,
      rol: 'participante',
    }];
  }

  const integrantes = await sql`
    SELECT
      COALESCE(m.correo_electronico, i.correo_electronico) AS email,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', m.nombre, m.apellido_paterno)), ''),
        i.nombre_completo
      ) AS nombre,
      it.es_capitan
    FROM integrante_equipo it
    LEFT JOIN miembro m  ON m.id_miembro  = it.id_miembro
    LEFT JOIN invitado i ON i.id_invitado = it.id_invitado
    WHERE it.id_equipo = ${inscripcion.id_equipo}
    ORDER BY it.es_capitan DESC, it.id_integrante
  `;
  const asesores = await sql`
    SELECT correo AS email, nombre
      FROM asesor_equipo
     WHERE id_equipo = ${inscripcion.id_equipo} AND correo IS NOT NULL
     ORDER BY id_asesor
  `;

  const vistos = new Set();
  const lista = [];
  const agregar = (email, nombre, rol) => {
    const clave = String(email || '').trim().toLowerCase();
    if (!clave || vistos.has(clave)) return;
    vistos.add(clave);
    lista.push({ email: clave, nombre, rol });
  };
  for (const p of integrantes) agregar(p.email, p.nombre, p.es_capitan ? 'capitan' : 'integrante');
  for (const a of asesores) agregar(a.email, a.nombre, 'asesor');
  return lista;
}

/**
 * Envía la confirmación de una inscripción a un EVENTO a todas las personas
 * que le corresponden. `qrToken` es el ticket firmado de ESA inscripción.
 *
 * @returns {Promise<{ok: boolean, enviados: number, fallidos: number, destinatarios: number, motivo?: string}>}
 */
export async function enviarConfirmacionEvento({ inscripcionId, eventoId, qrToken }) {
  if (!mailIsConfigured()) {
    return { ok: false, enviados: 0, fallidos: 0, destinatarios: 0, motivo: 'correo no configurado' };
  }

  const [registro] = await sql`
    SELECT
      ie.id_equipo,
      e.nombre        AS nombre_evento,
      e.fecha_inicio, e.hora_inicio, e.hora_fin, e.ubicacion,
      e.tiene_costo, e.costo, e.instrucciones_pago,
      eq.nombre_equipo,
      r.titulo AS reto_titulo,
      ie.mesa,
      cp.estado AS comprobante_estado,
      COALESCE(m.correo_electronico, inv.correo_electronico) AS destinatario_email,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', m.nombre, m.apellido_paterno)), ''),
        inv.nombre_completo
      ) AS destinatario_nombre
    FROM inscripcion_evento ie
    JOIN evento e ON e.id_evento = ie.id_evento
    LEFT JOIN comprobante_pago cp ON cp.id_inscripcion = ie.id_inscripcion
    LEFT JOIN miembro m ON m.id_miembro = ie.id_miembro
    LEFT JOIN invitado inv ON inv.id_invitado = ie.id_invitado
    LEFT JOIN equipo_concurso eq ON eq.id_equipo = ie.id_equipo
    LEFT JOIN reto_evento r ON r.id_reto = ie.id_reto
    WHERE ie.id_inscripcion = ${inscripcionId}
      AND ie.id_evento = ${eventoId}
      AND ie.estado <> 'cancelada'
    LIMIT 1
  `;
  if (!registro) {
    return { ok: false, enviados: 0, fallidos: 0, destinatarios: 0, motivo: 'inscripción no encontrada' };
  }

  const destinatarios = (await destinatariosEvento(registro)).filter((d) => isSingleEmailAddress(d.email));
  if (destinatarios.length === 0) {
    return { ok: false, enviados: 0, fallidos: 0, destinatarios: 0, motivo: 'sin correos válidos' };
  }

  const esEquipo = Boolean(registro.id_equipo);
  const nombreEvento = escapeHtml(registro.nombre_evento);
  const fecha = escapeHtml(formatearDia(registro.fecha_inicio));
  const horaInicio = escapeHtml(formatearHora(registro.hora_inicio));
  const horaFin = escapeHtml(formatearHora(registro.hora_fin));
  const ubicacion = registro.ubicacion ? escapeHtml(registro.ubicacion) : null;
  const tieneCosto = registro.tiene_costo && Number(registro.costo) > 0;
  const costo = tieneCosto ? Number(registro.costo).toFixed(2) : null;
  const equipo = esEquipo ? escapeHtml(registro.nombre_equipo) : null;
  const reto = registro.reto_titulo ? escapeHtml(registro.reto_titulo) : null;
  const mesa = registro.mesa ? escapeHtml(registro.mesa) : null;

  const adjunto = await adjuntoQR(qrToken);
  const attachments = adjunto ? [adjunto] : [];

  // Evento con costo y pago sin validar: el correo lo dice y explica cómo
  // pagar, porque es el único aviso que le queda a un invitado sin cuenta.
  const pagoPendiente = tieneCosto && registro.comprobante_estado !== 'aprobado';
  const instrucciones = registro.instrucciones_pago
    ? escapeHtml(registro.instrucciones_pago).replace(/\n/g, '<br>')
    : null;
  const urlEvento = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/eventos/${eventoId}`
    : null;

  const bloquePago = pagoPendiente
    ? `
          <div style="background-color: #fff8e1; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #f0c36d;">
            <h3 style="margin-top: 0; color: #8a6d1a;">Falta validar ${esEquipo ? 'el pago del equipo' : 'tu pago'}</h3>
            <p style="margin: 0 0 10px;">${esEquipo ? 'El lugar del equipo queda' : 'Tu lugar queda'} apartado hasta que confirmemos el pago de $${costo} MXN.</p>
            ${instrucciones ? `<p style="margin: 0 0 10px;">${instrucciones}</p>` : ''}
            <p style="margin: 0;">
              ${registro.comprobante_estado === 'pendiente'
                ? 'Ya recibimos el comprobante: lo estamos revisando.'
                : registro.comprobante_estado === 'rechazado'
                  ? 'El comprobante fue rechazado; hay que subir uno nuevo desde la página del evento.'
                  : `${esEquipo ? 'El capitán debe subir' : 'Sube'} una imagen del comprobante desde la página del evento.`}
              ${urlEvento ? `<br><a href="${urlEvento}">Ir a la página del evento</a>` : ''}
            </p>
          </div>`
    : '';

  const detalles = `
          <div style="background-color: white; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e1e1e1;">
            <h3 style="margin-top: 0; color: #1a1a1a;">Detalles del evento:</h3>
            <p><strong>Fecha:</strong> ${fecha}</p>
            <p><strong>Hora:</strong> ${horaInicio} - ${horaFin}</p>
            ${ubicacion ? `<p><strong>Ubicación:</strong> ${ubicacion}</p>` : ''}
            ${equipo ? `<p><strong>Equipo:</strong> ${equipo}</p>` : ''}
            ${reto ? `<p><strong>Desafío:</strong> ${reto}</p>` : ''}
            ${mesa ? `<p><strong>Mesa:</strong> ${mesa}</p>` : ''}
            ${costo ? `<p><strong>Costo:</strong> $${costo} MXN` + (esEquipo ? ' (por equipo)' : '') + '</p>' : '<p><strong>Entrada:</strong> GRATUITA</p>'}
          </div>`;

  const leyendaTicket = esEquipo
    ? 'Es el ticket del equipo: preséntenlo en la entrada y el staff registrará la llegada de cada integrante.'
    : 'Presenta este código en la entrada';

  let enviados = 0;
  let fallidos = 0;

  const resultados = await Promise.allSettled(destinatarios.map(async (d) => {
    const nombre = escapeHtml(d.nombre || 'participante');
    const papel = ETIQUETA_ROL[d.rol];
    const intro = esEquipo
      ? `<p>Tu equipo <strong>${equipo}</strong> quedó inscrito en <strong>${nombreEvento}</strong>${papel ? ` y tú apareces ${papel}` : ''}.</p>`
      : `<p>Tu registro para el evento <strong>${nombreEvento}</strong> ha sido exitoso.</p>`;

    const html = envolverHtml(nombre, `
          ${intro}
          ${detalles}
          ${bloquePago}
          ${attachments.length ? bloqueTicket(leyendaTicket) : ''}
          <p style="font-size: 14px; color: #666;">Recibirás un recordatorio un día antes del evento.</p>
      `);

    const texto = [
      `Hola ${d.nombre || 'participante'},`,
      '',
      esEquipo
        ? `Tu equipo "${registro.nombre_equipo}" quedó inscrito en "${registro.nombre_evento}"${papel ? ` y tú apareces ${papel}` : ''}.`
        : `Tu registro para el evento "${registro.nombre_evento}" ha sido exitoso.`,
      '',
      'Detalles:',
      `Fecha: ${formatearDia(registro.fecha_inicio)}`,
      `Hora: ${formatearHora(registro.hora_inicio)} - ${formatearHora(registro.hora_fin)}`,
      registro.ubicacion ? `Ubicación: ${registro.ubicacion}` : null,
      registro.reto_titulo ? `Desafío: ${registro.reto_titulo}` : null,
      registro.mesa ? `Mesa: ${registro.mesa}` : null,
      costo ? `Costo: $${costo} MXN` : 'Entrada: GRATUITA',
      pagoPendiente ? '' : null,
      pagoPendiente ? 'Falta validar el pago: el lugar queda apartado hasta que lo confirmemos.' : null,
      pagoPendiente && registro.instrucciones_pago ? registro.instrucciones_pago : null,
      pagoPendiente && urlEvento ? urlEvento : null,
      attachments.length ? (esEquipo ? 'Se adjunta el código QR de acceso del equipo.' : 'Se adjunta tu código QR de acceso.') : null,
      '',
      'Saludos,',
      'Club Crocoders',
    ].filter((linea) => linea !== null).join('\n');

    await sendMail({
      from: institutionalFrom(),
      to: d.email,
      subject: `Confirmación de registro: ${registro.nombre_evento}`,
      html,
      text: texto,
      attachments,
    }, { timeoutMs: 30000 });
  }));

  for (const r of resultados) {
    if (r.status === 'fulfilled') enviados += 1;
    else {
      fallidos += 1;
      console.error('[confirmacion] Fallo al enviar a un destinatario:', r.reason?.message);
    }
  }

  return { ok: enviados > 0, enviados, fallidos, destinatarios: destinatarios.length };
}

/**
 * Confirmación de inscripción a un PROGRAMA (una sola persona).
 */
export async function enviarConfirmacionPrograma({ inscripcionId, programaId, qrToken }) {
  if (!mailIsConfigured()) {
    return { ok: false, enviados: 0, fallidos: 0, destinatarios: 0, motivo: 'correo no configurado' };
  }

  const [registro] = await sql`
    SELECT
      p.nombre AS nombre_programa,
      p.fecha_inicio, p.fecha_fin, p.hora_inicio, p.hora_fin,
      p.ubicacion, p.dias_semana,
      ip.mesa,
      COALESCE(m.correo_electronico, i.correo_electronico) AS destinatario_email,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', m.nombre, m.apellido_paterno)), ''),
        i.nombre_completo
      ) AS destinatario_nombre
    FROM inscripcion_programa ip
    JOIN programa_recurrente p ON p.id_programa = ip.id_programa
    LEFT JOIN miembro m  ON m.id_miembro = ip.id_miembro
    LEFT JOIN invitado i ON i.id_invitado = ip.id_invitado
    WHERE ip.id_inscripcion_programa = ${inscripcionId}
      AND ip.id_programa = ${programaId}
      AND ip.estado <> 'cancelada'
    LIMIT 1
  `;

  if (!registro || !isSingleEmailAddress(registro.destinatario_email)) {
    return { ok: false, enviados: 0, fallidos: 0, destinatarios: 0, motivo: 'inscripción o correo no válidos' };
  }

  const nombre = escapeHtml(registro.destinatario_nombre || 'participante');
  const nombrePrograma = escapeHtml(registro.nombre_programa);
  const inicio = escapeHtml(formatearDia(registro.fecha_inicio));
  const fin = escapeHtml(formatearDia(registro.fecha_fin));
  const dias = formatearDiasSemana(registro.dias_semana);
  const horario = registro.hora_inicio
    ? `${formatearHora(registro.hora_inicio)} - ${formatearHora(registro.hora_fin)}`
    : null;
  const ubicacion = registro.ubicacion ? escapeHtml(registro.ubicacion) : null;
  const mesa = registro.mesa ? escapeHtml(registro.mesa) : null;

  const adjunto = await adjuntoQR(qrToken);
  const attachments = adjunto ? [adjunto] : [];

  const html = envolverHtml(nombre, `
          <p>Tu inscripción al programa <strong>${nombrePrograma}</strong> ha sido exitosa.</p>

          <div style="background-color: white; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e1e1e1;">
            <h3 style="margin-top: 0; color: #1a1a1a;">Detalles del programa:</h3>
            <p><strong>Periodo:</strong> del ${inicio} al ${fin}</p>
            ${dias ? `<p><strong>Días:</strong> ${escapeHtml(dias)}</p>` : ''}
            ${horario ? `<p><strong>Horario:</strong> ${escapeHtml(horario)}</p>` : ''}
            ${ubicacion ? `<p><strong>Ubicación:</strong> ${ubicacion}</p>` : ''}
            ${mesa ? `<p><strong>Mesa:</strong> ${mesa}</p>` : ''}
          </div>

          ${attachments.length ? bloqueTicket('Presenta este código al llegar a cada sesión') : ''}

          <p style="font-size: 14px; color: #666;">Guarda este correo: el mismo código te sirve durante todo el programa.</p>
    `);

  const texto = [
    `Hola ${registro.destinatario_nombre || 'participante'},`,
    '',
    `Tu inscripción al programa "${registro.nombre_programa}" ha sido exitosa.`,
    '',
    'Detalles:',
    `Periodo: del ${formatearDia(registro.fecha_inicio)} al ${formatearDia(registro.fecha_fin)}`,
    dias ? `Días: ${dias}` : null,
    horario ? `Horario: ${horario}` : null,
    registro.ubicacion ? `Ubicación: ${registro.ubicacion}` : null,
    registro.mesa ? `Mesa: ${registro.mesa}` : null,
    attachments.length ? 'Se adjunta tu código QR: preséntalo al llegar a cada sesión.' : null,
    '',
    'Saludos,',
    'Club Crocoders',
  ].filter((linea) => linea !== null).join('\n');

  try {
    await sendMail({
      from: institutionalFrom(),
      to: registro.destinatario_email,
      subject: `Confirmación de inscripción: ${registro.nombre_programa}`,
      html,
      text: texto,
      attachments,
    }, { timeoutMs: 30000 });
    return { ok: true, enviados: 1, fallidos: 0, destinatarios: 1 };
  } catch (error) {
    console.error('[confirmacion] Fallo al enviar la confirmación de programa:', error.message);
    return { ok: false, enviados: 0, fallidos: 1, destinatarios: 1 };
  }
}
