-- 015: Aforo por equipos, ganadores, mesas y plantillas de documentos.
--
-- MOTIVO
-- ------
-- 1. AFORO. `evento.cupos` se medía siempre en PERSONAS: un equipo de 3
--    consumía 3 lugares. En un concurso por equipos eso no describe nada real
--    (el HackaItlac tenía cupos=40 con 5 desafíos de 8 equipos: se habría
--    cerrado con 13 equipos). Desde esta migración la UNIDAD del aforo depende
--    de la modalidad: en concursos por equipos `cupos` cuenta EQUIPOS (una
--    inscripción = un equipo = un cupo) y en el resto cuenta PERSONAS. Y si
--    todos los desafíos activos tienen cupo, el aforo del evento se DERIVA de su
--    suma (src/lib/eventos-cupos.js). No hace falta cambiar columnas: sólo se
--    documenta la unidad, el código es quien la aplica.
-- 2. GANADORES. Las tablas `resultado_equipo_concurso` y
--    `participacion_concurso_individual` están vacías y nadie las escribe; no
--    saben de desafíos ni de inscripciones. `ganador_evento` cuelga de la
--    INSCRIPCIÓN (equipo o persona) y opcionalmente de un desafío: "ganador del
--    reto X" o "1er lugar general". `evento.resultados_publicados` decide si la
--    web los muestra.
-- 3. MESAS. Asignación de mesa/lugar por inscripción (evento) o por
--    participante (programa). Texto libre corto ("Mesa 12", "A-3"); la
--    numeración automática la hace el API.
-- 4. PLANTILLAS. Certificados, gafetes y reconocimientos se generan sobre un
--    PDF de diseño subido por administración; `campos` guarda dónde va cada
--    dato (en % del ancho/alto de la página). Una plantilla pertenece a UN
--    evento o a UN programa (XOR, igual que `evidencia`).
--
-- Aditiva e idempotente.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Unidad del aforo (documentación; la lógica vive en el código)
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN evento.cupos IS
  'Aforo del evento. UNIDAD según modalidad: en concursos por equipos cuenta EQUIPOS (una inscripción = un equipo); en el resto cuenta PERSONAS. Si todos los desafíos activos tienen cupo, se deriva de su suma (src/lib/eventos-cupos.js). NULL = ilimitado.';
COMMENT ON COLUMN evento.cupos_disponibles IS
  'Caché derivada de las inscripciones vivas (recalcularCupos). Misma unidad que cupos. No sumar ni restar a mano.';

-- ---------------------------------------------------------------------------
-- 2. Mesas
-- ---------------------------------------------------------------------------
ALTER TABLE evento
  ADD COLUMN IF NOT EXISTS asignar_mesas boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN evento.asignar_mesas IS
  'true = el evento reparte mesas/lugares: el panel muestra la columna y permite asignarlas.';

ALTER TABLE programa_recurrente
  ADD COLUMN IF NOT EXISTS asignar_mesas boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN programa_recurrente.asignar_mesas IS
  'true = el programa reparte mesas/lugares a sus participantes.';

ALTER TABLE inscripcion_evento
  ADD COLUMN IF NOT EXISTS mesa varchar(40);
COMMENT ON COLUMN inscripcion_evento.mesa IS
  'Mesa o lugar asignado a la inscripción (a todo el equipo en concursos por equipos). Texto libre corto.';

ALTER TABLE inscripcion_programa
  ADD COLUMN IF NOT EXISTS mesa varchar(40);
COMMENT ON COLUMN inscripcion_programa.mesa IS
  'Mesa o lugar asignado al participante durante todo el programa.';

-- ---------------------------------------------------------------------------
-- 3. Ganadores
-- ---------------------------------------------------------------------------
ALTER TABLE evento
  ADD COLUMN IF NOT EXISTS resultados_publicados boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN evento.resultados_publicados IS
  'true = los ganadores del evento se muestran en la web pública (/eventos/[id]/ganadores).';

