// src/lib/sanitize.js
//
// Saneado de HTML en el SERVIDOR (descripciones de eventos y programas que
// escribe administración y que luego se pintan con dangerouslySetInnerHTML).
//
// POR QUÉ NO USA DOMPurify: `isomorphic-dompurify` necesita un DOM y en Node lo
// consigue arrastrando jsdom. Ese paquete no llegaba a inicializarse en la
// función serverless de Vercel, y como el fallo ocurre al CARGAR el módulo, la
// ruta entera respondía 500 con cuerpo vacío antes siquiera de ejecutar el
// handler. Se comprobó contra producción con una correlación exacta de 8 de 8:
// las cinco rutas que importaban este archivo (/api/admin/eventos,
// /api/admin/eventos/[id], /api/admin/programas, /api/admin/programas/[id] y
// .../sesiones) devolvían 500 incluso SIN sesión, mientras que las rutas admin
// que no lo importaban (/api/admin/catalogos, /miembros, /stats, /invitados)
// devolvían el 401 correcto. Por eso el panel se quedaba sin eventos, sin
// programas y sin evidencias: sus listados nunca respondían.
//
// `sanitize-html` hace el mismo trabajo con htmlparser2, sin emular un DOM, así
// que se empaqueta y arranca sin problemas en la función.
//
// El uso de DOMPurify en el CLIENTE (src/app/eventos/[id]/page.jsx) se queda
// como está: allí hay un DOM de verdad y jsdom no interviene.
import sanitizeHtmlLib from 'sanitize-html';

const ALLOWED_TAGS = [
  'a', 'b', 'i', 'em', 'strong', 'u', 's', 'p', 'br', 'hr',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'div', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class', 'style'];

// script/style/iframe/object/embed/form/input/textarea NO hacen falta en una
// lista de prohibidos: al no estar en ALLOWED_TAGS, la lista blanca ya los
// descarta. Lo mismo con onerror/onload/onclick/onmouseover frente a
// ALLOWED_ATTR. Una lista blanca no necesita lista negra.
const OPCIONES = {
  allowedTags: ALLOWED_TAGS,
  // Las mismas atribuciones para cualquier etiqueta permitida, que es como se
  // comportaba `ALLOWED_ATTR` de DOMPurify (global, no por etiqueta).
  allowedAttributes: { '*': ALLOWED_ATTR },

  // Esquemas de URL admitidos. `data:` queda FUERA a propósito para href: la
  // versión anterior de este archivo llegó a incluirlo por una
  // ALLOWED_URI_REGEXP escrita a mano, y eso dejaba pasar un
  // `<a href="data:text/html;base64,…">` guardado en la descripción de un
  // evento — es decir, XSS almacenado a un clic de distancia.
  allowedSchemes: ['http', 'https', 'mailto', 'ftp'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
  // …pero sí en `img`, donde una imagen embebida es legítima y no ejecuta nada.
  // Reproduce el DATA_URI_TAGS que DOMPurify aplicaba por defecto.
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },

  // Contenido de las etiquetas descartadas: para `script` y `style` se tira
  // ENTERO (si no, el código quedaría como texto suelto dentro del documento);
  // para el resto se conserva el texto, como hacía DOMPurify con KEEP_CONTENT.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],

  // Un enlace saneado que abre en otra pestaña sin `rel` deja al destino
  // manipular la pestaña de origen vía `window.opener`. Como `target` está
  // permitido, se fuerza el `rel` seguro.
  transformTags: {
    a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
};

export function sanitizeHtml(html) {
  if (html === null || html === undefined) return html;
  return sanitizeHtmlLib(String(html), OPCIONES);
}
