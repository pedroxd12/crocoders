// Plantillas de documentos (tabla `plantilla_documento`, migración 015):
// consulta y validación compartidas por las rutas de /api/admin/plantillas.

import { z } from 'zod';
import { TIPOS_PLANTILLA, normalizarCampos, LIMITES } from '@/lib/documentos-campos';

const TIPOS = TIPOS_PLANTILLA.map((t) => t.value);

export const plantillaCreateSchema = z.object({
  id_evento: z.coerce.number().int().positive().optional().nullable(),
  id_programa: z.coerce.number().int().positive().optional().nullable(),
  tipo: z.enum(TIPOS, { message: 'Tipo de plantilla no válido' }),
  nombre: z.string().trim().min(1, 'Ponle un nombre a la plantilla').max(120, 'Máximo 120 caracteres'),
  pdf_url: z.string().trim().url('La URL del PDF no es válida').max(500),
  pdf_key: z.string().trim().min(1, 'Falta la clave del archivo').max(255),
  pagina: z.coerce.number().int().min(1).max(50).optional().default(1),
  campos: z.array(z.any()).max(LIMITES.campos).optional().default([]),
}).refine((d) => (d.id_evento != null) !== (d.id_programa != null), {
  message: 'La plantilla debe pertenecer a un evento o a un programa (no a ambos)',
  path: ['id_evento'],
});

export const plantillaUpdateSchema = z.object({
  tipo: z.enum(TIPOS).optional(),
  nombre: z.string().trim().min(1).max(120).optional(),
  pdf_url: z.string().trim().url().max(500).optional(),
  pdf_key: z.string().trim().min(1).max(255).optional(),
  pagina: z.coerce.number().int().min(1).max(50).optional(),
  campos: z.array(z.any()).max(LIMITES.campos).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

const SELECT = `
  SELECT p.id_plantilla, p.id_evento, p.id_programa, p.tipo, p.nombre, p.pdf_url, p.pdf_key,
         p.pagina, p.campos, p.created_at, p.updated_at,
         COALESCE(e.nombre, pr.nombre) AS nombre_ambito
    FROM plantilla_documento p
    LEFT JOIN evento e ON e.id_evento = p.id_evento
    LEFT JOIN programa_recurrente pr ON pr.id_programa = p.id_programa`;

export function formatearPlantilla(fila) {
  return {
    ...fila,
    id_plantilla: Number(fila.id_plantilla),
    id_evento: fila.id_evento == null ? null : Number(fila.id_evento),
    id_programa: fila.id_programa == null ? null : Number(fila.id_programa),
    pagina: Number(fila.pagina) || 1,
    campos: normalizarCampos(fila.campos),
    ambito: fila.id_evento != null ? 'evento' : 'programa',
  };
}

export async function listarPlantillas(client, { idEvento = null, idPrograma = null }) {
  const { rows } = await client.query(
    `${SELECT}
      WHERE ($1::int IS NULL OR p.id_evento = $1)
        AND ($2::int IS NULL OR p.id_programa = $2)
      ORDER BY p.tipo, p.nombre`,
    [idEvento, idPrograma],
  );
  return rows.map(formatearPlantilla);
}

export async function cargarPlantilla(client, idPlantilla) {
  const { rows } = await client.query(`${SELECT} WHERE p.id_plantilla = $1`, [idPlantilla]);
  return rows[0] ? formatearPlantilla(rows[0]) : null;
}
