import { NextResponse } from 'next/server';
import sql from '@/lib/db-server';
import fs from 'fs';
import path from 'path';

export async function POST(request, { params }) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { message: 'ID de evento es requerido' },
        { status: 400 }
      );
    }

    // Verificar si el evento existe
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
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'No se proporcionaron imágenes' },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), 'public/uploads/eventos', id);
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const imagenesGuardadas = [];
    
    for (const file of files) {
      if (file instanceof File) {
        const buffer = await file.arrayBuffer();
        const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const filepath = path.join(uploadDir, filename);
        
        await fs.promises.writeFile(filepath, Buffer.from(buffer));
        
        const [imagen] = await sql`
          INSERT INTO evento_imagenes (
            id_evento,
            nombre_archivo,
            ruta,
            tipo_mime,
            tamanio
          ) VALUES (
            ${id},
            ${filename},
            ${`/uploads/eventos/${id}/`},
            ${file.type},
            ${file.size}
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
    
    if (!id) {
      return NextResponse.json(
        { message: 'ID de evento es requerido' },
        { status: 400 }
      );
    }

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

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');
    
    if (!id || !imageId) {
      return NextResponse.json(
        { message: 'ID de evento e ID de imagen son requeridos' },
        { status: 400 }
      );
    }

    // Obtener información de la imagen
    const [imagen] = await sql`
      SELECT * FROM evento_imagenes 
      WHERE id_imagen = ${imageId} AND id_evento = ${id}
    `;

    if (!imagen) {
      return NextResponse.json(
        { message: 'Imagen no encontrada' },
        { status: 404 }
      );
    }

    // Eliminar archivo físico
    const filePath = path.join(
      process.cwd(), 
      'public', 
      imagen.ruta, 
      imagen.nombre_archivo
    );
    
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      console.error(`Error al eliminar archivo ${filePath}:`, err);
      if (err.code !== 'ENOENT') { // Ignorar si el archivo no existe
        throw err;
      }
    }

    // Eliminar registro de la base de datos
    await sql`
      DELETE FROM evento_imagenes 
      WHERE id_imagen = ${imageId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { message: 'Error al eliminar imagen: ' + error.message },
      { status: 500 }
    );
  }
}