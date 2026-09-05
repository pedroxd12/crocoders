import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { AUDIENCIAS } from '@/lib/documentos-campos';
import { cargarContexto, listarPersonasDocumento } from '@/lib/documentos-datos';

// GET /api/admin/documentos/personas?ambito=evento|programa&id=ID&audiencia=…
//     [&soloAsistieron=1][&soloAcreditados=1][&incluirAsesores=0][&incluirEquipo=0]
//
// Lista de personas candidatas a recibir un documento, para que el panel
// deje marcar a quiénes se les genera. Misma función que usa el generador,
// así lo que se ve es exactamente lo que sale en el PDF.
export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const ambito = searchParams.get('ambito');
  const id = Number(searchParams.get('id'));
  const audiencia = searchParams.get('audiencia');
  if (!['evento', 'programa'].includes(ambito) || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Indica ambito (evento|programa) e id' }, { status: 400 });
  }
  if (!(AUDIENCIAS[ambito] || []).some((a) => a.value === audiencia)) {
    return NextResponse.json({ error: 'Audiencia no válida' }, { status: 400 });
  }
  const bandera = (nombre, porDefecto) => {
    const v = searchParams.get(nombre);
    if (v == null) return porDefecto;
    return v === '1' || v === 'true';
  };
  const opciones = {
    soloAsistieron: bandera('soloAsistieron', false),
    soloAcreditados: bandera('soloAcreditados', false),
    incluirAsesores: bandera('incluirAsesores', true),
    incluirEquipo: bandera('incluirEquipo', true),
  };

  const client = await connectWithRetry();
  try {
    const contexto = await cargarContexto(client, ambito, id);
    if (!contexto) return NextResponse.json({ error: 'Evento o programa no encontrado' }, { status: 404 });
    const personas = await listarPersonasDocumento(client, contexto, audiencia, opciones);
    // No se exponen los ids de inscripción al cliente: el generador los
    // vuelve a resolver por `clave`.
    return NextResponse.json({
      contexto: { nombre: contexto.nombre, fecha: contexto.fecha, porEquipos: contexto.porEquipos },
      personas: personas.map(({ inscripcion, inscripcion_programa, ...p }) => p),
    });
  } catch (error) {
    console.error('Error en GET /api/admin/documentos/personas:', error);
    return NextResponse.json({ error: 'Error al obtener las personas' }, { status: 500 });
  } finally {
    client.release();
  }
}
