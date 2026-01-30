// src/app/api/uploadthing/route.js
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core"; // Make sure this path is correct

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  // You can add config here if needed, but usually env vars are sufficient
  // config: {
  //   uploadthingId: process.env.UPLOADTHING_APP_ID,
  //   uploadthingSecret: process.env.UPLOADTHING_SECRET,
  // },
});