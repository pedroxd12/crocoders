// Interruptor de publicación de la landing del HackaItlac (/hackaitlac).
//
// La convocatoria todavía no se anuncia, así que la página está OCULTA:
//   · para el público, /hackaitlac responde 404 —no un "inicia sesión", que
//     delataría que la página existe—;
//   · su entrada desaparece del menú;
//   · se sirve siempre con `noindex`, para que ningún buscador la recoja.
// Los administradores con sesión sí pueden abrirla, para revisarla antes de
// anunciarla.
//
// PARA PUBLICARLA no hace falta tocar código: define
// `NEXT_PUBLIC_HACKAITLAC_PUBLICA=true` en el entorno (en Vercel:
// Settings → Environment Variables) y vuelve a desplegar.
//
// Es una variable `NEXT_PUBLIC_` porque el menú (componente de cliente) también
// la necesita; eso implica que se incrusta durante el build, así que cambiarla
// exige un despliegue nuevo, no basta con reiniciar el servidor.
export const HACKAITLAC_PUBLICA = process.env.NEXT_PUBLIC_HACKAITLAC_PUBLICA === 'true';
