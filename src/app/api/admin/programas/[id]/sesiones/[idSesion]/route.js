import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

// DELETE - Eliminar sesión del programa
export async function DELETE(request, { params }) {
  const { id, idSesion } = await params;
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'DELETE FROM sesion_programa WHERE id_sesion = $1 AND id_programa = $2 RETURNING *',
      [idSesion, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Sesión eliminada correctamente' });
  } catch (error) {
    console.error('Error deleting sesion:', error);
    return NextResponse.json(
      { error: 'Error al eliminar sesión' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
