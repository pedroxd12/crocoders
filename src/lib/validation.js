import { z } from 'zod';
import { PLATAFORMAS, limpiarUsuario } from './plataformas';
import { TALLAS_PLAYERA, NIVELES_ESTUDIO_VALUES } from './registro-campos';
import { MAX_INTEGRANTES_EQUIPO, MAX_ASESORES_EQUIPO } from './concurso-reglas';

// Talla de playera: los valores válidos viven en registro-campos.js y coinciden
// con los CHECK de la base (invitado/miembro.talla_playera).
const tallaSchema = z.enum(TALLAS_PLAYERA, { message: 'Talla de playera no válida' });

const emailSchema = z.string().trim().toLowerCase().email('Email no válido').max(200);
const phoneSchema = z.string().trim().regex(/^[0-9]{10,15}$/, 'Teléfono debe tener 10-15 dígitos');
const nameSchema = z.string().trim().min(1, 'Este campo es obligatorio').max(100, 'Máximo 100 caracteres');
// El `.max()` también lleva mensaje en español: sin él, pasarse de largo en un
// campo opcional (apellido materno, un handle de plataforma) devolvía el texto
// por defecto de zod en inglés, y ese string viaja tal cual hasta el toast.
const optionalString = (max = 200) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).optional().or(z.literal(''));

/**
 * Handle de plataforma competitiva: opcional, pero si viene tiene que servir
 * para consultar la API de esa plataforma. Antes se exigía `min(1)` y luego el
 * servidor descartaba en silencio lo que no casara con el formato real, así que
 * el usuario creía haber configurado su perfil y nunca aparecía en /puntajes.
 */
const handleSchema = (plataforma, etiqueta) =>
  optionalString(50).refine(
    (v) => !v || limpiarUsuario(plataforma, v) !== '',
    `El usuario de ${etiqueta} no tiene un formato válido`,
  );

export const integranteSchema = z.object({
  nombre: nameSchema,
  email: emailSchema,
  telefono: optionalString(20),
  institucion: optionalString(150),
  carrera: optionalString(150),
  // Sólo alumnos del ITLAC (el formulario lo pide al elegir esa institución).
  numero_control: optionalString(20),
  semestre: z.union([z.string(), z.number()]).optional().nullable(),
  // Obligatoria sólo cuando el evento tiene `solicitar_talla` (lo comprueba el
  // endpoint contra la fila del evento, no el esquema).
  talla_playera: z.union([tallaSchema, z.literal('')]).optional(),
  es_capitan: z.boolean().optional().default(false),
  es_miembro: z.boolean().optional(),
});

export const asesorSchema = z.object({
  nombre: optionalString(150),
  email: z.union([emailSchema, z.literal('')]).optional(),
  telefono: optionalString(20),
  institucion: optionalString(150),
  // Al asesor también se le entrega playera cuando el evento la da. Sin esta
  // clave zod la descartaba (descarta las desconocidas) y la talla no llegaba
  // nunca a asesor_equipo.
  talla_playera: z.union([tallaSchema, z.literal('')]).optional(),
});

export const equipoSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
});

// Reto (desafío) elegido al inscribirse. Opcional en el esquema porque la
// mayoría de los eventos no tiene retos; que sea OBLIGATORIO cuando el evento
// sí los tiene lo decide el servidor contra la base (src/lib/retos.js), que es
// el único sitio que sabe si quedan plazas en ese reto.
const idRetoSchema = z.coerce.number().int().positive().optional().nullable();

export const eventoRegisterSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('miembro'),
    eventoId: z.coerce.number().int().positive(),
    // La pide el flujo cuando el evento tiene `solicitar_talla`; se guarda en
    // la ficha del miembro.
    talla_playera: tallaSchema.optional(),
    id_reto: idRetoSchema,
  }),
  z.object({
    tipo: z.literal('invitado'),
    eventoId: z.coerce.number().int().positive(),
    // id_invitado creado previamente vía POST /api/invitados.
    userId: z.coerce.number().int().positive(),
    id_reto: idRetoSchema,
  }),
  z.object({
    tipo: z.literal('equipo'),
    eventoId: z.coerce.number().int().positive(),
    id_reto: idRetoSchema,
    equipo: equipoSchema,
    integrantes: z.array(integranteSchema).min(1).max(MAX_INTEGRANTES_EQUIPO),
    // `asesores` es la forma actual (hasta concurso.max_asesores); `asesor`
    // se acepta por compatibilidad con clientes viejos (equivale a [asesor]).
    asesor: asesorSchema.optional().nullable(),
    asesores: z.array(asesorSchema).max(MAX_ASESORES_EQUIPO).optional(),
  }),
]);

