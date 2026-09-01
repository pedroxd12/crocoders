// RUTA RETIRADA — duplicado de ../upload sobre la misma galería en disco local.
// Ver la explicación completa en src/app/api/admin/eventos/[id]/upload/route.js.
// La galería pública real vive en `evidencia` + UploadThing.
import { NextResponse } from 'next/server';

const RESPUESTA = {
  error: 'Esta función ya no está disponible. Sube las imágenes del evento como evidencias.',
};

export async function POST() {
  return NextResponse.json(RESPUESTA, { status: 410 });
}

export async function GET() {
  return NextResponse.json(RESPUESTA, { status: 410 });
}
