// api/confirmation/route.js
// Envía el correo de confirmación de inscripción a un evento o a un programa.
//
// SEGURIDAD: este endpoint es público y envía correo desde la cuenta del club.
// Antes aceptaba `email`, `name` y `eventDetails` del cliente y los enviaba tal
// cual: cualquiera en internet podía usarlo como relay para mandar correos con
// contenido arbitrario a cualquier destinatario, firmados por Club Crocoders.
//
// Ahora lo único que se acepta del cliente es el `qrToken`, que va firmado con
// HMAC-SHA256 (PAYLOAD_SECRET) por /api/eventos/register o
// /api/programas/[id]/register. De ahí se obtiene el id de inscripción y TODOS
// los datos del correo —destinatario incluido— se leen de la base de datos. El
// cuerpo del mensaje no contiene nada que el cliente pueda controlar.
import { NextResponse } from 'next/server';
import { toDataURL } from 'qrcode';
import { sql } from '@/lib/db-server';
import { rateLimit } from '@/lib/rate-limit';
import { verificarQrToken, verificarQrTokenPrograma } from '@/lib/qr-token';
import { formatearDiasSemana } from '@/lib/programas-fechas';
import {
  sendMail,
  escapeHtml,
  institutionalFrom,
  isSingleEmailAddress,
  mailIsConfigured,
} from '@/lib/mailer';

// El token se emite justo antes de llamar aquí. Una ventana corta evita que un
// token filtrado sirva para bombardear el buzón del inscrito más tarde.
const TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
const TOKEN_FUTURE_SKEW_MS = 5 * 60 * 1000;

