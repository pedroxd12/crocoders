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
  max: 5,
  idleTimeoutMillis: 30000
});

// Función para ejecutar consultas SQL
export async function sql(strings, ...values) {
  const client = await pool.connect();
  try {
    // Construir la consulta con parámetros posicionales ($1, $2, etc.)
    const query = {
      text: strings.reduce((acc, str, i) => 
        acc + str + (values[i] !== undefined ? `$${i + 1}` : ''), ''),
      values: values.filter(v => v !== undefined)
    };
    const result = await client.query(query);
    return result.rows;
  } finally {
    client.release();
  }
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