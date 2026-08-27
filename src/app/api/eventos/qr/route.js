// src/app/api/eventos/qr/route.js
// Renderiza el QR del ticket de acceso en NUESTRO servidor.
//
// Antes la imagen se pedía a `api.qrserver.com` poniendo el token del ticket en
// la URL: ese servicio de terceros recibía (y registraba en sus logs) un
// credencial de acceso al evento firmado por nosotros. Ahora el token no sale
// del origen propio.
//
// La autorización es la posesión de un token con firma HMAC válida, así que
// funciona igual para miembros con sesión que para invitados.
import { NextResponse } from 'next/server';
import { toDataURL } from 'qrcode';
import { verificarQrToken } from '@/lib/qr-token';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request) {
  const rl = rateLimit(request, { scope: 'evento-qr', limit: 60, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
  }

  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    console.error('[eventos/qr] PAYLOAD_SECRET no configurado');
    return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const qrToken = body?.qrToken;
  // Solo se dibuja lo que nosotros firmamos: esto no es un generador de QR
  // genérico que cualquiera pueda usar para codificar contenido arbitrario.
  if (!verificarQrToken(qrToken, secret)) {
    return NextResponse.json({ error: 'Ticket inválido' }, { status: 400 });
  }

  try {
    const dataUrl = await toDataURL(qrToken, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return NextResponse.json(
      { dataUrl },
      // Es un credencial personal: ni la CDN ni un proxy intermedio deben
      // guardarlo.
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[eventos/qr] Error generando el QR:', error.message);
    return NextResponse.json({ error: 'No se pudo generar el código QR' }, { status: 500 });
  }
}
