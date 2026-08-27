// Reglas compartidas de los handles de plataformas competitivas.
//
// La BD tenía usuarios como "No tengo ", "Zike 19" o "Pedro Alonso " porque el
// perfil sólo hacía `.trim()` antes de guardar. Cada uno de esos valores se
// traducía en peticiones inútiles a Codeforces/VJudge/omegaUp en cada refresco
// y en filas fantasma en la tabla de posiciones. Validamos el formato en el
// punto de entrada (perfil/registro) y también al sincronizar, para no
// depender de que los datos históricos estén limpios.

export const PLATAFORMAS = {
  CODEFORCES: 'Codeforces',
  VJUDGE: 'VJudge',
  OMEGAUP: 'OmegaUp',
};

// Formatos reales de cada plataforma (verificados contra sus APIs):
// - Codeforces: letras, dígitos, guion y guion bajo; 3-24 caracteres.
// - VJudge: letras, dígitos y guion bajo; 3-20 caracteres.
// - omegaUp: además admite punto y guion; 2-50 caracteres.
const REGLAS = {
  [PLATAFORMAS.CODEFORCES]: /^[A-Za-z0-9_-]{3,24}$/,
  [PLATAFORMAS.VJUDGE]: /^[A-Za-z0-9_]{3,20}$/,
  [PLATAFORMAS.OMEGAUP]: /^[A-Za-z0-9._-]{2,50}$/,
};

/**
 * Normaliza lo que el usuario escribió: quita espacios sobrantes y acepta que
 * pegue la URL de su perfil en vez del handle (caso muy frecuente).
 * omegaUp además guarda a veces el correo completo; nos quedamos con la parte
 * local, que es lo que su API entiende.
 */
export function normalizarUsuario(plataforma, valor) {
  if (typeof valor !== 'string') return '';

  let u = valor.trim();
  if (!u) return '';

  // "https://codeforces.com/profile/tourist" -> "tourist"
  const urlMatch = u.match(
    /(?:codeforces\.com\/profile\/|vjudge\.net\/user\/|omegaup\.com\/profile\/)([^/?#\s]+)/i,
  );
  if (urlMatch) u = urlMatch[1];

  u = u.replace(/^@+/, '').trim();

  if (plataforma === PLATAFORMAS.OMEGAUP && u.includes('@')) {
    u = u.split('@')[0];
  }

  return u;
}

/** ¿El handle tiene un formato que la plataforma podría aceptar? */
export function esUsuarioValido(plataforma, valor) {
  const regla = REGLAS[plataforma];
  if (!regla) return false;
  return regla.test(valor || '');
}

/** Normaliza y valida en un paso. Devuelve '' si no sirve para consultar. */
export function limpiarUsuario(plataforma, valor) {
  const u = normalizarUsuario(plataforma, valor);
  return esUsuarioValido(plataforma, u) ? u : '';
}

/** URL pública del perfil, para enlazar desde la tabla de posiciones. */
export function urlPerfil(plataforma, usuario) {
  if (!usuario) return null;
  const u = encodeURIComponent(usuario);
  switch (plataforma) {
    case PLATAFORMAS.CODEFORCES:
      return `https://codeforces.com/profile/${u}`;
    case PLATAFORMAS.VJUDGE:
      return `https://vjudge.net/user/${u}`;
    case PLATAFORMAS.OMEGAUP:
      return `https://omegaup.com/profile/${u}/`;
    default:
      return null;
  }
}

// Codeforces devuelve estos placeholders cuando el usuario no subió foto.
// Tratarlos como "sin avatar" permite mostrar iniciales y que todas las
// tarjetas se vean consistentes en vez de un mosaico gris genérico.
const AVATARES_PLACEHOLDER = /\/(no-title|no-avatar)\.(jpg|png)$/i;

const RE_GRAVATAR = /^https:\/\/(?:secure|www)\.gravatar\.com\/avatar\/[a-f0-9]+/i;

/** Normaliza la URL del avatar; devuelve null si es un placeholder o no es https. */
export function limpiarAvatar(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;
  // Codeforces ha devuelto URLs sin protocolo ("//userpic...") en el pasado;
  // `next/image` las interpretaría como ruta local y no cargarían.
  if (u.startsWith('//')) u = `https:${u}`;
  if (!u.startsWith('https://')) return null;
  if (AVATARES_PLACEHOLDER.test(u)) return null;

  // omegaUp devuelve el gravatar de todos sus usuarios tengan cuenta o no. Sin
  // `d=404` Gravatar responde SIEMPRE con la misma silueta genérica, así que la
  // tabla se llenaba de fotos idénticas. Con `d=404` la imagen falla cuando el
  // miembro no tiene gravatar y la tarjeta muestra sus iniciales. `s=200` da
  // resolución suficiente para pantallas retina (se muestra a 96 px).
  const gravatar = u.match(RE_GRAVATAR);
  if (gravatar) return `${gravatar[0]}?s=200&d=404`;

  return u.slice(0, 500);
}

/** Iniciales para el avatar de respaldo ("Pedro Abdiel Villatoro" -> "PV"). */
export function iniciales(nombreCompleto) {
  const partes = String(nombreCompleto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
