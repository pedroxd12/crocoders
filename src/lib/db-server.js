import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === "true" ? {
    rejectUnauthorized: false
  } : false,
  max: 10,
  // Railway/proxies cierran conexiones TCP inactivas; si el pool las retiene
  // demasiado, devuelve sockets muertos que fallan con ECONNRESET en el primer
  // uso. Reciclamos las conexiones idle agresivamente y activamos keepAlive
  // para que el SO detecte y descarte sockets caídos.
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  // Recicla cada conexión tras N usos para evitar acumular sockets longevos
  // que el proxy remoto pudo haber cerrado por su cuenta.
  maxUses: 7500,
  allowExitOnIdle: false
});

// ¿Es un error transitorio de red/arranque de Postgres por el que vale la pena
// reintentar? (sockets reseteados por el proxy, DB iniciando, etc.)
function isTransientDbError(error) {
  const transientNetCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'];
  const transientPgCodes = ['57P03', '57P02', '57P01'];
  return (
    transientNetCodes.includes(error?.code) ||
    transientPgCodes.includes(error?.code) ||
    /database system is starting up|the database system is shutting down|terminating connection|Connection terminated/i.test(error?.message || '')
  );
}

// Manejo de errores de conexión
pool.on('error', (err) => {
  console.error('💥 Error inesperado en pool de PostgreSQL:', err);
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    console.error('⚠️ No se puede conectar a la base de datos. Verifique la conexión.');
  }
});

/**
 * Adquiere una conexión del pool reintentando ante errores transitorios.
 * Reemplaza a `pool.connect()` directo en los endpoints: Railway sirve a veces
 * sockets muertos que fallan con ECONNRESET al conectar/primer query.
 * Devuelve un client del pool — el caller DEBE hacer `client.release()`.
 */
export async function connectWithRetry(maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      // Sanity check: una conexión "viva" del pool puede estar muerta a nivel TCP.
      // Un SELECT 1 barato detecta el socket reseteado AQUÍ (reintenta) en vez
      // de explotar más adelante a mitad de la lógica del endpoint.
      await client.query('SELECT 1');
      return client;
    } catch (error) {
      lastError = error;
      if (isTransientDbError(error) && attempt < maxRetries) {
        console.warn(`⚠️ connectWithRetry intento ${attempt}/${maxRetries} falló (${error.code || 'transient'}). Reintentando...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Función para ejecutar consultas SQL con retry logic
export async function sql(strings, ...values) {
  let lastError;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client;
    try {
      client = await pool.connect();

      // Construir la consulta con parámetros posicionales ($1, $2, etc.)
      const query = {
        text: strings.reduce((acc, str, i) =>
          acc + str + (values[i] !== undefined ? `$${i + 1}` : ''), ''),
        values: values.filter(v => v !== undefined)
      };

      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      lastError = error;

      if (isTransientDbError(error) && attempt < maxRetries) {
        console.warn(`⚠️ Intento ${attempt}/${maxRetries} falló (${error.code || 'transient'}). Reintentando en ${attempt * 1000}ms...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        continue;
      }

      // Si no es error de conexión o es el último intento, lanzar error
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  throw lastError;
}

// Función para probar la conexión
export async function initializeDB() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('✅ Conexión a PostgreSQL establecida correctamente');
    return pool;
  } catch (error) {
    console.error('❌ Error al conectar con PostgreSQL:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export default pool;