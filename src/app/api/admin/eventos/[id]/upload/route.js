// RUTA RETIRADA — galería de imágenes de evento sobre disco local.
//
// Guardaba los archivos con fs.writeFile en public/uploads/eventos/<id> y los
// registraba en la tabla `evento_imagenes`. Era un segundo backend de
// almacenamiento incompatible con el resto del proyecto, que usa UploadThing
// para el flyer (`evento.imagen_flyer_key`) y para las evidencias
// (`evidencia.storage_key`). Problemas reales que tenía:
//
//  - En Vercel, `process.cwd()/public` es de sólo lectura: el mkdirSync fallaba
//    con EROFS y el endpoint respondía 500. Nunca funcionó en producción.
//  - En local, los archivos desaparecían en cada despliegue mientras las filas
//    de `evento_imagenes` sobrevivían, dejando rutas rotas.
//  - El bucle no era transaccional: escribía fichero + INSERT por iteración y
//    cortaba con 400 a media lista, dejando las anteriores ya persistidas.
//  - Al borrar un evento nadie recogía esos ficheros: quedaban huérfanos.
//
// No tiene ningún llamador en el cliente: la galería pública se sirve desde
// `evidencia` (src/app/api/eventos/[id]/imagenes/route.js) con UploadThing.
// Se deja este 410 en lugar de un 500 silencioso. PENDIENTE de limpieza:
// eliminar este archivo y el de ../imagenes, y hacer DROP TABLE evento_imagenes
// en una migración.
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

export async function DELETE() {
  return NextResponse.json(RESPUESTA, { status: 410 });
}
