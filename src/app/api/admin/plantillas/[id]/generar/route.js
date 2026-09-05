import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { parseOrError } from '@/lib/validation';
import { cargarPlantilla } from '@/lib/plantillas-documento';
import { normalizarCampos, personaDeMuestra, AUDIENCIAS } from '@/lib/documentos-campos';
import { generarDocumentosPdf, descargarPlantilla } from '@/lib/documentos-pdf';
import {
  cargarContexto, listarPersonasDocumento, completarParaGenerar, prefijoFolioDe,
} from '@/lib/documentos-datos';

// POST /api/admin/plantillas/[id]/generar
//
// Genera el PDF (una página por persona) y lo devuelve como archivo.
//   { muestra: true, campos? }            → vista previa con datos ficticios
//                                           (los `campos` del editor sin guardar)
//   { audiencia, claves?: [...], opciones } → documentos reales; `claves` acota
//                                           a las personas marcadas (todas si falta)
// No se guarda nada: los documentos se regeneran cuando haga falta.

const generarSchema = z.object({
  muestra: z.boolean().optional().default(false),
  campos: z.array(z.any()).optional(),
  audiencia: z.string().optional(),
  claves: z.array(z.string().max(60)).max(2000).optional(),
  opciones: z.object({
    soloAsistieron: z.boolean().optional(),
    soloAcreditados: z.boolean().optional(),
    incluirAsesores: z.boolean().optional(),
    incluirEquipo: z.boolean().optional(),
  }).optional().default({}),
  // 'inline' abre en el navegador (vista previa), 'attachment' descarga.
  disposicion: z.enum(['inline', 'attachment']).optional(),
});

const nombreArchivo = (texto) =>
  String(texto || 'documentos')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'documentos';

export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return NextResponse.json({ error: 'ID de plantilla inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const [datos, err] = parseOrError(generarSchema, body ?? {});
  if (err) return NextResponse.json({ error: err.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const plantilla = await cargarPlantilla(client, Number(id));
    if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

    const contexto = await cargarContexto(client, plantilla.ambito, plantilla.id_evento ?? plantilla.id_programa);
    if (!contexto) return NextResponse.json({ error: 'El evento o programa de la plantilla ya no existe.' }, { status: 404 });

    // Campos: los del cuerpo (editor sin guardar) o los guardados.
    const campos = datos.campos !== undefined ? normalizarCampos(datos.campos) : plantilla.campos;
    if (campos.length === 0) {
      return NextResponse.json({ error: 'La plantilla no tiene campos: agrega al menos uno.' }, { status: 400 });
    }
    const conQr = campos.some((c) => c.clave === 'qr');
    const secret = process.env.PAYLOAD_SECRET;
    if (conQr && !secret && !datos.muestra) {
      return NextResponse.json({ error: 'El servidor no puede firmar códigos QR (falta PAYLOAD_SECRET).' }, { status: 500 });
    }

    let personas;
    if (datos.muestra) {
      personas = [personaDeMuestra({ evento: contexto.nombre, fecha: contexto.fecha })];
    } else {
      const validas = (AUDIENCIAS[contexto.ambito] || []).map((a) => a.value);
      if (!validas.includes(datos.audiencia)) {
        return NextResponse.json({ error: `Audiencia no válida para este ${contexto.ambito}.` }, { status: 400 });
      }
      let lista = await listarPersonasDocumento(client, contexto, datos.audiencia, datos.opciones);
      if (datos.claves?.length) {
        const elegidas = new Set(datos.claves);
        lista = lista.filter((p) => elegidas.has(p.clave));
      }
      if (lista.length === 0) {
        return NextResponse.json({ error: 'No hay personas para generar con esos criterios.' }, { status: 400 });
      }
      personas = completarParaGenerar(lista, {
        idPlantilla: plantilla.id_plantilla,
        prefijoFolio: prefijoFolioDe(contexto.nombre),
        conQr,
        secret,
      });
    }

    const plantillaBytes = await descargarPlantilla(plantilla.pdf_url);
    const pdf = await generarDocumentosPdf({
      plantillaBytes,
      pagina: plantilla.pagina,
      campos,
      personas,
    });

    const disposicion = datos.disposicion || (datos.muestra ? 'inline' : 'attachment');
    const archivo = datos.muestra
      ? `vista-previa-${nombreArchivo(plantilla.nombre)}.pdf`
      : `${plantilla.tipo}s-${nombreArchivo(contexto.nombre)}-${datos.audiencia}.pdf`;

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposicion}; filename="${archivo}"`,
        'Cache-Control': 'private, no-store',
        'X-Documentos-Generados': String(personas.length),
      },
    });
  } catch (error) {
    console.error('Error en POST /api/admin/plantillas/[id]/generar:', error);
    return NextResponse.json(
      { error: error.message?.startsWith('No se pudo descargar') || error.message?.includes('no es un PDF')
          ? error.message
          : 'Error al generar los documentos' },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
