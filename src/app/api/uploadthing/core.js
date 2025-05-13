// src/app/api/uploadthing/core.js
import { createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { verifyToken } from "@/lib/auth";

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

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      console.log("[imageUploader] Middleware: Attempting authorization...");
      const user = await getUserFromRequest(req);
      if (!user) {
        console.warn("[imageUploader] Middleware: Authorization failed - No user.");
        throw new UploadThingError("Unauthorized: You must be logged in to upload images.");
      }
      const userId = user.id_miembro || user.id;
      if (!userId) {
        console.error("[imageUploader] Middleware: Authorization failed - User ID missing from token payload.");
        throw new UploadThingError("Unauthorized: User identifier missing.");
      }
      console.log("[imageUploader] Middleware: Authorized successfully. User ID:", userId);
      return { userId: userId, userEmail: user.email };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[imageUploader] onUploadComplete: Invoked.");
      console.log("[imageUploader] Metadata received:", JSON.stringify(metadata, null, 2));
      console.log("[imageUploader] File details received (using ufsUrl):", JSON.stringify({ ...file, url: file.ufsUrl }, null, 2)); // Log ufsUrl

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
      console.log("[eventoImageUploader] Middleware: Attempting authorization...");
      const user = await getUserFromRequest(req);
      if (!user) {
        console.warn("[eventoImageUploader] Middleware: Authorization failed - No user.");
        throw new UploadThingError("Unauthorized: You must be logged in to upload event images.");
      }
      const userId = user.id_miembro || user.id;
      if (!userId) {
        console.error("[eventoImageUploader] Middleware: Authorization failed - User ID missing from token payload.");
        throw new UploadThingError("Unauthorized: User identifier missing.");
      }
      console.log("[eventoImageUploader] Middleware: Authorized successfully. User ID:", userId, "User Email:", user.email);
      return { userId: userId, userEmail: user.email };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[eventoImageUploader] onUploadComplete: Invoked.");
      console.log("[eventoImageUploader] Metadata received:", JSON.stringify(metadata, null, 2));
      console.log("[eventoImageUploader] File details received (using ufsUrl):", JSON.stringify({ ...file, url: file.ufsUrl }, null, 2)); // Log ufsUrl

      if (!metadata || typeof metadata.userId === 'undefined') {
        console.error("[eventoImageUploader] onUploadComplete: Critical data missing - metadata.userId is undefined.");
        throw new Error("Server-side processing error: User metadata missing after upload.");
      }
      if (!file || !file.ufsUrl || !file.key || !file.name) { // Usa ufsUrl
        console.error("[eventoImageUploader] onUploadComplete: Critical data missing - file details (url, key, name) are incomplete.");
        throw new Error("Server-side processing error: File details incomplete after upload.");
      }
      // USA file.ufsUrl EN LUGAR DE file.url
      console.log(`[eventoImageUploader] Upload successful for User ID: ${metadata.userId}, Email: ${metadata.userEmail}. File URL (ufsUrl): ${file.ufsUrl}, Key: ${file.key}`);
      return { uploadedBy: metadata.userId, fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key }; // Devuelve ufsUrl
    }),

  evidenciaUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      console.log("[evidenciaUploader] Middleware: Attempting authorization...");
      const user = await getUserFromRequest(req);
      if (!user) {
        console.warn("[evidenciaUploader] Middleware: Authorization failed - No user.");
        throw new UploadThingError("Unauthorized: You must be logged in to upload evidence.");
      }
      const userId = user.id_miembro || user.id;
      if (!userId) {
        console.error("[evidenciaUploader] Middleware: Authorization failed - User ID missing from token payload.");
        throw new UploadThingError("Unauthorized: User identifier missing.");
      }
      console.log("[evidenciaUploader] Middleware: Authorized successfully. User ID:", userId);
      return { userId: userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[evidenciaUploader] onUploadComplete: Invoked.");
      console.log("[evidenciaUploader] Metadata received:", JSON.stringify(metadata, null, 2));
      console.log("[evidenciaUploader] File details received (using ufsUrl):", JSON.stringify({ ...file, url: file.ufsUrl }, null, 2)); // Log ufsUrl

      if (!metadata || !file || !file.ufsUrl || !file.key || !file.name) { // Usa ufsUrl
        console.error("[evidenciaUploader] onUploadComplete: Critical data missing in callback.");
        throw new Error("Server-side processing error after upload completion (missing data for evidence).");
      }
      // USA file.ufsUrl EN LUGAR DE file.url
      console.log(`[evidenciaUploader] Upload successful for User ID: ${metadata.userId}. File URL (ufsUrl): ${file.ufsUrl}`);
      return { uploadedBy: metadata.userId, fileUrl: file.ufsUrl, fileName: file.name, fileKey: file.key }; // Devuelve ufsUrl
    }),
};
