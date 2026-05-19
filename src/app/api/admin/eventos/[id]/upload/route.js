import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Whitelist estricta MIME -> extensión esperada
const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB por archivo
const MAX_FILES = 20;

// Validación numérica del id de evento para prevenir path traversal
function isValidId(id) {
  return /^\d+$/.test(String(id));
}

export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  if (!id || !isValidId(id)) {
    return NextResponse.json(
      { message: 'ID de evento inválido' },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    const eventoCheck = await client.query(
      'SELECT 1 FROM evento WHERE id_evento = $1',
      [id]
    );

    if (eventoCheck.rows.length === 0) {
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

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { message: `Máximo ${MAX_FILES} archivos por solicitud` },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), 'public/uploads/eventos', id);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const imagenesGuardadas = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      // Validar tipo MIME contra whitelist
      const ext = ALLOWED_MIME.get(file.type);
      if (!ext) {
        return NextResponse.json(
          { message: `Tipo de archivo no permitido: ${file.type}` },
          { status: 400 }
        );
      }

      // Validar tamaño
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { message: `Archivo demasiado grande (límite ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
          { status: 400 }
        );
      }

      // Nombre seguro: UUID + extensión del MIME (no del cliente).
      const filename = `${randomUUID()}${ext}`;
      const filepath = path.join(uploadDir, filename);

      // Doble verificación de path traversal
      const resolved = path.resolve(filepath);
      if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
        return NextResponse.json(
          { message: 'Ruta inválida' },
          { status: 400 }
        );
      }

      const buffer = await file.arrayBuffer();
      await fs.promises.writeFile(filepath, Buffer.from(buffer));

      const imagenResult = await client.query(
        `INSERT INTO evento_imagenes (
          id_evento,
          nombre_archivo,
          ruta,
          tipo_mime,
          tamanio
        ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, filename, `/uploads/eventos/${id}/`, file.type, file.size]
      );

      imagenesGuardadas.push(imagenResult.rows[0]);
    }

    return NextResponse.json(imagenesGuardadas, { status: 201 });
  } catch (error) {
    console.error('Error uploading images:', error);
    return NextResponse.json(
      { message: 'Error al subir imágenes' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();

  try {
    if (!id) {
      return NextResponse.json(
        { message: 'ID de evento es requerido' },
        { status: 400 }
      );
    }

    const result = await client.query(
      `SELECT * FROM evento_imagenes
       WHERE id_evento = $1
       ORDER BY fecha_creacion DESC`,
      [id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json(
      { message: 'Error al obtener imágenes' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get('imageId');
  const client = await pool.connect();
  
  try {
    if (!id || !imageId) {
      return NextResponse.json(
        { message: 'ID de evento e ID de imagen son requeridos' },
        { status: 400 }
      );
    }

    // Obtener información de la imagen
    const imagenResult = await client.query(
      `SELECT * FROM evento_imagenes 
       WHERE id_imagen = $1 AND id_evento = $2`,
      [imageId, id]
    );

    if (imagenResult.rows.length === 0) {
      return NextResponse.json(
        { message: 'Imagen no encontrada' },
        { status: 404 }
      );
    }

    const imagen = imagenResult.rows[0];

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
    await client.query(
      'DELETE FROM evento_imagenes WHERE id_imagen = $1',
      [imageId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { message: 'Error al eliminar imagen: ' + error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}