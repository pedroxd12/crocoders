-- 008: Configuración de asesores por concurso y soporte de varios asesores.
--
-- Motivo: el concurso sólo sabía "requiere asesor sí/no". Faltaba poder decir
-- (a) si el asesor participa como integrante del equipo o va aparte ("equipos
-- de 3 integrantes + asesor"), y (b) cuántos asesores puede registrar un
-- equipo. Además `equipo_concurso` sólo tenía columnas para UN asesor.
--
-- Aditivo: columnas con DEFAULT, tabla nueva y backfill idempotente. Las
-- columnas legadas *_asesor de equipo_concurso se CONSERVAN (las lee el panel
-- de asistentes); el código nuevo escribe al primer asesor en ambas partes.

BEGIN;

-- 1) Config del concurso.
ALTER TABLE concurso
  ADD COLUMN IF NOT EXISTS asesor_participa boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN concurso.asesor_participa IS
  'true = el asesor compite como integrante del equipo; false = va aparte y no ocupa lugar (equipo de N integrantes + asesor).';

ALTER TABLE concurso
  ADD COLUMN IF NOT EXISTS max_asesores integer NOT NULL DEFAULT 1;
ALTER TABLE concurso DROP CONSTRAINT IF EXISTS concurso_max_asesores_check;
ALTER TABLE concurso ADD CONSTRAINT concurso_max_asesores_check
  CHECK (max_asesores >= 1 AND max_asesores <= 5);
COMMENT ON COLUMN concurso.max_asesores IS
  'Cuántos asesores puede registrar un equipo (el formulario ofrece "Agregar asesor" hasta este tope).';

-- 2) Varios asesores por equipo.
CREATE TABLE IF NOT EXISTS asesor_equipo (
  id_asesor integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_equipo integer NOT NULL REFERENCES equipo_concurso(id_equipo) ON DELETE CASCADE,
  nombre character varying(150) NOT NULL,
  correo character varying(200),
  telefono character varying(20),
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asesor_equipo_equipo ON asesor_equipo (id_equipo);
COMMENT ON TABLE asesor_equipo IS
  'Asesores de un equipo de concurso (hasta concurso.max_asesores). El primero se duplica en las columnas legadas *_asesor de equipo_concurso.';

-- 3) Backfill: los asesores ya guardados en las columnas legadas pasan a la
--    tabla nueva (sólo si aún no están, para poder re-ejecutar la migración).
INSERT INTO asesor_equipo (id_equipo, nombre, correo, telefono)
SELECT ec.id_equipo, ec.nombre_asesor, ec.correo_asesor, ec.telefono_asesor
  FROM equipo_concurso ec
 WHERE ec.nombre_asesor IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM asesor_equipo a WHERE a.id_equipo = ec.id_equipo);

COMMIT;
