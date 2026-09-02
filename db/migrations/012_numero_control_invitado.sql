-- 012: Número de control del invitado (alumnos del ITLAC).
--
-- Motivo: el formulario de inscripción ahora distingue entre "soy del ITLAC"
-- (carrera del catálogo + número de control) y "otra institución" (carrera
-- libre y opcional). No había dónde guardar el número de control: los miembros
-- del club no lo registran (su identidad es el correo) y el invitado sólo
-- tenía escuela/carrera como texto.
--
-- Aditivo e idempotente. La columna queda NULL para invitados de otras
-- instituciones y para los históricos.

BEGIN;

ALTER TABLE invitado
  ADD COLUMN IF NOT EXISTS numero_control character varying(20);
COMMENT ON COLUMN invitado.numero_control IS
  'Número de control institucional; se captura sólo cuando la persona es del Instituto Tecnológico de Lázaro Cárdenas.';

COMMIT;
