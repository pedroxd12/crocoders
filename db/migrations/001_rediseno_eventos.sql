-- =========================================================================
-- Migración 001 — Rediseño de gestión de eventos
-- PostgreSQL 14+
--
-- Idempotente: puede ejecutarse repetidamente. Está adaptada al esquema REAL
-- de la base 'club' (Railway), que difiere del schema.sql histórico:
--   * catalogo_rol_staff usa puede_administrar/puede_editar/puede_ver (no JSONB).
--   * Los catálogos ya están sembrados -> NO se re-siembran aquí.
--   * evento.fecha_fin/hora_fin son NOT NULL; existen CHECKs costo_requerido,
--     evento_cupos_check (cupos > 0), fecha_valida, hora_valida.
--   * inscripcion_programa ya materializa los campos de certificado.
--   * sesion_programa.id_evento es NOT NULL -> se vuelve NULLABLE.
--
-- Cambios que aplica:
--  1. Tablas faltantes: asistencia_miembro, asistencia_invitado, juez_evento,
--     evento_imagenes.
--  2. sesion_programa: id_evento NULLABLE + fecha/hora/ubicación propias
--     (sesiones sin evento espejo).
--  3. evento.listable (eventos internos no listables en catálogo público).
--  4. programa_recurrente: dias_semana / hora_inicio / hora_fin (plantilla).
--  5. Rol de staff "Juez" (idempotente) usando las columnas reales.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Asistencia granular por sesión de programa
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asistencia_miembro (
    id_asistencia SERIAL PRIMARY KEY,
    id_sesion     INT NOT NULL REFERENCES sesion_programa(id_sesion) ON DELETE CASCADE,
    id_miembro    INT NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    asistio       BOOLEAN NOT NULL DEFAULT FALSE,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asistencia_miembro UNIQUE (id_sesion, id_miembro)
);
CREATE INDEX IF NOT EXISTS idx_asistencia_miembro_miembro ON asistencia_miembro (id_miembro);

CREATE TABLE IF NOT EXISTS asistencia_invitado (
    id_asistencia SERIAL PRIMARY KEY,
    id_sesion     INT NOT NULL REFERENCES sesion_programa(id_sesion) ON DELETE CASCADE,
    id_invitado   INT NOT NULL REFERENCES invitado(id_invitado) ON DELETE CASCADE,
    asistio       BOOLEAN NOT NULL DEFAULT FALSE,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asistencia_invitado UNIQUE (id_sesion, id_invitado)
);
CREATE INDEX IF NOT EXISTS idx_asistencia_invitado_invitado ON asistencia_invitado (id_invitado);

-- -------------------------------------------------------------------------
-- 2. Imágenes de evento (galería) — tabla usada por el código existente
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evento_imagenes (
    id_imagen      SERIAL PRIMARY KEY,
    id_evento      INT NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta           VARCHAR(255) NOT NULL,
    tipo_mime      VARCHAR(100),
    tamanio        BIGINT,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evento_imagenes_evento ON evento_imagenes (id_evento);

-- -------------------------------------------------------------------------
-- 3. Jueces de evento / concurso
-- -------------------------------------------------------------------------
-- Un juez puede no ser miembro del sistema; por eso se guardan sus datos de
-- contacto. `procedencia` clasifica de dónde viene.
CREATE TABLE IF NOT EXISTS juez_evento (
    id_juez            SERIAL PRIMARY KEY,
    id_evento          INT NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
    id_miembro         INT REFERENCES miembro(id_miembro) ON DELETE SET NULL,
    nombre_completo    VARCHAR(200) NOT NULL,
    correo_electronico VARCHAR(200),
    numero_telefono    VARCHAR(20),
    institucion        VARCHAR(200),
    procedencia        VARCHAR(30) NOT NULL DEFAULT 'otro'
                          CHECK (procedencia IN (
                            'club_programacion','computer_society','itlac',
                            'universitario','preparatoria','otro')),
    es_principal       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_juez_evento_evento  ON juez_evento (id_evento);
CREATE INDEX IF NOT EXISTS idx_juez_evento_miembro ON juez_evento (id_miembro);
CREATE UNIQUE INDEX IF NOT EXISTS uq_juez_evento_miembro
    ON juez_evento (id_evento, id_miembro)
    WHERE id_miembro IS NOT NULL;

-- -------------------------------------------------------------------------
-- 4. Evento: bandera de catálogo público
-- -------------------------------------------------------------------------
ALTER TABLE evento
    ADD COLUMN IF NOT EXISTS listable BOOLEAN NOT NULL DEFAULT TRUE;

-- -------------------------------------------------------------------------
-- 5. Programa recurrente: plantilla de generación de sesiones
-- -------------------------------------------------------------------------
ALTER TABLE programa_recurrente ADD COLUMN IF NOT EXISTS dias_semana INT[];
ALTER TABLE programa_recurrente ADD COLUMN IF NOT EXISTS hora_inicio TIME;
ALTER TABLE programa_recurrente ADD COLUMN IF NOT EXISTS hora_fin    TIME;
-- (activo ya existe en la DB real.)

-- -------------------------------------------------------------------------
-- 6. Sesión de programa: datos propios + id_evento OPCIONAL
-- -------------------------------------------------------------------------
-- La sesión deja de necesitar un evento espejo para llevar fecha/hora/asistencia.
ALTER TABLE sesion_programa ALTER COLUMN id_evento DROP NOT NULL;
ALTER TABLE sesion_programa ADD COLUMN IF NOT EXISTS fecha       DATE;
ALTER TABLE sesion_programa ADD COLUMN IF NOT EXISTS hora_inicio TIME;
ALTER TABLE sesion_programa ADD COLUMN IF NOT EXISTS hora_fin    TIME;
ALTER TABLE sesion_programa ADD COLUMN IF NOT EXISTS ubicacion   VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_sesion_programa_fecha ON sesion_programa (fecha);

-- Garantizar el UNIQUE parcial por evento (solo cuando id_evento no es NULL),
-- reemplazando cualquier UNIQUE total preexistente que impida múltiples NULL.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname='sesion_programa' AND con.contype='u'
       AND pg_get_constraintdef(con.oid) ILIKE '%(id_evento)%'
  LOOP
    EXECUTE format('ALTER TABLE sesion_programa DROP CONSTRAINT %I', c);
  END LOOP;
END$$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_programa_evento
    ON sesion_programa (id_evento) WHERE id_evento IS NOT NULL;

-- -------------------------------------------------------------------------
-- 7. Rol de staff "Juez" (idempotente, usando las columnas reales)
-- -------------------------------------------------------------------------
INSERT INTO catalogo_rol_staff (nombre, puede_administrar, puede_editar, puede_ver)
VALUES ('Juez', FALSE, FALSE, TRUE)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
