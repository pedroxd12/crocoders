-- Script para agregar el campo fecha_limite_registro a la tabla evento
-- Este campo permitirá definir una fecha y hora límite para las inscripciones
-- independiente de la fecha de inicio del evento

BEGIN;

-- Agregar el campo fecha_limite_registro a la tabla evento
-- Por defecto, será 1 hora antes del inicio del evento
-- IF NOT EXISTS permite ejecutar el script múltiples veces sin error
ALTER TABLE public.evento
ADD COLUMN IF NOT EXISTS fecha_limite_registro TIMESTAMP WITHOUT TIME ZONE;

-- Establecer valores predeterminados para eventos existentes
-- Se establece como 1 hora antes de la fecha_inicio + hora_inicio
UPDATE public.evento
SET fecha_limite_registro = (fecha_inicio || ' ' || hora_inicio)::timestamp - INTERVAL '1 hour'
WHERE fecha_limite_registro IS NULL;

-- Agregar comentario descriptivo al campo
COMMENT ON COLUMN public.evento.fecha_limite_registro 
IS 'Fecha y hora límite para registrarse en el evento. Después de esta fecha/hora no se permiten nuevas inscripciones.';

COMMIT;

-- Verificar los cambios
SELECT id_evento, nombre, fecha_inicio, hora_inicio, fecha_limite_registro
FROM public.evento
ORDER BY fecha_inicio DESC
LIMIT 5;
