// api/confirmation/route.js
// Dispara el correo de confirmación de inscripción a un evento o a un programa.
//
// SEGURIDAD: este endpoint es público y envía correo desde la cuenta del club.
// Antes aceptaba `email`, `name` y `eventDetails` del cliente y los enviaba tal
// cual: cualquiera en internet podía usarlo como relay para mandar correos con
// contenido arbitrario a cualquier destinatario, firmados por Club Crocoders.
//
// Ahora lo único que se acepta del cliente es el `qrToken`, que va firmado con
// HMAC-SHA256 (PAYLOAD_SECRET) por /api/eventos/register o
// /api/programas/[id]/register. De ahí se obtiene el id de inscripción y TODOS
// los datos del correo —destinatarios incluidos— se leen de la base de datos
// (src/lib/correo-inscripcion.js). En inscripciones de equipo el mismo ticket
// se manda a cada integrante y asesor.
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { verificarQrToken, verificarQrTokenPrograma } from '@/lib/qr-token';
import { mailIsConfigured } from '@/lib/mailer';
import { enviarConfirmacionEvento, enviarConfirmacionPrograma } from '@/lib/correo-inscripcion';

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
  // de IP, un mismo inscrito no puede disparar más de 3 envíos por hora (un
  // envío de equipo cuenta como uno aunque llegue a varias personas).
  const rlInscripcion = rateLimit(request, {
    key: payloadEvento
      ? `confirmation:inscripcion:${payloadEvento.id}`
      : `confirmation:inscripcion-programa:${payloadPrograma.id}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlInscripcion.allowed) return respuestaGenerica();

  try {
    const resultado = payloadEvento
      ? await enviarConfirmacionEvento({ inscripcionId: payloadEvento.id, eventoId: payloadEvento.eid, qrToken })
      : await enviarConfirmacionPrograma({ inscripcionId: payloadPrograma.id, programaId: payloadPrograma.pid, qrToken });

    if (!resultado.ok) return respuestaGenerica();

    return NextResponse.json({
      success: true,
      message: resultado.destinatarios > 1
        ? `Correo enviado a ${resultado.enviados} de ${resultado.destinatarios} personas del equipo`
        : 'Correo enviado exitosamente',
      enviados: resultado.enviados,
      destinatarios: resultado.destinatarios,
    });
  } catch (error) {
    console.error('[confirmation] Error al enviar el correo:', error.message);
    return respuestaGenerica();
  }
}
