// src/app/api/uploadthing/delete/route.js
import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { verifyToken } from "@/lib/auth"; // Tu función de autenticación

const utapi = new UTApi();

const getUserFromRequest = async (req) => {
  const tokenCookie = req.cookies.get("token");
  if (tokenCookie && tokenCookie.value) {
    try {
      const user = await verifyToken(tokenCookie.value);
      return user;
    } catch (error) {
      console.error("Error verifying token for delete:", error);
      return null;
    }
  }
  return null;
};

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) { // O verifica si es admin, según tus reglas de negocio
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileKeys } = await request.json();

  if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0) {
    return NextResponse.json({ error: "fileKeys (array) are required" }, { status: 400 });
  }

  try {
    const result = await utapi.deleteFiles(fileKeys);
    console.log("UploadThing delete result:", result);
    if (result && result.success !== undefined && !result.success) { // Algunas APIs de UT devuelven { success: false }
        return NextResponse.json({ error: "Failed to delete some files from UploadThing", details: result }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Files scheduled for deletion." });
  } catch (error) {
    console.error("Error deleting files from UploadThing API:", error);
    return NextResponse.json({ error: "Failed to delete files from UploadThing" }, { status: 500 });
  }
}