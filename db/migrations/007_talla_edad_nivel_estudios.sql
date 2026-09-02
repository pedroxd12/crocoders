-- 007: Datos de referencia del inscrito y talla configurable.
--
-- Motivo: el formulario de invitado no distinguía nivel de estudios (todo el
-- mundo era "universidad" implícita), no pedía edad, y no había forma de que
-- un evento o programa que entrega playera/kit pidiera la talla al inscribirse.
--
-- Todo es aditivo: columnas nuevas con DEFAULT o NULL y un CHECK que se AMPLÍA
-- (superconjunto del anterior), así que no toca datos existentes.

BEGIN;

-- 1) Interruptor por evento/programa: el formulario de inscripción pide talla.
ALTER TABLE evento
  ADD COLUMN IF NOT EXISTS solicitar_talla boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN evento.solicitar_talla IS
  'Si es true, el formulario público de inscripción pide talla de playera (miembros, invitados y cada integrante de equipo).';

ALTER TABLE programa_recurrente
  ADD COLUMN IF NOT EXISTS solicitar_talla boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN programa_recurrente.solicitar_talla IS
  'Si es true, el formulario público de inscripción pide talla de playera.';

-- 2) Ficha del invitado: edad y talla.
ALTER TABLE invitado ADD COLUMN IF NOT EXISTS edad integer;
ALTER TABLE invitado ADD COLUMN IF NOT EXISTS talla_playera character varying(5);

ALTER TABLE invitado DROP CONSTRAINT IF EXISTS invitado_edad_check;
ALTER TABLE invitado ADD CONSTRAINT invitado_edad_check
  CHECK (edad IS NULL OR (edad >= 5 AND edad <= 120));

ALTER TABLE invitado DROP CONSTRAINT IF EXISTS invitado_talla_playera_check;
ALTER TABLE invitado ADD CONSTRAINT invitado_talla_playera_check
  CHECK (talla_playera IS NULL OR talla_playera IN ('XS','S','M','L','XL','XXL','XXXL'));

-- 3) Niveles de estudio ampliados. El CHECK anterior sólo admitía
--    preparatoria/universidad/otro; se añaden secundaria y maestría.
ALTER TABLE invitado DROP CONSTRAINT IF EXISTS invitado_nivel_estudios_check;
ALTER TABLE invitado ADD CONSTRAINT invitado_nivel_estudios_check
  CHECK (nivel_estudios IS NULL OR (nivel_estudios)::text = ANY (ARRAY[
    'secundaria'::text, 'preparatoria'::text, 'universidad'::text,
    'maestria'::text, 'otro'::text
  ]));

-- 4) Talla del miembro (se guarda en su ficha; la pide el registro a un evento
--    con solicitar_talla y queda para los siguientes).
ALTER TABLE miembro ADD COLUMN IF NOT EXISTS talla_playera character varying(5);

ALTER TABLE miembro DROP CONSTRAINT IF EXISTS miembro_talla_playera_check;
ALTER TABLE miembro ADD CONSTRAINT miembro_talla_playera_check
  CHECK (talla_playera IS NULL OR talla_playera IN ('XS','S','M','L','XL','XXL','XXXL'));

COMMIT;
