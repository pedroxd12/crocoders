// src/lib/uploadthing-server.js
// Punto ÚNICO de borrado de archivos en UploadThing.
//
// Antes cada ruta que borraba algo (evidencias, eventos, programas) instanciaba
// su propio `UTApi` y redefinía el mismo helper. Además de duplicar código, eso
// hacía fácil olvidarse de limpiar en algún camino de error y dejar archivos
// huérfanos en el CDN: subidos, pagando cuota y sin ninguna fila que los
// referencie, así que ningún panel puede volver a encontrarlos.
import { UTApi } from 'uploadthing/server';

let utapi = null;

// Perezoso: instanciar UTApi en el import obligaría a tener UPLOADTHING_TOKEN
// presente en cualquier módulo que arrastre este archivo, aunque no borre nada.
function getUtApi() {
  if (!utapi) utapi = new UTApi();
  return utapi;
}

/**
 * Borra una o varias claves de UploadThing. Best-effort a propósito: el borrado
 * del archivo NUNCA debe tumbar la operación de negocio (la fila ya se borró, o
 * el alta ya falló). Si falla, queda registrado para poder limpiarlo a mano.
 *
 * @param {string|string[]|null|undefined} keys
 */
export async function deleteFromUploadThing(keys) {
  const claves = [].concat(keys ?? []).filter(Boolean);
  if (claves.length === 0) return;

  try {
    await getUtApi().deleteFiles(claves);
    console.log(`UploadThing: ${claves.length} archivo(s) eliminado(s)`);
  } catch (error) {
    console.error('Error eliminando archivos de UploadThing:', error);
  }
}