CREATE TABLE IF NOT EXISTS ganador_evento (
  id_ganador     serial PRIMARY KEY,
  id_evento      integer NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
  -- NULL = clasificación general del evento; con valor = ganador de ESE desafío.
  id_reto        integer REFERENCES reto_evento(id_reto) ON DELETE CASCADE,
  -- La inscripción premiada: un equipo en concursos por equipos, una persona
  -- en el resto. Si se cancela/borra la inscripción, el premio se va con ella.
  id_inscripcion integer NOT NULL REFERENCES inscripcion_evento(id_inscripcion) ON DELETE CASCADE,
  posicion       integer NOT NULL,
  -- Etiqueta opcional del lugar ("Mención honorífica", "Mejor diseño").
  titulo         varchar(120),
  premio         varchar(200),
  notas          text,
  created_at     timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ganador_evento_posicion_check CHECK (posicion > 0),
  -- Un solo ganador por posición dentro de cada desafío (o de la general).
  -- NULLS NOT DISTINCT: dos filas con id_reto NULL y la misma posición chocan.
  CONSTRAINT ganador_evento_posicion_unica UNIQUE NULLS NOT DISTINCT (id_evento, id_reto, posicion),
  -- Una inscripción premia una sola vez por desafío (puede ganar su reto Y un
  -- lugar general).
  CONSTRAINT ganador_evento_inscripcion_unica UNIQUE NULLS NOT DISTINCT (id_evento, id_reto, id_inscripcion)
);

COMMENT ON TABLE ganador_evento IS
  'Ganadores de un evento: por desafío (id_reto) o clasificación general (id_reto NULL). Apunta a la inscripción premiada (equipo o persona).';

CREATE INDEX IF NOT EXISTS idx_ganador_evento_evento ON ganador_evento (id_evento, id_reto, posicion);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_ganador_evento_updated_at') THEN
    CREATE TRIGGER trigger_ganador_evento_updated_at
      BEFORE UPDATE ON ganador_evento
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Plantillas de documentos (certificados, gafetes, reconocimientos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantilla_documento (
  id_plantilla serial PRIMARY KEY,
  id_evento    integer REFERENCES evento(id_evento) ON DELETE CASCADE,
  id_programa  integer REFERENCES programa_recurrente(id_programa) ON DELETE CASCADE,
  -- certificado | gafete | reconocimiento. Es una etiqueta para el admin y
  -- decide los campos sugeridos; la audiencia se elige al generar.
  tipo         varchar(20) NOT NULL,
  nombre       varchar(120) NOT NULL,
  -- PDF de diseño en UploadThing. Se usa la página `pagina` como fondo.
  pdf_url      varchar(500) NOT NULL,
  pdf_key      varchar(255) NOT NULL,
  pagina       integer NOT NULL DEFAULT 1,
  -- Colocación de cada dato: [{ clave, x, y, tamano, fuente, color,
  -- alineacion, ancho, mayusculas }] con x/y/ancho en % de la página.
  campos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT plantilla_documento_target_xor
    CHECK (((id_evento IS NOT NULL)::integer + (id_programa IS NOT NULL)::integer) = 1),
  CONSTRAINT plantilla_documento_tipo_check
    CHECK (tipo IN ('certificado', 'gafete', 'reconocimiento')),
  CONSTRAINT plantilla_documento_pagina_check CHECK (pagina >= 1)
);

COMMENT ON TABLE plantilla_documento IS
  'Plantilla PDF de certificado/gafete/reconocimiento de un evento o programa, con la posición de cada dato. Los documentos se generan bajo demanda (src/lib/documentos-pdf.js).';

CREATE INDEX IF NOT EXISTS idx_plantilla_documento_evento ON plantilla_documento (id_evento);
CREATE INDEX IF NOT EXISTS idx_plantilla_documento_programa ON plantilla_documento (id_programa);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_plantilla_documento_updated_at') THEN
    CREATE TRIGGER trigger_plantilla_documento_updated_at
      BEFORE UPDATE ON plantilla_documento
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

COMMIT;