// Retos (desafíos) de un evento — panel admin.
//
// `slug` NO se acepta del cliente: lo deriva el servidor del título
// (src/lib/retos.js) para que dos administradores que escriben el mismo título
// obtengan el mismo identificador y no haya slugs a medio teclear en la URL de
// la landing.
const listaTextoSchema = z.array(z.string().trim().min(1).max(300)).max(20).optional();

export const retoCreateSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(160, 'Máximo 160 caracteres'),
  lede: optionalString(300),
  resumen: optionalString(600),
  descripcion: z.string().trim().max(5000, 'Máximo 5000 caracteres').optional().or(z.literal('')),
  entregable: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional().or(z.literal('')),
  patrocinador: optionalString(160),
  premio: optionalString(120),
  tags: listaTextoSchema,
  criterios: listaTextoSchema,
  // Tope de equipos del reto. `null` = sin tope propio (sigue mandando el
  // aforo del evento).
  cupo_equipos: z.coerce.number().int().min(1, 'El cupo debe ser al menos 1').max(10000).optional().nullable(),
  imagen_url: z.union([z.string().trim().url('La URL de la imagen no es válida').max(500), z.literal(''), z.null()]).optional(),
  imagen_key: z.union([z.string().trim().max(255), z.literal(''), z.null()]).optional(),
  tono: z.coerce.number().int().min(1).max(5).optional(),
  orden: z.coerce.number().int().min(0).max(999).optional(),
  activo: z.boolean().optional(),
});

// Edición: mismos campos, todos opcionales, y al menos uno presente.
export const retoUpdateSchema = retoCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

// Alta de invitado (registro de externos sin cuenta).
export const invitadoSchema = z.object({
  nombre_completo: nameSchema.max(255),
  correo_electronico: emailSchema.max(255),
  numero_telefono: z.union([phoneSchema, z.literal('')]).optional(),
  escuela_institucion: optionalString(255),
  carrera: optionalString(100),
  // Sólo alumnos del ITLAC (el formulario lo pide al elegir esa institución).
  numero_control: optionalString(20),
  semestre: z.coerce.number().int().min(1).max(14).optional().nullable(),
  nivel_estudios: z.enum(NIVELES_ESTUDIO_VALUES, { message: 'Nivel de estudios no válido' }).optional(),
  edad: z.coerce.number().int().min(5, 'Edad no válida').max(120, 'Edad no válida').optional().nullable(),
  talla_playera: tallaSchema.optional(),
});

// Tipos de evidencia válidos (coincide con el CHECK de la tabla `evidencia`).
const tipoEvidenciaSchema = z.enum(['imagen', 'video', 'documento', 'enlace']);

// Alta de evidencia (metadata; el archivo ya se subió a UploadThing).
// Una evidencia pertenece a un EVENTO o a un PROGRAMA (XOR), nunca a ambos.
export const evidenciaCreateSchema = z.object({
  id_evento: z.coerce.number().int().positive().optional(),
  id_programa: z.coerce.number().int().positive().optional(),
  // El cliente puede mandar `nombre` (alias histórico) o `titulo`.
  titulo: z.string().trim().min(1).max(255).optional(),
  nombre: z.string().trim().min(1).max(255).optional(),
  imagen_url: z.string().trim().url().max(500),
  imagen_key: z.string().trim().min(1).max(255),
  tipo: tipoEvidenciaSchema.optional().default('imagen'),
  descripcion: z.string().trim().max(2000).optional().or(z.literal('')),
  publica: z.boolean().optional().default(true),
  orden: z.coerce.number().int().min(0).optional().default(0),
}).refine(
  (d) => (d.id_evento != null) !== (d.id_programa != null),
  { message: 'Debe indicarse exactamente uno de id_evento o id_programa', path: ['id_evento'] },
);

