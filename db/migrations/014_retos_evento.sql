-- 014: Retos (desafíos) de un evento, con cupo propio de equipos.
--
-- MOTIVO
-- ------
-- Un hackatón no se inscribe "al evento" a secas: cada equipo elige UN desafío
-- y cada desafío admite un número limitado de equipos. El sistema sólo sabía
-- de un aforo global (`evento.cupos`, medido en PERSONAS), así que no había
-- forma de repartir a los equipos entre retos ni de cerrar un reto cuando se
-- llenaba. Los desafíos del HackaItlac vivían además escritos a mano dentro de
-- un componente de React: publicar uno nuevo exigía tocar código y desplegar.
--
-- DECISIONES
-- ----------
--  - `reto_evento` cuelga de `evento` (no de `concurso`): un evento puede tener
--    retos sin ser un concurso por equipos, y borrar el evento se lleva sus
--    retos por delante (ON DELETE CASCADE).
--  - `cupo_equipos` cuenta INSCRIPCIONES (filas de `inscripcion_evento`), no
--    personas: en un evento por equipos una fila es un equipo, y en uno
--    individual es una persona. Es una unidad DISTINTA del aforo del evento
--    (`evento.cupos`, que se mide en lugares/personas) y las dos se comprueban
--    por separado al inscribirse. NULL = sin tope propio.
--    No hay contador denormalizado ni trigger a propósito: el número se deriva
--    siempre de las inscripciones reales (ver src/lib/retos.js), que es la
--    lección que dejó `evento.cupos_disponibles`.
--  - `inscripcion_evento.id_reto` con ON DELETE SET NULL como red de seguridad;
--    el borrado de un reto con inscripciones lo bloquea el API con un mensaje
--    claro (se desactiva, no se borra).
--  - `evento.slug` identifica al evento que alimenta una landing propia
--    (/hackaitlac lee el que tiene slug = 'hackaitlac'). Único entre los
--    eventos vivos: un evento dado de baja no debe bloquear el identificador.
--
-- Aditiva e idempotente.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Identificador del evento para landings propias
-- ---------------------------------------------------------------------------
ALTER TABLE evento
  ADD COLUMN IF NOT EXISTS slug varchar(60);

COMMENT ON COLUMN evento.slug IS
  'Identificador estable para páginas propias del evento (p. ej. "hackaitlac", que alimenta /hackaitlac con sus retos). NULL en los eventos normales.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_evento_slug
  ON evento (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Retos del evento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reto_evento (
  id_reto      serial PRIMARY KEY,
  id_evento    integer NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
  -- Identificador legible dentro del evento: es el ancla de la landing y lo
  -- que viaja en ?reto= al preseleccionar el desafío en el registro.
  slug         varchar(80) NOT NULL,
  titulo       varchar(160) NOT NULL,
  -- Frase de una línea de la tarjeta.
  lede         varchar(300),
  -- Párrafo corto de la tarjeta (el "en corto" del reto).
  resumen      varchar(600),
  -- Texto largo del detalle.
  descripcion  text,
  entregable   text,
  patrocinador varchar(160),
  -- Texto libre: "$15,000 MXN", "Beca", "Estancia profesional"...
  premio       varchar(120),
  tags         text[] NOT NULL DEFAULT '{}',
  criterios    text[] NOT NULL DEFAULT '{}',
  -- Tope de equipos/inscripciones de ESTE reto. NULL = sin tope propio.
  cupo_equipos integer,
  imagen_url   varchar(500),
  imagen_key   varchar(255),
  -- Color de la tarjeta en la baraja de la landing (1..5 del manual de marca).
  tono         smallint NOT NULL DEFAULT 1,
  orden        integer NOT NULL DEFAULT 0,
  -- Retirar un reto sin borrarlo (conserva las inscripciones que ya tiene).
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reto_evento_slug_unico UNIQUE (id_evento, slug),
  CONSTRAINT reto_evento_cupo_check CHECK (cupo_equipos IS NULL OR cupo_equipos > 0),
  CONSTRAINT reto_evento_tono_check CHECK (tono BETWEEN 1 AND 5)
);

COMMENT ON TABLE reto_evento IS
  'Desafíos de un evento (hackatones y similares). Cada inscripción puede elegir uno y cada reto admite un número limitado de equipos.';

COMMENT ON COLUMN reto_evento.cupo_equipos IS
  'Tope de INSCRIPCIONES en este reto (un equipo = 1, una persona = 1). Unidad distinta de evento.cupos, que se mide en personas. NULL = sin tope.';

CREATE INDEX IF NOT EXISTS idx_reto_evento_evento ON reto_evento (id_evento, orden);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_reto_evento_updated_at') THEN
    CREATE TRIGGER trigger_reto_evento_updated_at
      BEFORE UPDATE ON reto_evento
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Reto elegido por cada inscripción
-- ---------------------------------------------------------------------------
ALTER TABLE inscripcion_evento
  ADD COLUMN IF NOT EXISTS id_reto integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inscripcion_evento_id_reto_fkey'
  ) THEN
    ALTER TABLE inscripcion_evento
      ADD CONSTRAINT inscripcion_evento_id_reto_fkey
      FOREIGN KEY (id_reto) REFERENCES reto_evento(id_reto) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN inscripcion_evento.id_reto IS
  'Reto elegido por esta inscripción. NULL en eventos sin retos (o en inscripciones anteriores a que el evento tuviera).';

CREATE INDEX IF NOT EXISTS idx_inscripcion_reto ON inscripcion_evento (id_reto);

COMMIT;
