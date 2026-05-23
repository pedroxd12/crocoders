// Fetcher compartido para SWR. Lanza en respuestas no-OK para que SWR pueble
// `error` en lugar de tratar el cuerpo de error como datos válidos.
export async function fetcher(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error('Error en la petición');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Variante POST para endpoints que reciben un cuerpo (p. ej. lookups batch).
// La clave de SWR debe ser un array [url, body] para que distintos cuerpos
// se cacheen por separado.
export async function postFetcher([url, body]) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error('Error en la petición');
    err.status = res.status;
    throw err;
  }
  return res.json();
}
