import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('Email no válido').max(200);
const phoneSchema = z.string().trim().regex(/^[0-9]{10,15}$/, 'Teléfono debe tener 10-15 dígitos');
const nameSchema = z.string().trim().min(1).max(100);
const optionalString = (max = 200) => z.string().trim().max(max).optional().or(z.literal(''));

export const integranteSchema = z.object({
  nombre: nameSchema,
  email: emailSchema,
  telefono: optionalString(20),
  institucion: optionalString(150),
  carrera: optionalString(150),
  semestre: z.union([z.string(), z.number()]).optional().nullable(),
  es_capitan: z.boolean().optional().default(false),
  es_miembro: z.boolean().optional(),
});

export const asesorSchema = z.object({
  nombre: optionalString(150),
  email: z.union([emailSchema, z.literal('')]).optional(),
  telefono: optionalString(20),
  institucion: optionalString(150),
});

export const equipoSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
});

export const eventoRegisterSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('miembro'),
    eventoId: z.coerce.number().int().positive(),
  }),
  z.object({
    tipo: z.literal('invitado'),
    eventoId: z.coerce.number().int().positive(),
  }),
  z.object({
    tipo: z.literal('equipo'),
    eventoId: z.coerce.number().int().positive(),
    equipo: equipoSchema,
    integrantes: z.array(integranteSchema).min(1).max(10),
    asesor: asesorSchema.optional().nullable(),
  }),
]);

export const authRegisterSchema = z.object({
  nombre: nameSchema,
  apellido_paterno: nameSchema,
  apellido_materno: optionalString(100),
  correo_electronico: emailSchema,
  contrasena: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  confirmar_contrasena: z.string().min(8).max(128),
  numero_telefono: phoneSchema,
  usuario_codeforces: z.string().trim().min(1).max(50),
  usuario_vjudge: z.string().trim().min(1).max(50),
  usuario_omegaup: z.string().trim().min(1).max(50),
  semestre: z.coerce.number().int().min(1).max(14),
  carrera: z.string().trim().min(1).max(150),
  es_computer_society: z.boolean().optional().default(false),
  es_club_programacion: z.boolean().optional().default(false),
  numero_ieee: z.union([z.string().regex(/^\d+$/, 'IEEE solo dígitos').max(20), z.literal(''), z.null()]).optional(),
}).refine((d) => d.contrasena === d.confirmar_contrasena, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmar_contrasena'],
}).refine((d) => d.es_club_programacion || d.es_computer_society, {
  message: 'Debes seleccionar al menos una afiliación',
  path: ['es_club_programacion'],
}).refine((d) => !d.es_computer_society || (d.numero_ieee && /^\d+$/.test(d.numero_ieee)), {
  message: 'Número IEEE requerido para Computer Society',
  path: ['numero_ieee'],
});

export const checkRegisterBatchSchema = z.object({
  eventIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});

/**
 * Helper: parsea con un schema y devuelve [data, errorResponse].
 * Si error, errorResponse es un payload listo para NextResponse.json.
 */
export function parseOrError(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return [result.data, null];
  const issue = result.error.issues[0];
  const message = issue ? `${issue.path.join('.') || 'campo'}: ${issue.message}` : 'Datos inválidos';
  return [null, { success: false, error: message, issues: result.error.issues }];
}
