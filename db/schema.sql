-- =========================================================================
-- Crocoders — Schema versionado
-- PostgreSQL 14+
--
-- Este archivo es la fuente de verdad del esquema. Idempotente: se puede
-- ejecutar repetidamente para llevar una base "from scratch" al estado actual.
--
-- Convenciones:
--  * Identificadores en snake_case.
--  * Timestamps en UTC con `timestamptz`.
--  * Borrados lógicos con `deleted_at` donde aplica.
--  * Las constraints UNIQUE están nombradas para poder mapearlas al SQLSTATE
--    23505 desde la aplicación.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- Catálogos
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS catalogo_carrera (
    id_carrera   SERIAL PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL,
    codigo       VARCHAR(20)  NOT NULL,
    CONSTRAINT uq_catalogo_carrera_codigo UNIQUE (codigo),
    CONSTRAINT uq_catalogo_carrera_nombre UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS catalogo_tipo_evento (
    id_tipo_evento SERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    permite_equipos BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_catalogo_tipo_evento_nombre UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS catalogo_alcance_evento (
    id_alcance SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    CONSTRAINT uq_catalogo_alcance_nombre UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS catalogo_plataforma (
    id_plataforma SERIAL PRIMARY KEY,
    nombre        VARCHAR(50) NOT NULL,
    CONSTRAINT uq_catalogo_plataforma_nombre UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS catalogo_rol_staff (
    id_rol   SERIAL PRIMARY KEY,
    nombre   VARCHAR(50) NOT NULL,
    permisos JSONB,
    CONSTRAINT uq_catalogo_rol_staff_nombre UNIQUE (nombre)
);

-- -------------------------------------------------------------------------
-- Usuarios y autenticación
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS miembro (
    id_miembro          SERIAL PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    apellido_paterno    VARCHAR(100) NOT NULL,
    apellido_materno    VARCHAR(100),
    correo_electronico  VARCHAR(200) NOT NULL,
    contrasena          VARCHAR(255) NOT NULL,
    numero_telefono     VARCHAR(20),
    id_carrera          INT REFERENCES catalogo_carrera(id_carrera) ON DELETE SET NULL,
    semestre_ingreso    INT,
    semestre_actual     INT,
    periodo_ingreso     VARCHAR(30),
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo',
    rol                 VARCHAR(30) NOT NULL DEFAULT 'usuario'
                            CHECK (rol IN ('administrador', 'usuario', 'staff')),
    es_club_programacion BOOLEAN NOT NULL DEFAULT FALSE,
    es_computer_society  BOOLEAN NOT NULL DEFAULT FALSE,
    numero_ieee         VARCHAR(20),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT uq_miembro_correo UNIQUE (correo_electronico)
);

CREATE INDEX IF NOT EXISTS idx_miembro_rol            ON miembro (rol);
CREATE INDEX IF NOT EXISTS idx_miembro_estado         ON miembro (estado);
CREATE INDEX IF NOT EXISTS idx_miembro_carrera        ON miembro (id_carrera);
CREATE INDEX IF NOT EXISTS idx_miembro_correo_lower   ON miembro (LOWER(correo_electronico));

CREATE TABLE IF NOT EXISTS invitado (
    id_invitado         SERIAL PRIMARY KEY,
    nombre_completo     VARCHAR(200) NOT NULL,
    correo_electronico  VARCHAR(200) NOT NULL,
    numero_telefono     VARCHAR(20),
    escuela_institucion VARCHAR(200),
    carrera             VARCHAR(150),
    semestre            INT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invitado_correo UNIQUE (correo_electronico)
);

CREATE INDEX IF NOT EXISTS idx_invitado_correo_lower ON invitado (LOWER(correo_electronico));

CREATE TABLE IF NOT EXISTS cuenta_plataforma (
    id_cuenta     SERIAL PRIMARY KEY,
    id_miembro    INT NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_plataforma INT NOT NULL REFERENCES catalogo_plataforma(id_plataforma) ON DELETE CASCADE,
    usuario       VARCHAR(100) NOT NULL,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cuenta_plataforma_miembro_plataforma UNIQUE (id_miembro, id_plataforma)
);

CREATE INDEX IF NOT EXISTS idx_cuenta_plataforma_miembro    ON cuenta_plataforma (id_miembro);
CREATE INDEX IF NOT EXISTS idx_cuenta_plataforma_plataforma ON cuenta_plataforma (id_plataforma);

CREATE TABLE IF NOT EXISTS password_reset_token (
    id_token            SERIAL PRIMARY KEY,
    id_miembro          INT NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    token               VARCHAR(128) NOT NULL,
    codigo_verificacion VARCHAR(10)  NOT NULL,
    expires_at          TIMESTAMPTZ  NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_password_reset_token_token UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_miembro     ON password_reset_token (id_miembro);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_expires_at  ON password_reset_token (expires_at);

-- -------------------------------------------------------------------------
-- Eventos y concursos
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evento (
    id_evento              SERIAL PRIMARY KEY,
    nombre                 VARCHAR(200) NOT NULL,
    descripcion_html       TEXT,
    id_tipo_evento         INT NOT NULL REFERENCES catalogo_tipo_evento(id_tipo_evento),
    id_alcance             INT NOT NULL REFERENCES catalogo_alcance_evento(id_alcance),
    fecha_inicio           DATE NOT NULL,
    fecha_fin              DATE,
    fecha_limite_registro  TIMESTAMPTZ,
    hora_inicio            TIME NOT NULL,
    hora_fin               TIME,
    ubicacion              VARCHAR(255),
    cupos                  INT NOT NULL DEFAULT 0 CHECK (cupos >= 0),
    cupos_disponibles      INT NOT NULL DEFAULT 0 CHECK (cupos_disponibles >= 0),
    tiene_costo            BOOLEAN NOT NULL DEFAULT FALSE,
    costo                  NUMERIC(10,2) NOT NULL DEFAULT 0,
    imagen_flyer_url       TEXT,
    imagen_flyer_key       TEXT,
    estado                 VARCHAR(20) NOT NULL DEFAULT 'publicado'
                              CHECK (estado IN ('borrador','publicado','en_curso','finalizado','cancelado')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evento_estado          ON evento (estado);
CREATE INDEX IF NOT EXISTS idx_evento_fecha_inicio    ON evento (fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_evento_tipo            ON evento (id_tipo_evento);
CREATE INDEX IF NOT EXISTS idx_evento_alcance         ON evento (id_alcance);
CREATE INDEX IF NOT EXISTS idx_evento_deleted_at      ON evento (deleted_at);

CREATE TABLE IF NOT EXISTS concurso (
    id_concurso             SERIAL PRIMARY KEY,
    id_evento               INT NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
    id_plataforma           INT REFERENCES catalogo_plataforma(id_plataforma) ON DELETE SET NULL,
    modalidad               VARCHAR(20) NOT NULL DEFAULT 'individual'
                                CHECK (modalidad IN ('individual','equipos')),
    max_integrantes_equipo  INT,
    min_integrantes_equipo  INT,
    requiere_asesor         BOOLEAN NOT NULL DEFAULT FALSE,
    url_concurso            TEXT,
    CONSTRAINT uq_concurso_evento UNIQUE (id_evento)
);

CREATE INDEX IF NOT EXISTS idx_concurso_plataforma ON concurso (id_plataforma);

CREATE TABLE IF NOT EXISTS equipo_concurso (
    id_equipo            SERIAL PRIMARY KEY,
    id_concurso          INT NOT NULL REFERENCES concurso(id_concurso) ON DELETE CASCADE,
    nombre_equipo        VARCHAR(150) NOT NULL,
    nombre_asesor        VARCHAR(150),
    correo_asesor        VARCHAR(200),
    telefono_asesor      VARCHAR(20),
    institucion_asesor   VARCHAR(200),
    registro_completo    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_equipo_concurso_nombre UNIQUE (id_concurso, nombre_equipo)
);

CREATE INDEX IF NOT EXISTS idx_equipo_concurso ON equipo_concurso (id_concurso);

CREATE TABLE IF NOT EXISTS integrante_equipo (
    id_integrante  SERIAL PRIMARY KEY,
    id_equipo      INT NOT NULL REFERENCES equipo_concurso(id_equipo) ON DELETE CASCADE,
    id_miembro     INT REFERENCES miembro(id_miembro) ON DELETE SET NULL,
    id_invitado    INT REFERENCES invitado(id_invitado) ON DELETE SET NULL,
    es_capitan     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Exactamente un identificador (miembro o invitado), nunca ambos ni ninguno.
    CONSTRAINT ck_integrante_uno_y_solo_uno CHECK (
        (id_miembro IS NOT NULL)::int + (id_invitado IS NOT NULL)::int = 1
    ),
    -- Un mismo miembro/invitado no puede repetirse dentro del mismo equipo.
    CONSTRAINT uq_integrante_miembro_equipo  UNIQUE (id_equipo, id_miembro),
    CONSTRAINT uq_integrante_invitado_equipo UNIQUE (id_equipo, id_invitado)
);

CREATE INDEX IF NOT EXISTS idx_integrante_equipo_miembro  ON integrante_equipo (id_miembro);
CREATE INDEX IF NOT EXISTS idx_integrante_equipo_invitado ON integrante_equipo (id_invitado);

-- -------------------------------------------------------------------------
-- Inscripciones a eventos
-- -------------------------------------------------------------------------
-- Una inscripción referencia exactamente UNA de: miembro, invitado, equipo.
-- Las constraints UNIQUE parciales evitan duplicados por evento y discriminador,
-- y se mapean al SQLSTATE 23505 desde la app.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inscripcion_evento (
    id_inscripcion           SERIAL PRIMARY KEY,
    id_evento                INT NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
    id_miembro               INT REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_invitado              INT REFERENCES invitado(id_invitado) ON DELETE CASCADE,
    id_equipo                INT REFERENCES equipo_concurso(id_equipo) ON DELETE CASCADE,
    estado                   VARCHAR(20) NOT NULL DEFAULT 'confirmada'
                                 CHECK (estado IN ('pendiente','confirmada','cancelada')),
    fecha_inscripcion        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asistio                  BOOLEAN NOT NULL DEFAULT FALSE,
    hora_registro_asistencia TIMESTAMPTZ,
    pago_completado          BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Exactamente un identificador entre miembro / invitado / equipo.
    CONSTRAINT ck_inscripcion_un_solo_target CHECK (
        (id_miembro IS NOT NULL)::int +
        (id_invitado IS NOT NULL)::int +
        (id_equipo IS NOT NULL)::int = 1
    )
);

-- UNIQUE parciales por (evento, target) para evitar inscripciones duplicadas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inscripcion_evento_miembro
    ON inscripcion_evento (id_evento, id_miembro)
    WHERE id_miembro IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inscripcion_evento_invitado
    ON inscripcion_evento (id_evento, id_invitado)
    WHERE id_invitado IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inscripcion_evento_equipo
    ON inscripcion_evento (id_evento, id_equipo)
    WHERE id_equipo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inscripcion_evento_estado    ON inscripcion_evento (estado);
CREATE INDEX IF NOT EXISTS idx_inscripcion_evento_asistio   ON inscripcion_evento (id_evento, asistio);
CREATE INDEX IF NOT EXISTS idx_inscripcion_evento_evento    ON inscripcion_evento (id_evento);

-- -------------------------------------------------------------------------
-- Staff de eventos
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS staff_evento (
    id_staff   SERIAL PRIMARY KEY,
    id_evento  INT NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
    id_miembro INT NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_rol     INT NOT NULL REFERENCES catalogo_rol_staff(id_rol),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_evento_miembro UNIQUE (id_evento, id_miembro)
);

CREATE INDEX IF NOT EXISTS idx_staff_evento_evento  ON staff_evento (id_evento);
CREATE INDEX IF NOT EXISTS idx_staff_evento_miembro ON staff_evento (id_miembro);

-- -------------------------------------------------------------------------
-- Imágenes y evidencias de eventos
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

CREATE TABLE IF NOT EXISTS evidencia (
    id_evidencia  SERIAL PRIMARY KEY,
    id_evento     INT NOT NULL REFERENCES evento(id_evento) ON DELETE CASCADE,
    titulo        VARCHAR(255),
    url           TEXT NOT NULL,
    storage_key   TEXT,
    tipo          VARCHAR(30) NOT NULL DEFAULT 'imagen',
    fecha_captura TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publica       BOOLEAN NOT NULL DEFAULT TRUE,
    orden         INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_evidencia_evento  ON evidencia (id_evento);
CREATE INDEX IF NOT EXISTS idx_evidencia_publica ON evidencia (publica);

-- -------------------------------------------------------------------------
-- Programas recurrentes y sus sesiones
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS programa_recurrente (
    id_programa                       SERIAL PRIMARY KEY,
    nombre                            VARCHAR(200) NOT NULL,
    descripcion                       TEXT,
    fecha_inicio                      DATE NOT NULL,
    fecha_fin                         DATE NOT NULL,
    id_tipo_evento                    INT NOT NULL REFERENCES catalogo_tipo_evento(id_tipo_evento),
    id_alcance                        INT NOT NULL REFERENCES catalogo_alcance_evento(id_alcance),
    sesiones_requeridas_certificado   INT NOT NULL DEFAULT 0,
    porcentaje_asistencia_minimo      NUMERIC(5,2) NOT NULL DEFAULT 80.00,
    ubicacion                         VARCHAR(255),
    imagen_url                        TEXT,
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sesion_programa (
    id_sesion       SERIAL PRIMARY KEY,
    id_programa     INT NOT NULL REFERENCES programa_recurrente(id_programa) ON DELETE CASCADE,
    id_evento       INT REFERENCES evento(id_evento) ON DELETE SET NULL,
    numero_sesion   INT NOT NULL,
    titulo          VARCHAR(255),
    descripcion     TEXT,
    es_obligatoria  BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_sesion_programa_numero UNIQUE (id_programa, numero_sesion),
    CONSTRAINT uq_sesion_programa_evento UNIQUE (id_evento)
);

CREATE INDEX IF NOT EXISTS idx_sesion_programa_programa ON sesion_programa (id_programa);

CREATE TABLE IF NOT EXISTS inscripcion_programa (
    id_inscripcion_programa SERIAL PRIMARY KEY,
    id_programa             INT NOT NULL REFERENCES programa_recurrente(id_programa) ON DELETE CASCADE,
    id_miembro              INT REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_invitado             INT REFERENCES invitado(id_invitado) ON DELETE CASCADE,
    fecha_inscripcion       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_inscripcion_programa_target CHECK (
        (id_miembro IS NOT NULL)::int + (id_invitado IS NOT NULL)::int = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inscripcion_programa_miembro
    ON inscripcion_programa (id_programa, id_miembro)
    WHERE id_miembro IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inscripcion_programa_invitado
    ON inscripcion_programa (id_programa, id_invitado)
    WHERE id_invitado IS NOT NULL;

-- -------------------------------------------------------------------------
-- Asistencia (granulada para programas)
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

COMMIT;