// Respuesta genérica: no se distingue "token inválido" de "no se pudo enviar",
// para no dar señal útil a quien sondee el endpoint.
function respuestaGenerica() {
  return NextResponse.json(
    { success: false, error: 'No se pudo enviar el correo de confirmación' },
    { status: 200 },
  );
}

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
  if (fecha instanceof Date) {
    const iso = fecha.toISOString().slice(0, 10);
    return formatearFecha(iso);
  }
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
      cid: 'uniquexqr@crocoders',
    };
  } catch (e) {
    console.error('[confirmation] Error generando el QR:', e.message);
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
            <img src="cid:uniquexqr@crocoders" alt="Código QR de acceso" style="width: 200px; height: 200px;" />
            <p style="margin-bottom: 0; font-size: 12px; color: #888;">${leyenda}</p>
          </div>
          `;
}

export async function POST(request) {
  // Aunque el token esté firmado, el envío cuesta una conexión SMTP: se limita
  // por IP para que nadie reenvíe en bucle.
  const rl = rateLimit(request, { scope: 'confirmation', limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
      { status: 429 },
    );
  }

  if (!mailIsConfigured()) {
    console.error('[confirmation] EMAIL_USER / EMAIL_PASSWORD no configurados');
    return respuestaGenerica();
  }

  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    console.error('[confirmation] PAYLOAD_SECRET no configurado');
    return respuestaGenerica();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400 });
  }

  // El mismo endpoint confirma eventos y programas: el payload del token dice
  // cuál es cuál (`eid` = evento, `pid` = programa).
  const payloadEvento = verificarQrToken(body?.qrToken, secret);
  const payloadPrograma = payloadEvento ? null : verificarQrTokenPrograma(body?.qrToken, secret);
  if (!payloadEvento && !payloadPrograma) return respuestaGenerica();

  const qrToken = body.qrToken;
  const { ts } = payloadEvento ?? payloadPrograma;

  const ahora = Date.now();
  if (ts > ahora + TOKEN_FUTURE_SKEW_MS || ahora - ts > TOKEN_MAX_AGE_MS) {
    return respuestaGenerica();
  }

  // Segundo límite, esta vez por inscripción y no por IP: aunque alguien rote
  // de IP, un mismo inscrito no puede recibir más de 3 correos por hora.
  const rlInscripcion = rateLimit(request, {
    key: payloadEvento
      ? `confirmation:inscripcion:${payloadEvento.id}`
      : `confirmation:inscripcion-programa:${payloadPrograma.id}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlInscripcion.allowed) return respuestaGenerica();

  try {
    if (payloadEvento) {
      const { id: inscripcionId, eid: eventoId } = payloadEvento;

      // Destinatario y contenido SIEMPRE desde la BD: para inscripciones de
      // equipo el correo va al capitán.
      const [registro] = await sql`
        SELECT
          e.nombre        AS nombre_evento,
          e.fecha_inicio, e.hora_inicio, e.hora_fin, e.ubicacion,
          e.tiene_costo, e.costo, e.instrucciones_pago,
          -- Comprobante de pago (migración 013): decide si el correo tiene que
          -- pedirlo. Sin esto el mensaje decía "registro exitoso" y nada más,
          -- aunque el lugar siguiera sin confirmar por falta de pago.
          cp.estado AS comprobante_estado,
          COALESCE(m.correo_electronico, inv.correo_electronico,
                   cm.correo_electronico, ci.correo_electronico) AS destinatario_email,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', m.nombre, m.apellido_paterno)), ''),
            inv.nombre_completo,
            NULLIF(TRIM(CONCAT_WS(' ', cm.nombre, cm.apellido_paterno)), ''),
            ci.nombre_completo
          ) AS destinatario_nombre
        FROM inscripcion_evento ie
        JOIN evento e            ON e.id_evento = ie.id_evento
        LEFT JOIN comprobante_pago cp ON cp.id_inscripcion = ie.id_inscripcion
        LEFT JOIN miembro m      ON m.id_miembro = ie.id_miembro
        LEFT JOIN invitado inv   ON inv.id_invitado = ie.id_invitado
        LEFT JOIN integrante_equipo cap
               ON cap.id_equipo = ie.id_equipo AND cap.es_capitan = true
        LEFT JOIN miembro cm     ON cm.id_miembro = cap.id_miembro
        LEFT JOIN invitado ci    ON ci.id_invitado = cap.id_invitado
        WHERE ie.id_inscripcion = ${inscripcionId}
          AND ie.id_evento      = ${eventoId}
          AND ie.estado <> 'cancelada'
        LIMIT 1
      `;

      if (!registro || !isSingleEmailAddress(registro.destinatario_email)) {
        return respuestaGenerica();
      }

      const nombre = escapeHtml(registro.destinatario_nombre || 'participante');
      const nombreEvento = escapeHtml(registro.nombre_evento);
      const fecha = escapeHtml(formatearFecha(registro.fecha_inicio));
      const horaInicio = escapeHtml(formatearHora(registro.hora_inicio));
      const horaFin = escapeHtml(formatearHora(registro.hora_fin));
      const ubicacion = registro.ubicacion ? escapeHtml(registro.ubicacion) : null;
      const tieneCosto = registro.tiene_costo && Number(registro.costo) > 0;
      const costo = tieneCosto ? Number(registro.costo).toFixed(2) : null;

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
            <h3 style="margin-top: 0; color: #8a6d1a;">Falta validar tu pago</h3>
            <p style="margin: 0 0 10px;">Tu lugar queda apartado hasta que confirmemos el pago de $${costo} MXN.</p>
            ${instrucciones ? `<p style="margin: 0 0 10px;">${instrucciones}</p>` : ''}
            <p style="margin: 0;">
              ${registro.comprobante_estado === 'pendiente'
                ? 'Ya recibimos tu comprobante: lo estamos revisando.'
                : registro.comprobante_estado === 'rechazado'
                  ? 'Tu comprobante fue rechazado; sube uno nuevo desde la página del evento.'
                  : 'Sube una imagen de tu comprobante desde la página del evento.'}
              ${urlEvento ? `<br><a href="${urlEvento}">Ir a la página del evento</a>` : ''}
            </p>
          </div>`
        : '';

      const html = envolverHtml(nombre, `
          <p>Tu registro para el evento <strong>${nombreEvento}</strong> ha sido exitoso.</p>

          <div style="background-color: white; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e1e1e1;">
            <h3 style="margin-top: 0; color: #1a1a1a;">Detalles del evento:</h3>
            <p><strong>Fecha:</strong> ${fecha}</p>
            <p><strong>Hora:</strong> ${horaInicio} - ${horaFin}</p>
            ${ubicacion ? `<p><strong>Ubicación:</strong> ${ubicacion}</p>` : ''}
            ${costo ? `<p><strong>Costo:</strong> $${costo} MXN</p>` : '<p><strong>Entrada:</strong> GRATUITA</p>'}
          </div>

          ${bloquePago}

          ${attachments.length ? bloqueTicket('Presenta este código en la entrada') : ''}

          <p style="font-size: 14px; color: #666;">Recibirás un recordatorio un día antes del evento.</p>
      `);

      const texto = [
        `Hola ${registro.destinatario_nombre || 'participante'},`,
        '',
        `Tu registro para el evento "${registro.nombre_evento}" ha sido exitoso.`,
        '',
        'Detalles:',
        `Fecha: ${formatearFecha(registro.fecha_inicio)}`,
        `Hora: ${formatearHora(registro.hora_inicio)} - ${formatearHora(registro.hora_fin)}`,
        registro.ubicacion ? `Ubicación: ${registro.ubicacion}` : null,
        costo ? `Costo: $${costo} MXN` : 'Entrada: GRATUITA',
        pagoPendiente ? '' : null,
        pagoPendiente ? 'Falta validar tu pago: tu lugar queda apartado hasta que lo confirmemos.' : null,
        pagoPendiente && registro.instrucciones_pago ? registro.instrucciones_pago : null,
        pagoPendiente
          ? (registro.comprobante_estado === 'pendiente'
              ? 'Ya recibimos tu comprobante: lo estamos revisando.'
              : 'Sube una imagen de tu comprobante desde la página del evento.')
          : null,
        pagoPendiente && urlEvento ? urlEvento : null,
        attachments.length ? 'Se adjunta tu código QR de acceso.' : null,
        '',
        'Saludos,',
        'Club Crocoders',
      ].filter((linea) => linea !== null).join('\n');

      await sendMail({
        from: institutionalFrom(),
        to: registro.destinatario_email,
        subject: `Confirmación de registro: ${registro.nombre_evento}`,
        html,
        text: texto,
        attachments,
      }, { timeoutMs: 30000 });

      return NextResponse.json({ success: true, message: 'Correo enviado exitosamente' });
    }

    // ── Programa ──────────────────────────────────────────────────────────
    const { id: inscripcionId, pid: programaId } = payloadPrograma;

    const [registro] = await sql`
      SELECT
        p.nombre AS nombre_programa,
        p.fecha_inicio, p.fecha_fin, p.hora_inicio, p.hora_fin,
        p.ubicacion, p.dias_semana,
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
      return respuestaGenerica();
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
      attachments.length ? 'Se adjunta tu código QR: preséntalo al llegar a cada sesión.' : null,
      '',
      'Saludos,',
      'Club Crocoders',
    ].filter((linea) => linea !== null).join('\n');

    await sendMail({
      from: institutionalFrom(),
      to: registro.destinatario_email,
      subject: `Confirmación de inscripción: ${registro.nombre_programa}`,
      html,
      text: texto,
      attachments,
    }, { timeoutMs: 30000 });

    return NextResponse.json({ success: true, message: 'Correo enviado exitosamente' });
  } catch (error) {
    console.error('[confirmation] Error al enviar el correo:', error.message);
    return respuestaGenerica();
  }
}
