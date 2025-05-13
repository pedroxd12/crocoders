import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'public/uploads');

export async function uploadFile(file, folder) {
  try {
    // Crear directorio si no existe
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const folderPath = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const fileExt = path.extname(file.name);
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(folderPath, fileName);
    const relativePath = `/uploads/${folder}/${fileName}`;

    // Guardar el archivo
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.promises.writeFile(filePath, buffer);

    return relativePath;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

export async function deleteFile(filePath) {
  try {
    if (!filePath) {
      throw new Error('La ruta del archivo es requerida');
    }

    // Convertir ruta relativa a absoluta
    const absolutePath = path.join(process.cwd(), 'public', filePath);

    // Verificar si el archivo existe antes de intentar borrarlo
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
      console.log(`Archivo eliminado: ${absolutePath}`);
      return true;
    }

    console.warn(`El archivo no existe: ${absolutePath}`);
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

// Función adicional útil para eliminar directorios
export async function deleteFolder(folderPath) {
  try {
    const absolutePath = path.join(process.cwd(), 'public', folderPath);

    if (fs.existsSync(absolutePath)) {
      await fs.promises.rm(absolutePath, { recursive: true });
      console.log(`Directorio eliminado: ${absolutePath}`);
      return true;
    }

    console.warn(`El directorio no existe: ${absolutePath}`);
    return false;
  } catch (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }
}