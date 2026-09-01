import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'a', 'b', 'i', 'em', 'strong', 'u', 's', 'p', 'br', 'hr',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'div', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class', 'style'];

export function sanitizeHtml(html) {
  if (html === null || html === undefined) return html;
  const input = String(html);
  // Sin ALLOWED_URI_REGEXP a propósito: la expresión que había aquí añadía a
  // mano el esquema `data:` a la lista blanca de href/src, así que un
  // `<a href="data:text/html;base64,...">` guardado en la descripción de un
  // evento sobrevivía al filtro. Con la regla por defecto de DOMPurify los
  // `data:` sólo se admiten donde tiene sentido (img/video/audio, vía
  // DATA_URI_TAGS) y nunca en un enlace.
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}