// Edición de evidencia: todos los campos opcionales, al menos uno presente.
export const evidenciaUpdateSchema = z.object({
  titulo: z.string().trim().min(1).max(255).optional(),
  descripcion: z.string().trim().max(2000).optional().or(z.literal('')),
  tipo: tipoEvidenciaSchema.optional(),
  publica: z.boolean().optional(),
  orden: z.coerce.number().int().min(0).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

/**
 * Alta pública de miembro.
 *
 * CONTRATO CON EL FORMULARIO (/iniciar). El registro RAMIFICA por afiliación:
 * la pregunta "¿de qué formas parte?" manda sobre el resto del formulario.
 *
 *   Siempre obligatorios:
 *     nombre, apellido_paterno, correo_electronico, contrasena,
 *     confirmar_contrasena, numero_telefono, semestre, carrera
 *     y al menos una afiliación (es_club_programacion | es_computer_society).
 *
 *   Club de programación (es_club_programacion = true):
 *     al menos UNO de usuario_codeforces / usuario_vjudge / usuario_omegaup.
 *     Los tres son opcionales por separado: quien compite en una sola
 *     plataforma no tiene que inventarse handles en las otras dos.
 *
 *   Computer Society (es_computer_society = true):
 *     numero_ieee OBLIGATORIO y de sólo dígitos. Ojo: en la BD `numero_ieee`
 *     es UNIQUE además de tener la constraint `numero_ieee_required_cs`, así
 *     que la cadena vacía NO puede llegar nunca al INSERT (el segundo registro
 *     sin IEEE chocaría contra el índice único). Cuando no es de Computer
 *     Society el schema lo normaliza a NULL, que es lo que la columna espera.
 *
 * Quien sólo pertenece al capítulo no necesita ningún handle; quien sólo está
 * en el club no necesita número IEEE.
 */
export const authRegisterSchema = z.object({
  nombre: nameSchema,
  apellido_paterno: nameSchema,
  apellido_materno: optionalString(100),
  correo_electronico: emailSchema,
  contrasena: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128, 'Máximo 128 caracteres'),
  confirmar_contrasena: z.string().min(8, 'Confirma tu contraseña').max(128),
  numero_telefono: phoneSchema,
  usuario_codeforces: handleSchema(PLATAFORMAS.CODEFORCES, 'Codeforces'),
  usuario_vjudge: handleSchema(PLATAFORMAS.VJUDGE, 'VJudge'),
  usuario_omegaup: handleSchema(PLATAFORMAS.OMEGAUP, 'OmegaUp'),
  semestre: z.coerce.number('Selecciona tu semestre').int().min(1, 'El semestre debe estar entre 1 y 14').max(14, 'El semestre debe estar entre 1 y 14'),
  // 100 y no 150: `catalogo_carrera.nombre` es varchar(100). Con 150 el INSERT
  // reventaba con un 22001 y el usuario recibía un 500 genérico irreparable.
  carrera: z.string().trim().min(1, 'Indica tu carrera').max(100, 'La carrera no puede superar 100 caracteres'),
  es_computer_society: z.boolean().optional().default(false),
  es_club_programacion: z.boolean().optional().default(false),
  numero_ieee: z.union([
    z.string().trim().regex(/^\d+$/, 'El número IEEE sólo puede tener dígitos').max(20, 'Máximo 20 dígitos'),
    z.literal(''),
    z.null(),
  ]).optional(),
}).superRefine((d, ctx) => {
  if (d.contrasena !== d.confirmar_contrasena) {
    ctx.addIssue({ code: 'custom', path: ['confirmar_contrasena'], message: 'Las contraseñas no coinciden' });
  }

  if (!d.es_club_programacion && !d.es_computer_society) {
    ctx.addIssue({ code: 'custom', path: ['es_club_programacion'], message: 'Debes seleccionar al menos una afiliación' });
  }

  if (d.es_club_programacion && !d.usuario_codeforces && !d.usuario_vjudge && !d.usuario_omegaup) {
    ctx.addIssue({
      code: 'custom',
      path: ['usuario_codeforces'],
      message: 'Indica al menos un perfil de plataforma (Codeforces, VJudge u OmegaUp)',
    });
  }

  if (d.es_computer_society && !/^\d+$/.test(String(d.numero_ieee ?? '').trim())) {
    ctx.addIssue({
      code: 'custom',
      path: ['numero_ieee'],
      message: 'El número IEEE es obligatorio para Computer Society',
    });
  }
}).transform((d) => ({
  ...d,
  // Nunca '' hacia la BD: `numero_ieee` es UNIQUE (ver comentario del contrato).
  numero_ieee: d.es_computer_society ? String(d.numero_ieee).trim() : null,
}));

export const checkRegisterBatchSchema = z.object({
  eventIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});

// Inscripción a un programa recurrente. Igual que eventos: miembro (con sesión)
// o invitado (id_invitado creado previamente vía /api/invitados).
export const programaRegisterSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('miembro'),
    programaId: z.coerce.number().int().positive(),
    // Igual que en eventos: se pide cuando el programa tiene `solicitar_talla`.
    talla_playera: tallaSchema.optional(),
  }),
  z.object({
    tipo: z.literal('invitado'),
    programaId: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive(),
  }),
]);

