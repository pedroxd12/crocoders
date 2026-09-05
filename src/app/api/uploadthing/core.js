// src/app/api/uploadthing/core.js
import { createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { verifyToken } from "@/lib/auth";
import { z } from "zod";
import { query } from "@/lib/db-server";
import { resolverInscripcionDeToken } from "@/lib/comprobantes-pago";

const f = createUploadthing({
  errorFormatter: (err) => {
    console.error("--- UPLOADTHING ERROR ---");
    console.error("Error Message:", err.message);
    console.error("Error Cause:", err.cause);
    return {
      message: err.message,
      ...(process.env.NODE_ENV === "development" && { cause: err.cause?.toString() }),
    };
  },
});

if (process.env.NODE_ENV === 'development') {
    console.log("\n[UPLOADTHING_CORE_INIT] Checking Environment Variables:");
    console.log(`  UPLOADTHING_SECRET: ${process.env.UPLOADTHING_SECRET ? 'SET (details hidden)' : 'NOT SET - THIS IS REQUIRED!'}`);
    console.log(`  UPLOADTHING_APP_ID: ${process.env.UPLOADTHING_APP_ID || 'NOT SET - THIS IS REQUIRED!'}\n`);
}

const getUserFromRequest = async (req) => {
  const tokenCookie = req.cookies?.get("token");
  if (tokenCookie && tokenCookie.value) {
    try {
      const user = await verifyToken(tokenCookie.value);
      if (user && (user.id || user.id_miembro)) {
        return user;
      }
      console.warn("UploadThing Middleware: verifyToken returned user but no 'id' or 'id_miembro' field:", user);
      return null;
    } catch (error) {
      console.error("UploadThing Middleware: Error during verifyToken:", error.message);
      return null;
    }
  }
  return null;
};

// Autoriza una subida exigiendo que el usuario sea ADMINISTRADOR.
// Todas las subidas (flyers de evento, evidencias, imágenes) son acciones de
// administración: sin este guard cualquier miembro autenticado podía subir
// archivos a UploadThing y consumir la cuota de la cuenta.
const requireAdminUpload = async (req, tag) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    console.warn(`[${tag}] Middleware: sin sesión.`);
    throw new UploadThingError("No autenticado: inicia sesión para subir archivos.");
  }
  const userId = user.id_miembro || user.id;
  if (!userId) {
    console.error(`[${tag}] Middleware: token sin identificador de usuario.`);
    throw new UploadThingError("No autorizado: identificador de usuario ausente.");
  }
  const role = (user.role || '').toLowerCase();
  if (role !== 'administrador') {
    console.warn(`[${tag}] Middleware: rol '${role}' no autorizado (se requiere administrador).`);
    throw new UploadThingError("No autorizado: se requieren permisos de administrador.");
  }
  // No se propaga el correo: acaba en los logs de la plataforma sin aportar nada.
  return { userId };
};

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      return await requireAdminUpload(req, 'imageUploader');
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[imageUploader] onUploadComplete: Invoked.");

      if (!metadata || !file || !file.ufsUrl || !file.key || !file.name) { // Usa ufsUrl
        console.error("[imageUploader] onUploadComplete: Critical data missing in callback. Metadata or File is incomplete.");
        throw new Error("Server-side processing error after upload completion (missing data).");
      }
      // USA file.ufsUrl EN LUGAR DE file.url
      console.log(`[imageUploader] Upload successful for User ID: ${metadata.userId}. File URL (ufsUrl): ${file.ufsUrl}`);
      return { uploadedBy: metadata.userId, fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key }; // Devuelve ufsUrl
    }),

  eventoImageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 5 } })
    .middleware(async ({ req }) => {
      return await requireAdminUpload(req, 'eventoImageUploader');
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[eventoImageUploader] onUploadComplete: Invoked.");

      if (!metadata || typeof metadata.userId === 'undefined') {
        console.error("[eventoImageUploader] onUploadComplete: Critical data missing - metadata.userId is undefined.");
        throw new Error("Server-side processing error: User metadata missing after upload.");
      }
      if (!file || !file.ufsUrl || !file.key || !file.name) { // Usa ufsUrl
        console.error("[eventoImageUploader] onUploadComplete: Critical data missing - file details (url, key, name) are incomplete.");
        throw new Error("Server-side processing error: File details incomplete after upload.");
      }
      // USA file.ufsUrl EN LUGAR DE file.url
      console.log(`[eventoImageUploader] Upload successful for User ID: ${metadata.userId}, Key: ${file.key}`);
      return { uploadedBy: metadata.userId, fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key }; // Devuelve ufsUrl
    }),

  // Comprobante de pago de una inscripción (migración 013).
  //
  // ÚNICO uploader que NO exige rol administrador, y a propósito: quien sube el
  // comprobante es la persona que acaba de inscribirse, y en eventos abiertos
  // suele ser un invitado SIN cuenta. La autorización va por el ticket firmado
  // de su inscripción (`qrToken`, el mismo del QR de acceso), que se valida
  // aquí contra la base ANTES de aceptar el archivo: sin esa comprobación,
  // publicar un endpoint abierto sería regalar la cuota de UploadThing.
  comprobantePagoUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .input(z.object({ qrToken: z.string().min(1).max(4096) }))
    .middleware(async ({ input }) => {
      const resuelto = await resolverInscripcionDeToken(
        // `query()` de db-server (con reintentos); nunca pool.query() directo.
        { query: (text, values) => query(text, values) },
        input.qrToken,
      );
      if (!resuelto.ok) {
        console.warn(`[comprobantePagoUploader] Rechazado: ${resuelto.error}`);
        throw new UploadThingError(resuelto.error);
      }
      // Un comprobante ya aprobado no se reemplaza: si hiciera falta corregirlo,
      // quien revisó tiene que devolverlo a 'pendiente' o rechazarlo primero.
      if (resuelto.inscripcion.comprobante_estado === 'aprobado') {
        throw new UploadThingError('Tu pago ya fue validado: no hace falta subir otro comprobante.');
      }
      return { inscripcionId: resuelto.inscripcion.id_inscripcion };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // La fila la escribe POST /api/eventos/comprobante con la clave que se
      // devuelve aquí (mismo patrón que las evidencias): así el guardado ocurre
      // en una petición nuestra, con su validación y su limpieza de huérfanos.
      console.log(`[comprobantePagoUploader] Subida OK para inscripción ${metadata.inscripcionId}`);
      return { fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key };
    }),

  // Plantilla PDF de certificados, gafetes y reconocimientos (migración 015).
  // Sólo administración; la fila la escribe POST /api/admin/plantillas con la
  // clave que se devuelve aquí (mismo patrón que las evidencias).
  plantillaPdfUploader: f({ pdf: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      return await requireAdminUpload(req, 'plantillaPdfUploader');
    })
    .onUploadComplete(async ({ metadata, file }) => {
      if (!metadata || !file || !file.ufsUrl || !file.key || !file.name) {
        console.error("[plantillaPdfUploader] onUploadComplete: datos incompletos.");
        throw new Error("Server-side processing error after upload completion (missing data).");
      }
      console.log(`[plantillaPdfUploader] Subida OK (usuario ${metadata.userId}, clave ${file.key})`);
      return { uploadedBy: metadata.userId, fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key };
    }),

  evidenciaUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      return await requireAdminUpload(req, 'evidenciaUploader');
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[evidenciaUploader] onUploadComplete: Invoked.");

      if (!metadata || !file || !file.ufsUrl || !file.key || !file.name) { // Usa ufsUrl
        console.error("[evidenciaUploader] onUploadComplete: Critical data missing in callback.");
        throw new Error("Server-side processing error after upload completion (missing data for evidence).");
      }
      // USA file.ufsUrl EN LUGAR DE file.url
      console.log(`[evidenciaUploader] Upload successful for User ID: ${metadata.userId}. File URL (ufsUrl): ${file.ufsUrl}`);
      return { uploadedBy: metadata.userId, fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key }; // Devuelve ufsUrl
    }),
};
