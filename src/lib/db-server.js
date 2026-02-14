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
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Retry logic para conexiones perdidas
  allowExitOnIdle: false
});

// Manejo de errores de conexión
pool.on('error', (err) => {
  console.error('💥 Error inesperado en pool de PostgreSQL:', err);
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    console.error('⚠️ No se puede conectar a la base de datos. Verifique la conexión.');
  }
});

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
      
      // Si es error de conexión y no es el último intento, reintentar
      if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code) && attempt < maxRetries) {
        console.warn(`⚠️ Intento ${attempt}/${maxRetries} falló. Reintentando en ${attempt * 1000}ms...`);
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