// Comprobante de pago de una inscripción a un evento con costo (migración 013).
// El archivo YA está en UploadThing cuando llega este payload: esto valida sólo
// la metadata. `qrToken` es la credencial firmada del inscrito (ver
// src/lib/comprobantes-pago.js); viaja en el cuerpo porque quien sube el
// comprobante puede no tener cuenta.
export const comprobantePagoSchema = z.object({
  qrToken: z.string().trim().min(1, 'Falta la credencial de la inscripción').max(4096),
  imagen_url: z.string().trim().url('La URL de la imagen no es válida').max(500),
  imagen_key: z.string().trim().min(1, 'Falta la clave del archivo').max(255),
  nombre_archivo: optionalString(255),
  // Folio o referencia de la transferencia, tal cual lo teclea quien paga.
  referencia: optionalString(120),
  monto_declarado: z.coerce
    .number('El monto no es válido')
    .min(0, 'El monto no puede ser negativo')
    .max(1000000, 'El monto no es válido')
    .optional()
    .nullable(),
});

// Revisión del comprobante por staff o administrador. Rechazar EXIGE motivo:
// sin él, quien pagó recibe un "rechazado" sin saber qué corregir y vuelve a
// subir el mismo archivo.
export const comprobanteRevisionSchema = z
  .object({
    estado: z.enum(['aprobado', 'rechazado', 'pendiente'], { message: 'Estado de revisión no válido' }),
    motivo_rechazo: z.string().trim().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
  })
  .superRefine((d, ctx) => {
    if (d.estado === 'rechazado' && !d.motivo_rechazo) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivo_rechazo'],
        message: 'Indica por qué se rechaza el comprobante',
      });
    }
  });

// El mensaje de error viaja tal cual hasta un toast del usuario, así que el
// prefijo no puede ser el nombre técnico de la columna ("usuario_codeforces:").
const ETIQUETAS_CAMPO = {
  nombre: 'Nombre',
  apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno',
  correo_electronico: 'Correo electrónico',
  email: 'Correo electrónico',
  contrasena: 'Contraseña',
  confirmar_contrasena: 'Confirmación de contraseña',
  numero_telefono: 'Teléfono',
  telefono: 'Teléfono',
  usuario_codeforces: 'Usuario de Codeforces',
  usuario_vjudge: 'Usuario de VJudge',
  usuario_omegaup: 'Usuario de OmegaUp',
  semestre: 'Semestre',
  carrera: 'Carrera',
  numero_ieee: 'Número IEEE',
  es_club_programacion: 'Afiliación',
  es_computer_society: 'Afiliación',
  nombre_completo: 'Nombre completo',
  escuela_institucion: 'Escuela o institución',
  institucion: 'Institución',
  numero_control: 'Número de control',
  nivel_estudios: 'Nivel de estudios',
  edad: 'Edad',
  talla_playera: 'Talla de playera',
  titulo: 'Título',
  cupo_equipos: 'Cupo de equipos',
  id_reto: 'Desafío',
  descripcion: 'Descripción',
  imagen_url: 'Imagen',
  qrToken: 'Credencial de la inscripción',
  referencia: 'Referencia del pago',
  monto_declarado: 'Monto pagado',
  motivo_rechazo: 'Motivo del rechazo',
};

/**
 * Helper: parsea con un schema y devuelve [data, errorResponse].
 * Si error, errorResponse es un payload listo para NextResponse.json.
 */
export function parseOrError(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return [result.data, null];
  const issue = result.error.issues[0];
  const campo = issue ? ETIQUETAS_CAMPO[issue.path?.[0]] || issue.path?.join('.') : '';
  const message = issue
    ? (campo ? `${campo}: ${issue.message}` : issue.message)
    : 'Datos inválidos';
  return [null, { success: false, error: message, issues: result.error.issues }];
}
