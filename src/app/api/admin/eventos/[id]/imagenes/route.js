import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import fs from 'fs';
import path from 'path';

export async function POST(request, { params }) {
  try {
    const { id } = params;
    
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }

    const [evento] = await sql`
      SELECT 1 FROM evento WHERE id_evento = ${id}
    `;
    
    if (!evento) {
      return NextResponse.json(
        { message: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('images');
    
    const uploadDir = path.join(process.cwd(), 'public/uploads/eventos', id);
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const imagenesGuardadas = [];
    
    for (const file of files) {
      if (file instanceof File) {
        const buffer = await file.arrayBuffer();
        const filename = `${Date.now()}-${file.name}`;
        const filepath = path.join(uploadDir, filename);
        
        await fs.promises.writeFile(filepath, Buffer.from(buffer));
        
        const [imagen] = await sql`
          INSERT INTO evento_imagenes (
            id_evento,
            nombre_archivo,
            ruta,
            tipo_mime
          ) VALUES (
            ${id},
            ${filename},
            ${`/uploads/eventos/${id}/`},
            ${file.type}
          ) RETURNING *
        `;
        
        imagenesGuardadas.push(imagen);
      }
    }

    return NextResponse.json(imagenesGuardadas, { status: 201 });
  } catch (error) {
    console.error('Error uploading images:', error);
    return NextResponse.json(
      { message: 'Error al subir imágenes: ' + error.message },
      { status: 500 }
    );
  }
}

export async function GET(request, { params }) {
  try {
    const { id } = params;
    
    const imagenes = await sql`
      SELECT * FROM evento_imagenes
      WHERE id_evento = ${id}
      ORDER BY fecha_creacion DESC
    `;

    return NextResponse.json(imagenes);
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json(
      { message: 'Error al obtener imágenes' },
      { status: 500 }
    );
  }
}