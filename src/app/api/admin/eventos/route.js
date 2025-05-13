// src/app/api/admin/eventos/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
// Remove: import { uploadFile } from '@/lib/storage-server'; // No longer needed for direct upload here

export async function GET() {
  try {
    const eventos = await sql`
      SELECT 
        e.*,
        (
          SELECT COUNT(*) FROM asistencia_miembro 
          WHERE id_evento = e.id_evento
        ) + (
          SELECT COUNT(*) FROM asistencia_invitado 
          WHERE id_evento = e.id_evento
        ) as asistentes_count
      FROM evento e
      ORDER BY e.fecha DESC, e.hora_inicio DESC
    `;
    return NextResponse.json(eventos);
  } catch (error) {
    console.error('Error en GET /api/admin/eventos:', error);
    return NextResponse.json(
      { error: 'Error al obtener eventos' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const formData = await request.json(); // Expecting JSON data now
    
    const requiredFields = ['nombre_evento', 'descripcion', 'tipo', 'fecha', 'hora_inicio', 'hora_fin'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Faltan campos requeridos: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    const eventoData = {
      nombre_evento: formData.nombre_evento,
      descripcion: formData.descripcion,
      tipo: formData.tipo,
      hermandad: formData.hermandad || 'club de programación',
      fecha: formData.fecha,
      hora_inicio: formData.hora_inicio,
      hora_fin: formData.hora_fin,
      cupos: parseInt(formData.cupos) || 0,
      costo: parseFloat(formData.costo) || 0,
      imagen_url: formData.imagen_url || null, // From UploadThing
      imagen_key: formData.imagen_key || null  // From UploadThing
    };

    const inicio = new Date(`${eventoData.fecha}T${eventoData.hora_inicio}`);
    const fin = new Date(`${eventoData.fecha}T${eventoData.hora_fin}`);
    
    if (inicio >= fin) {
      return NextResponse.json(
        { error: 'La hora de fin debe ser posterior a la hora de inicio' },
        { status: 400 }
      );
    }

    // Insert the event with imagen_url and imagen_key
    const result = await sql`
      INSERT INTO evento 
        (nombre_evento, descripcion, tipo, hermandad, fecha, hora_inicio, hora_fin, cupos, costo, imagen_url, imagen_key)
      VALUES
        (${eventoData.nombre_evento}, ${eventoData.descripcion}, ${eventoData.tipo}, 
         ${eventoData.hermandad}, ${eventoData.fecha}, ${eventoData.hora_inicio}, 
         ${eventoData.hora_fin}, ${eventoData.cupos}, ${eventoData.costo}, 
         ${eventoData.imagen_url}, ${eventoData.imagen_key})
      RETURNING *
    `;

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/admin/eventos:', error);
    return NextResponse.json(
      { error: 'Error al crear evento: ' + error.message },
      { status: 500 }
    );
  }
}