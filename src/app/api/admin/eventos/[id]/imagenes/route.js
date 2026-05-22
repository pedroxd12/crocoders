import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_FILES = 20;

function isValidId(id) {
  return /^\d+$/.test(String(id));
}

export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;

    if (!id || !isValidId(id)) {
      return NextResponse.json({ message: 'ID de evento inválido' }, { status: 400 });
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

    if (!files || files.length === 0) {
      return NextResponse.json({ message: 'No se proporcionaron imágenes' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ message: `Máximo ${MAX_FILES} archivos por solicitud` }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public/uploads/eventos', id);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const imagenesGuardadas = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      const ext = ALLOWED_MIME.get(file.type);
      if (!ext) {
        return NextResponse.json(
          { message: `Tipo de archivo no permitido: ${file.type}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { message: `Archivo demasiado grande (límite ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
          { status: 400 }
        );
      }

      const filename = `${randomUUID()}${ext}`;
      const filepath = path.join(uploadDir, filename);

      const resolved = path.resolve(filepath);
      if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
        return NextResponse.json({ message: 'Ruta inválida' }, { status: 400 });
      }

      const buffer = await file.arrayBuffer();
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

    return NextResponse.json(imagenesGuardadas, { status: 201 });
  } catch (error) {
    console.error('Error uploading images:', error);
    return NextResponse.json(
      { message: 'Error al subir imágenes' },
      { status: 500 }
    );
  }
}

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;

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