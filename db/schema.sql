-- =========================================================================
-- Crocoders — Schema (generado desde la base de datos OPERATIVA)
-- PostgreSQL 17
--
-- Este archivo se REGENERA con pg_dump desde la base 'club' (Railway), que es
-- la fuente de verdad. Refleja el estado real tras aplicar:
--   db/migrations/001_rediseno_eventos.sql
--   db/migrations/002_trigger_estadisticas_programa.sql
--
-- Para regenerarlo:
--   pg_dump --schema-only --no-owner --no-privileges \
--           --host=$DB_HOST --port=$DB_PORT --username=$DB_USER --dbname=$DB_NAME \
--           > db/schema.sql
--
-- No edites este archivo a mano: aplica una migración y vuelve a regenerarlo.
-- =========================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9 (Debian 17.9-1.pgdg13+1)
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: actualizar_cupos_evento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_cupos_evento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.estado = 'confirmada' THEN
        UPDATE evento 
        SET cupos_disponibles = cupos_disponibles - 1
        WHERE id_evento = NEW.id_evento AND cupos_disponibles > 0;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.estado != 'confirmada' AND NEW.estado = 'confirmada' THEN
            UPDATE evento 
            SET cupos_disponibles = cupos_disponibles - 1
            WHERE id_evento = NEW.id_evento AND cupos_disponibles > 0;
        ELSIF OLD.estado = 'confirmada' AND NEW.estado != 'confirmada' THEN
            UPDATE evento 
            SET cupos_disponibles = cupos_disponibles + 1
            WHERE id_evento = NEW.id_evento;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.estado = 'confirmada' THEN
        UPDATE evento 
        SET cupos_disponibles = cupos_disponibles + 1
        WHERE id_evento = OLD.id_evento;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: actualizar_estadisticas_programa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_estadisticas_programa() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id_sesion  INT;
    v_id_miembro INT;
    v_id_invitado INT;
    v_id_programa INT;
    v_total_oblig INT;
    v_asistidas   INT;
    v_pct         NUMERIC;
BEGIN
    -- Datos de la fila afectada (NEW en INSERT/UPDATE, OLD en DELETE).
    IF TG_OP = 'DELETE' THEN
        v_id_sesion := OLD.id_sesion;
    ELSE
        v_id_sesion := NEW.id_sesion;
    END IF;

    -- Â¿De quÃ© tabla de asistencia viene? (miembro o invitado)
    IF TG_TABLE_NAME = 'asistencia_miembro' THEN
        v_id_miembro := COALESCE(NEW.id_miembro, OLD.id_miembro);
    ELSE
        v_id_invitado := COALESCE(NEW.id_invitado, OLD.id_invitado);
    END IF;

    -- Programa al que pertenece la sesiÃ³n.
    SELECT id_programa INTO v_id_programa
      FROM sesion_programa WHERE id_sesion = v_id_sesion;
    IF v_id_programa IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Total de sesiones OBLIGATORIAS del programa (denominador).
    SELECT COUNT(*) FILTER (WHERE es_obligatoria) INTO v_total_oblig
      FROM sesion_programa WHERE id_programa = v_id_programa;

    -- Sesiones obligatorias efectivamente asistidas por este inscrito.
    IF v_id_miembro IS NOT NULL THEN
        SELECT COUNT(*) INTO v_asistidas
          FROM asistencia_miembro am
          JOIN sesion_programa sp ON am.id_sesion = sp.id_sesion
         WHERE sp.id_programa = v_id_programa
           AND sp.es_obligatoria
           AND am.id_miembro = v_id_miembro
           AND am.asistio;
    ELSE
        SELECT COUNT(*) INTO v_asistidas
          FROM asistencia_invitado ai
          JOIN sesion_programa sp ON ai.id_sesion = sp.id_sesion
         WHERE sp.id_programa = v_id_programa
           AND sp.es_obligatoria
           AND ai.id_invitado = v_id_invitado
           AND ai.asistio;
    END IF;

    v_pct := CASE WHEN v_total_oblig > 0
                  THEN ROUND(100.0 * v_asistidas / v_total_oblig, 2)
                  ELSE 0 END;

    -- Actualizar la inscripciÃ³n de programa correspondiente.
    -- No se toca certificado_emitido/fecha_certificado (eso lo decide el admin).
    UPDATE inscripcion_programa ip
       SET sesiones_asistidas    = v_asistidas,
           porcentaje_asistencia = v_pct,
           elegible_certificado  = (
               v_asistidas >= (SELECT COALESCE(sesiones_requeridas_certificado, 0)
                                 FROM programa_recurrente WHERE id_programa = v_id_programa)
               AND v_total_oblig > 0
               AND v_pct >= (SELECT COALESCE(porcentaje_asistencia_minimo, 80)
                               FROM programa_recurrente WHERE id_programa = v_id_programa)
           ),
           updated_at = NOW()
     WHERE ip.id_programa = v_id_programa
       AND ( (v_id_miembro  IS NOT NULL AND ip.id_miembro  = v_id_miembro)
          OR (v_id_invitado IS NOT NULL AND ip.id_invitado = v_id_invitado) );

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: actualizar_estado_pago_inscripcion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_estado_pago_inscripcion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.estado = 'completado' AND NEW.mp_status = 'approved' THEN
        UPDATE inscripcion_evento 
        SET pago_completado = true,
            estado = 'confirmada'
        WHERE id_inscripcion = NEW.id_inscripcion;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: actualizar_semestre_miembros(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_semestre_miembros() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    mes_actual INTEGER := EXTRACT(MONTH FROM CURRENT_DATE);
    anio_actual INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
    -- En agosto, incrementar semestre de los que ingresaron en enero-julio
    IF mes_actual = 8 THEN
        UPDATE miembro
        SET semestre_actual = semestre_actual + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE periodo_ingreso = 'enero-julio'
          AND estado = 'activo'
          AND semestre_actual < 14;
    
    -- En enero, incrementar semestre de los que ingresaron en agosto-diciembre
    ELSIF mes_actual = 1 THEN
        UPDATE miembro
        SET semestre_actual = semestre_actual + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE periodo_ingreso = 'agosto-diciembre'
          AND estado = 'activo'
          AND semestre_actual < 14;
    END IF;
END;
$$;


--
-- Name: actualizar_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: inicializar_cupos_disponibles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inicializar_cupos_disponibles() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.cupos_disponibles IS NULL THEN
        NEW.cupos_disponibles := NEW.cupos;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: limpiar_tokens_expirados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limpiar_tokens_expirados() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM password_reset_token 
    WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: actividad_plataforma_semanal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actividad_plataforma_semanal (
    id_actividad integer NOT NULL,
    id_cuenta integer NOT NULL,
    anio integer NOT NULL,
    semana integer NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    problemas_resueltos integer DEFAULT 0,
    intentos_totales integer DEFAULT 0,
    tiempo_total_minutos integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT actividad_plataforma_semanal_semana_check CHECK (((semana >= 1) AND (semana <= 53)))
);


--
-- Name: actividad_plataforma_semanal_id_actividad_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.actividad_plataforma_semanal_id_actividad_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: actividad_plataforma_semanal_id_actividad_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.actividad_plataforma_semanal_id_actividad_seq OWNED BY public.actividad_plataforma_semanal.id_actividad;


--
-- Name: asistencia_invitado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencia_invitado (
    id_asistencia integer NOT NULL,
    id_sesion integer NOT NULL,
    id_invitado integer NOT NULL,
    asistio boolean DEFAULT false NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asistencia_invitado_id_asistencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asistencia_invitado_id_asistencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asistencia_invitado_id_asistencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asistencia_invitado_id_asistencia_seq OWNED BY public.asistencia_invitado.id_asistencia;


--
-- Name: asistencia_miembro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencia_miembro (
    id_asistencia integer NOT NULL,
    id_sesion integer NOT NULL,
    id_miembro integer NOT NULL,
    asistio boolean DEFAULT false NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asistencia_miembro_id_asistencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asistencia_miembro_id_asistencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asistencia_miembro_id_asistencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asistencia_miembro_id_asistencia_seq OWNED BY public.asistencia_miembro.id_asistencia;


--
-- Name: catalogo_alcance_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_alcance_evento (
    id_alcance integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion text,
    orden integer
);


--
-- Name: catalogo_alcance_evento_id_alcance_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_alcance_evento_id_alcance_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_alcance_evento_id_alcance_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_alcance_evento_id_alcance_seq OWNED BY public.catalogo_alcance_evento.id_alcance;


--
-- Name: catalogo_carrera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_carrera (
    id_carrera integer NOT NULL,
    nombre character varying(100) NOT NULL,
    codigo character varying(20),
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: catalogo_carrera_id_carrera_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_carrera_id_carrera_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_carrera_id_carrera_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_carrera_id_carrera_seq OWNED BY public.catalogo_carrera.id_carrera;


--
-- Name: catalogo_plataforma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_plataforma (
    id_plataforma integer NOT NULL,
    nombre character varying(50) NOT NULL,
    url_base character varying(255),
    requiere_usuario boolean DEFAULT true,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: catalogo_plataforma_id_plataforma_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_plataforma_id_plataforma_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_plataforma_id_plataforma_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_plataforma_id_plataforma_seq OWNED BY public.catalogo_plataforma.id_plataforma;


--
-- Name: catalogo_rol_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_rol_staff (
    id_rol integer NOT NULL,
    nombre character varying(50) NOT NULL,
    puede_administrar boolean DEFAULT false,
    puede_editar boolean DEFAULT false,
    puede_ver boolean DEFAULT true
);


--
-- Name: catalogo_rol_staff_id_rol_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_rol_staff_id_rol_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_rol_staff_id_rol_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_rol_staff_id_rol_seq OWNED BY public.catalogo_rol_staff.id_rol;


--
-- Name: catalogo_tipo_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_tipo_evento (
    id_tipo_evento integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion text,
    requiere_costo boolean DEFAULT false,
    permite_equipos boolean DEFAULT false,
    activo boolean DEFAULT true
);


--
-- Name: catalogo_tipo_evento_id_tipo_evento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_tipo_evento_id_tipo_evento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_tipo_evento_id_tipo_evento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_tipo_evento_id_tipo_evento_seq OWNED BY public.catalogo_tipo_evento.id_tipo_evento;


--
-- Name: concurso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concurso (
    id_concurso integer NOT NULL,
    id_evento integer NOT NULL,
    id_plataforma integer,
    modalidad character varying(20) NOT NULL,
    max_integrantes_equipo integer,
    requiere_asesor boolean DEFAULT false,
    requiere_cuenta_especial boolean DEFAULT false,
    url_concurso character varying(500),
    permite_registro_tardio boolean DEFAULT false,
    fecha_limite_registro timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    min_integrantes_equipo integer DEFAULT 1,
    CONSTRAINT concurso_max_integrantes_equipo_check CHECK ((max_integrantes_equipo > 0)),
    CONSTRAINT concurso_modalidad_check CHECK (((modalidad)::text = ANY (ARRAY[('individual'::character varying)::text, ('equipos'::character varying)::text]))),
    CONSTRAINT modalidad_equipos_valida CHECK (((((modalidad)::text = 'individual'::text) AND (max_integrantes_equipo IS NULL)) OR (((modalidad)::text = 'equipos'::text) AND (max_integrantes_equipo >= 2))))
);


--
-- Name: TABLE concurso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.concurso IS 'ExtensiÃ³n de evento para concursos de programaciÃ³n';


--
-- Name: concurso_id_concurso_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.concurso_id_concurso_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: concurso_id_concurso_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.concurso_id_concurso_seq OWNED BY public.concurso.id_concurso;


--
-- Name: cuenta_plataforma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuenta_plataforma (
    id_cuenta integer NOT NULL,
    id_miembro integer NOT NULL,
    id_plataforma integer NOT NULL,
    usuario character varying(100) NOT NULL,
    problemas_resueltos_total integer DEFAULT 0,
    problemas_resueltos_semana integer DEFAULT 0,
    problema_mas_dificil character varying(100),
    ranking integer,
    rating integer,
    ultima_actualizacion timestamp without time zone,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cuenta_plataforma_id_cuenta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuenta_plataforma_id_cuenta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuenta_plataforma_id_cuenta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuenta_plataforma_id_cuenta_seq OWNED BY public.cuenta_plataforma.id_cuenta;


--
-- Name: equipo_concurso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipo_concurso (
    id_equipo integer NOT NULL,
    id_concurso integer NOT NULL,
    nombre_equipo character varying(100) NOT NULL,
    nombre_asesor character varying(255),
    correo_asesor character varying(255),
    telefono_asesor character varying(20),
    institucion_asesor character varying(255),
    usuario_acceso character varying(100),
    contrasena_acceso character varying(255),
    registro_completo boolean DEFAULT false,
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    confirmado boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE equipo_concurso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.equipo_concurso IS 'Equipos participantes en concursos por equipos';


--
-- Name: equipo_concurso_id_equipo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipo_concurso_id_equipo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipo_concurso_id_equipo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipo_concurso_id_equipo_seq OWNED BY public.equipo_concurso.id_equipo;


--
-- Name: evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evento (
    id_evento integer NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion_html text,
    id_tipo_evento integer NOT NULL,
    id_alcance integer NOT NULL,
    fecha_inicio date NOT NULL,
    hora_inicio time without time zone NOT NULL,
    fecha_fin date NOT NULL,
    hora_fin time without time zone NOT NULL,
    ubicacion character varying(255),
    cupos integer,
    cupos_disponibles integer,
    tiene_costo boolean DEFAULT false,
    costo numeric(10,2) DEFAULT 0.00,
    imagen_flyer_url character varying(500),
    imagen_flyer_key character varying(255),
    estado character varying(20) DEFAULT 'planificacion'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    fecha_limite_registro timestamp without time zone,
    listable boolean DEFAULT true NOT NULL,
    CONSTRAINT costo_requerido CHECK ((((tiene_costo = false) AND (costo = (0)::numeric)) OR ((tiene_costo = true) AND (costo > (0)::numeric)))),
    CONSTRAINT evento_costo_check CHECK ((costo >= (0)::numeric)),
    CONSTRAINT evento_cupos_check CHECK ((cupos > 0)),
    CONSTRAINT evento_estado_check CHECK (((estado)::text = ANY (ARRAY[('planificacion'::character varying)::text, ('publicado'::character varying)::text, ('en_curso'::character varying)::text, ('finalizado'::character varying)::text, ('cancelado'::character varying)::text]))),
    CONSTRAINT fecha_valida CHECK ((fecha_fin >= fecha_inicio)),
    CONSTRAINT hora_valida CHECK (((fecha_fin > fecha_inicio) OR ((fecha_fin = fecha_inicio) AND (hora_fin > hora_inicio))))
);


--
-- Name: COLUMN evento.fecha_limite_registro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evento.fecha_limite_registro IS 'Fecha y hora lÃ­mite para registrarse en el evento. DespuÃ©s de esta fecha/hora no se permiten nuevas inscripciones.';


--
-- Name: evento_id_evento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evento_id_evento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evento_id_evento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evento_id_evento_seq OWNED BY public.evento.id_evento;


--
-- Name: evento_imagenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evento_imagenes (
    id_imagen integer NOT NULL,
    id_evento integer NOT NULL,
    nombre_archivo character varying(255) NOT NULL,
    ruta character varying(255) NOT NULL,
    tipo_mime character varying(100),
    tamanio bigint,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evento_imagenes_id_imagen_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evento_imagenes_id_imagen_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evento_imagenes_id_imagen_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evento_imagenes_id_imagen_seq OWNED BY public.evento_imagenes.id_imagen;


--
-- Name: evidencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidencia (
    id_evidencia integer NOT NULL,
    id_evento integer NOT NULL,
    titulo character varying(255) NOT NULL,
    descripcion text,
    tipo character varying(20),
    url character varying(500),
    storage_key character varying(255),
    tamanio_bytes integer,
    mime_type character varying(100),
    fecha_captura timestamp without time zone,
    orden integer DEFAULT 0,
    publica boolean DEFAULT true,
    id_miembro_creador integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT evidencia_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('imagen'::character varying)::text, ('video'::character varying)::text, ('documento'::character varying)::text, ('enlace'::character varying)::text])))
);


--
-- Name: TABLE evidencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.evidencia IS 'Evidencias multimedia de eventos para lÃ­nea de tiempo';


--
-- Name: COLUMN evidencia.orden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evidencia.orden IS 'Orden de apariciÃ³n en la lÃ­nea de tiempo del evento';


--
-- Name: evidencia_id_evidencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evidencia_id_evidencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evidencia_id_evidencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evidencia_id_evidencia_seq OWNED BY public.evidencia.id_evidencia;


--
-- Name: inscripcion_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inscripcion_evento (
    id_inscripcion integer NOT NULL,
    id_evento integer NOT NULL,
    id_miembro integer,
    id_invitado integer,
    id_equipo integer,
    estado character varying(20) DEFAULT 'pendiente'::character varying,
    requiere_pago boolean DEFAULT false,
    pago_completado boolean DEFAULT false,
    asistio boolean DEFAULT false,
    hora_registro_asistencia timestamp without time zone,
    fecha_inscripcion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inscripcion_evento_estado_check CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('confirmada'::character varying)::text, ('cancelada'::character varying)::text, ('en_espera'::character varying)::text]))),
    CONSTRAINT un_tipo_inscrito CHECK ((((((id_miembro IS NOT NULL))::integer + ((id_invitado IS NOT NULL))::integer) + ((id_equipo IS NOT NULL))::integer) = 1))
);


--
-- Name: TABLE inscripcion_evento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inscripcion_evento IS 'Registro unificado de inscripciones para miembros e invitados';


--
-- Name: COLUMN inscripcion_evento.requiere_pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inscripcion_evento.requiere_pago IS 'Se determina automÃ¡ticamente segÃºn evento.tiene_costo';


--
-- Name: inscripcion_evento_id_inscripcion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inscripcion_evento_id_inscripcion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inscripcion_evento_id_inscripcion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inscripcion_evento_id_inscripcion_seq OWNED BY public.inscripcion_evento.id_inscripcion;


--
-- Name: inscripcion_programa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inscripcion_programa (
    id_inscripcion_programa integer NOT NULL,
    id_programa integer NOT NULL,
    id_miembro integer,
    id_invitado integer,
    fecha_inscripcion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    estado character varying(20) DEFAULT 'activo'::character varying,
    sesiones_asistidas integer DEFAULT 0,
    porcentaje_asistencia numeric(5,2) DEFAULT 0.00,
    elegible_certificado boolean DEFAULT false,
    certificado_emitido boolean DEFAULT false,
    fecha_certificado timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT un_tipo_inscrito_programa CHECK (((((id_miembro IS NOT NULL))::integer + ((id_invitado IS NOT NULL))::integer) = 1))
);


--
-- Name: TABLE inscripcion_programa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inscripcion_programa IS 'Inscripciones a programas completos (cursos recurrentes)';


--
-- Name: inscripcion_programa_id_inscripcion_programa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inscripcion_programa_id_inscripcion_programa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inscripcion_programa_id_inscripcion_programa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inscripcion_programa_id_inscripcion_programa_seq OWNED BY public.inscripcion_programa.id_inscripcion_programa;


--
-- Name: integrante_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrante_equipo (
    id_integrante integer NOT NULL,
    id_equipo integer NOT NULL,
    id_miembro integer,
    id_invitado integer,
    es_capitan boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT un_tipo_integrante CHECK ((((id_miembro IS NOT NULL) AND (id_invitado IS NULL)) OR ((id_miembro IS NULL) AND (id_invitado IS NOT NULL))))
);


--
-- Name: integrante_equipo_id_integrante_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integrante_equipo_id_integrante_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integrante_equipo_id_integrante_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integrante_equipo_id_integrante_seq OWNED BY public.integrante_equipo.id_integrante;


--
-- Name: invitado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitado (
    id_invitado integer NOT NULL,
    nombre_completo character varying(255) NOT NULL,
    correo_electronico character varying(255) NOT NULL,
    numero_telefono character varying(20),
    nivel_estudios character varying(50),
    semestre integer,
    carrera character varying(100),
    escuela_institucion character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT invitado_nivel_estudios_check CHECK (((nivel_estudios)::text = ANY (ARRAY[('preparatoria'::character varying)::text, ('universidad'::character varying)::text, ('otro'::character varying)::text]))),
    CONSTRAINT invitado_semestre_check CHECK (((semestre >= 1) AND (semestre <= 14)))
);


--
-- Name: invitado_id_invitado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invitado_id_invitado_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invitado_id_invitado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invitado_id_invitado_seq OWNED BY public.invitado.id_invitado;


--
-- Name: juez_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.juez_evento (
    id_juez integer NOT NULL,
    id_evento integer NOT NULL,
    id_miembro integer,
    nombre_completo character varying(200) NOT NULL,
    correo_electronico character varying(200),
    numero_telefono character varying(20),
    institucion character varying(200),
    procedencia character varying(30) DEFAULT 'otro'::character varying NOT NULL,
    es_principal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT juez_evento_procedencia_check CHECK (((procedencia)::text = ANY ((ARRAY['club_programacion'::character varying, 'computer_society'::character varying, 'itlac'::character varying, 'universitario'::character varying, 'preparatoria'::character varying, 'otro'::character varying])::text[])))
);


--
-- Name: juez_evento_id_juez_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.juez_evento_id_juez_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: juez_evento_id_juez_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.juez_evento_id_juez_seq OWNED BY public.juez_evento.id_juez;


--
-- Name: miembro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.miembro (
    id_miembro integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido_paterno character varying(100) NOT NULL,
    apellido_materno character varying(100),
    correo_electronico character varying(255) NOT NULL,
    numero_telefono character varying(20),
    id_carrera integer,
    semestre_ingreso integer NOT NULL,
    semestre_actual integer NOT NULL,
    periodo_ingreso character varying(20) NOT NULL,
    es_club_programacion boolean DEFAULT false,
    es_computer_society boolean DEFAULT false,
    numero_ieee character varying(50),
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    contrasena character varying(255) NOT NULL,
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    rol character varying(20) DEFAULT 'usuario'::character varying,
    CONSTRAINT miembro_estado_check CHECK (((estado)::text = ANY (ARRAY[('activo'::character varying)::text, ('inactivo'::character varying)::text, ('egresado'::character varying)::text, ('baja'::character varying)::text]))),
    CONSTRAINT miembro_periodo_ingreso_check CHECK (((periodo_ingreso)::text = ANY (ARRAY[('enero-julio'::character varying)::text, ('agosto-diciembre'::character varying)::text]))),
    CONSTRAINT miembro_semestre_actual_check CHECK (((semestre_actual >= 1) AND (semestre_actual <= 14))),
    CONSTRAINT miembro_semestre_ingreso_check CHECK (((semestre_ingreso >= 1) AND (semestre_ingreso <= 14))),
    CONSTRAINT numero_ieee_required_cs CHECK (((es_computer_society = false) OR ((es_computer_society = true) AND (numero_ieee IS NOT NULL))))
);


--
-- Name: TABLE miembro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.miembro IS 'Miembros del club de programaciÃ³n y/o Computer Society';


--
-- Name: COLUMN miembro.semestre_actual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.miembro.semestre_actual IS 'Se actualiza automÃ¡ticamente cada inicio de semestre';


--
-- Name: COLUMN miembro.periodo_ingreso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.miembro.periodo_ingreso IS 'Define cuÃ¡ndo incrementar el semestre: enero o agosto';


--
-- Name: COLUMN miembro.numero_ieee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.miembro.numero_ieee IS 'Requerido solo si es_computer_society = true';


--
-- Name: miembro_id_miembro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.miembro_id_miembro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: miembro_id_miembro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.miembro_id_miembro_seq OWNED BY public.miembro.id_miembro;


--
-- Name: pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pago (
    id_pago integer NOT NULL,
    id_inscripcion integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    moneda character varying(3) DEFAULT 'MXN'::character varying,
    mp_preference_id character varying(255),
    mp_payment_id character varying(255),
    mp_status character varying(50),
    mp_status_detail character varying(100),
    mp_response_json jsonb,
    estado character varying(20) DEFAULT 'pendiente'::character varying,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_pago timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pago_estado_check CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('procesando'::character varying)::text, ('completado'::character varying)::text, ('fallido'::character varying)::text, ('reembolsado'::character varying)::text]))),
    CONSTRAINT pago_monto_check CHECK ((monto > (0)::numeric))
);


--
-- Name: TABLE pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pago IS 'GestiÃ³n de pagos integrada con Mercado Pago';


--
-- Name: COLUMN pago.mp_response_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pago.mp_response_json IS 'Almacena la respuesta completa de Mercado Pago para auditorÃ­a';


--
-- Name: pago_id_pago_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pago_id_pago_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pago_id_pago_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pago_id_pago_seq OWNED BY public.pago.id_pago;


--
-- Name: participacion_concurso_individual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participacion_concurso_individual (
    id_participacion integer NOT NULL,
    id_concurso integer NOT NULL,
    id_miembro integer,
    id_invitado integer,
    posicion integer,
    puntos_obtenidos numeric(10,2),
    problemas_resueltos integer,
    tiempo_total_minutos integer,
    confirmado boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT un_tipo_participante CHECK ((((id_miembro IS NOT NULL) AND (id_invitado IS NULL)) OR ((id_miembro IS NULL) AND (id_invitado IS NOT NULL))))
);


--
-- Name: participacion_concurso_individual_id_participacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.participacion_concurso_individual_id_participacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: participacion_concurso_individual_id_participacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.participacion_concurso_individual_id_participacion_seq OWNED BY public.participacion_concurso_individual.id_participacion;


--
-- Name: password_reset_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_token (
    id_token integer NOT NULL,
    id_miembro integer NOT NULL,
    token character varying(255) NOT NULL,
    codigo_verificacion character varying(6),
    expires_at timestamp without time zone NOT NULL,
    usado boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    used_at timestamp without time zone
);


--
-- Name: password_reset_token_id_token_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_token_id_token_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_token_id_token_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_token_id_token_seq OWNED BY public.password_reset_token.id_token;


--
-- Name: programa_recurrente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programa_recurrente (
    id_programa integer NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    id_tipo_evento integer NOT NULL,
    id_alcance integer NOT NULL,
    sesiones_requeridas_certificado integer DEFAULT 0,
    porcentaje_asistencia_minimo numeric(5,2) DEFAULT 80.00,
    ubicacion character varying(255),
    imagen_url character varying(500),
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    dias_semana integer[],
    hora_inicio time without time zone,
    hora_fin time without time zone
);


--
-- Name: TABLE programa_recurrente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.programa_recurrente IS 'Programas o cursos con mÃºltiples sesiones durante un periodo extendido';


--
-- Name: COLUMN programa_recurrente.sesiones_requeridas_certificado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.programa_recurrente.sesiones_requeridas_certificado IS 'NÃºmero mÃ­nimo de sesiones que debe asistir para obtener certificado';


--
-- Name: COLUMN programa_recurrente.porcentaje_asistencia_minimo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.programa_recurrente.porcentaje_asistencia_minimo IS 'Porcentaje mÃ­nimo de asistencia requerido para certificado';


--
-- Name: programa_recurrente_id_programa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programa_recurrente_id_programa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programa_recurrente_id_programa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programa_recurrente_id_programa_seq OWNED BY public.programa_recurrente.id_programa;


--
-- Name: resultado_equipo_concurso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resultado_equipo_concurso (
    id_resultado integer NOT NULL,
    id_equipo integer NOT NULL,
    posicion integer,
    puntos_obtenidos numeric(10,2),
    problemas_resueltos integer,
    tiempo_total_minutos integer,
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: resultado_equipo_concurso_id_resultado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resultado_equipo_concurso_id_resultado_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resultado_equipo_concurso_id_resultado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resultado_equipo_concurso_id_resultado_seq OWNED BY public.resultado_equipo_concurso.id_resultado;


--
-- Name: sesion_programa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesion_programa (
    id_sesion integer NOT NULL,
    id_programa integer NOT NULL,
    id_evento integer,
    numero_sesion integer NOT NULL,
    titulo character varying(255),
    descripcion text,
    es_obligatoria boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha date,
    hora_inicio time without time zone,
    hora_fin time without time zone,
    ubicacion character varying(255)
);


--
-- Name: TABLE sesion_programa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sesion_programa IS 'Sesiones individuales que conforman un programa recurrente';


--
-- Name: sesion_programa_id_sesion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sesion_programa_id_sesion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sesion_programa_id_sesion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sesion_programa_id_sesion_seq OWNED BY public.sesion_programa.id_sesion;


--
-- Name: staff_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_evento (
    id_staff integer NOT NULL,
    id_evento integer NOT NULL,
    id_miembro integer NOT NULL,
    id_rol integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: staff_evento_id_staff_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_evento_id_staff_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_evento_id_staff_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_evento_id_staff_seq OWNED BY public.staff_evento.id_staff;


--
-- Name: v_actividad_semanal_actual; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_actividad_semanal_actual AS
 SELECT m.id_miembro,
    concat(m.nombre, ' ', m.apellido_paterno) AS nombre,
    p.nombre AS plataforma,
    COALESCE(sum(aps.problemas_resueltos), (0)::bigint) AS problemas_esta_semana,
    cp.problemas_resueltos_total
   FROM (((public.miembro m
     JOIN public.cuenta_plataforma cp ON ((m.id_miembro = cp.id_miembro)))
     JOIN public.catalogo_plataforma p ON ((cp.id_plataforma = p.id_plataforma)))
     LEFT JOIN public.actividad_plataforma_semanal aps ON (((cp.id_cuenta = aps.id_cuenta) AND ((aps.anio)::numeric = EXTRACT(year FROM CURRENT_DATE)) AND ((aps.semana)::numeric = EXTRACT(week FROM CURRENT_DATE)))))
  WHERE ((m.es_club_programacion = true) AND ((m.estado)::text = 'activo'::text) AND (cp.activo = true))
  GROUP BY m.id_miembro, m.nombre, m.apellido_paterno, p.nombre, cp.problemas_resueltos_total;


--
-- Name: v_linea_tiempo_eventos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_linea_tiempo_eventos AS
SELECT
    NULL::integer AS id_evento,
    NULL::character varying(255) AS evento,
    NULL::character varying(50) AS tipo_evento,
    NULL::date AS fecha_inicio,
    NULL::character varying(20) AS estado,
    NULL::bigint AS total_evidencias,
    NULL::bigint AS total_participantes,
    NULL::bigint AS total_asistentes,
    NULL::json AS evidencias;


--
-- Name: VIEW v_linea_tiempo_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_linea_tiempo_eventos IS 'Vista consolidada de eventos con sus evidencias en formato JSON';


--
-- Name: v_miembros_activos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_miembros_activos AS
SELECT
    NULL::integer AS id_miembro,
    NULL::text AS nombre_completo,
    NULL::character varying(100) AS nombre,
    NULL::character varying(100) AS apellido_paterno,
    NULL::character varying(100) AS apellido_materno,
    NULL::character varying(255) AS correo_electronico,
    NULL::character varying(20) AS numero_telefono,
    NULL::character varying(50) AS numero_ieee,
    NULL::character varying(100) AS carrera,
    NULL::integer AS semestre_actual,
    NULL::character varying(20) AS periodo_ingreso,
    NULL::boolean AS es_club_programacion,
    NULL::boolean AS es_computer_society,
    NULL::timestamp without time zone AS fecha_registro,
    NULL::bigint AS eventos_participados,
    NULL::bigint AS eventos_asistidos;


--
-- Name: v_proximos_eventos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_proximos_eventos AS
SELECT
    NULL::integer AS id_evento,
    NULL::character varying(255) AS nombre,
    NULL::character varying(50) AS tipo_evento,
    NULL::character varying(50) AS alcance,
    NULL::date AS fecha_inicio,
    NULL::time without time zone AS hora_inicio,
    NULL::date AS fecha_fin,
    NULL::time without time zone AS hora_fin,
    NULL::character varying(255) AS ubicacion,
    NULL::integer AS cupos,
    NULL::integer AS cupos_disponibles,
    NULL::boolean AS tiene_costo,
    NULL::numeric(10,2) AS costo,
    NULL::character varying(500) AS imagen_flyer_url,
    NULL::character varying(20) AS estado,
    NULL::bigint AS total_inscritos;


--
-- Name: v_rendimiento_plataformas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_rendimiento_plataformas AS
 SELECT m.id_miembro,
    concat(m.nombre, ' ', m.apellido_paterno) AS nombre,
    p.nombre AS plataforma,
    cp.usuario,
    cp.problemas_resueltos_total,
    cp.problemas_resueltos_semana,
    cp.problema_mas_dificil,
    cp.ranking,
    cp.rating,
    cp.ultima_actualizacion
   FROM ((public.cuenta_plataforma cp
     JOIN public.miembro m ON ((cp.id_miembro = m.id_miembro)))
     JOIN public.catalogo_plataforma p ON ((cp.id_plataforma = p.id_plataforma)))
  WHERE ((cp.activo = true) AND ((m.estado)::text = 'activo'::text));


--
-- Name: actividad_plataforma_semanal id_actividad; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_plataforma_semanal ALTER COLUMN id_actividad SET DEFAULT nextval('public.actividad_plataforma_semanal_id_actividad_seq'::regclass);


--
-- Name: asistencia_invitado id_asistencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_invitado ALTER COLUMN id_asistencia SET DEFAULT nextval('public.asistencia_invitado_id_asistencia_seq'::regclass);


--
-- Name: asistencia_miembro id_asistencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_miembro ALTER COLUMN id_asistencia SET DEFAULT nextval('public.asistencia_miembro_id_asistencia_seq'::regclass);


--
-- Name: catalogo_alcance_evento id_alcance; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_alcance_evento ALTER COLUMN id_alcance SET DEFAULT nextval('public.catalogo_alcance_evento_id_alcance_seq'::regclass);


--
-- Name: catalogo_carrera id_carrera; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_carrera ALTER COLUMN id_carrera SET DEFAULT nextval('public.catalogo_carrera_id_carrera_seq'::regclass);


--
-- Name: catalogo_plataforma id_plataforma; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_plataforma ALTER COLUMN id_plataforma SET DEFAULT nextval('public.catalogo_plataforma_id_plataforma_seq'::regclass);


--
-- Name: catalogo_rol_staff id_rol; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_rol_staff ALTER COLUMN id_rol SET DEFAULT nextval('public.catalogo_rol_staff_id_rol_seq'::regclass);


--
-- Name: catalogo_tipo_evento id_tipo_evento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_tipo_evento ALTER COLUMN id_tipo_evento SET DEFAULT nextval('public.catalogo_tipo_evento_id_tipo_evento_seq'::regclass);


--
-- Name: concurso id_concurso; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concurso ALTER COLUMN id_concurso SET DEFAULT nextval('public.concurso_id_concurso_seq'::regclass);


--
-- Name: cuenta_plataforma id_cuenta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_plataforma ALTER COLUMN id_cuenta SET DEFAULT nextval('public.cuenta_plataforma_id_cuenta_seq'::regclass);


--
-- Name: equipo_concurso id_equipo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipo_concurso ALTER COLUMN id_equipo SET DEFAULT nextval('public.equipo_concurso_id_equipo_seq'::regclass);


--
-- Name: evento id_evento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento ALTER COLUMN id_evento SET DEFAULT nextval('public.evento_id_evento_seq'::regclass);


--
-- Name: evento_imagenes id_imagen; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_imagenes ALTER COLUMN id_imagen SET DEFAULT nextval('public.evento_imagenes_id_imagen_seq'::regclass);


--
-- Name: evidencia id_evidencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia ALTER COLUMN id_evidencia SET DEFAULT nextval('public.evidencia_id_evidencia_seq'::regclass);


--
-- Name: inscripcion_evento id_inscripcion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento ALTER COLUMN id_inscripcion SET DEFAULT nextval('public.inscripcion_evento_id_inscripcion_seq'::regclass);


--
-- Name: inscripcion_programa id_inscripcion_programa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa ALTER COLUMN id_inscripcion_programa SET DEFAULT nextval('public.inscripcion_programa_id_inscripcion_programa_seq'::regclass);


--
-- Name: integrante_equipo id_integrante; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrante_equipo ALTER COLUMN id_integrante SET DEFAULT nextval('public.integrante_equipo_id_integrante_seq'::regclass);


--
-- Name: invitado id_invitado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitado ALTER COLUMN id_invitado SET DEFAULT nextval('public.invitado_id_invitado_seq'::regclass);


--
-- Name: juez_evento id_juez; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juez_evento ALTER COLUMN id_juez SET DEFAULT nextval('public.juez_evento_id_juez_seq'::regclass);


--
-- Name: miembro id_miembro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembro ALTER COLUMN id_miembro SET DEFAULT nextval('public.miembro_id_miembro_seq'::regclass);


--
-- Name: pago id_pago; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago ALTER COLUMN id_pago SET DEFAULT nextval('public.pago_id_pago_seq'::regclass);


--
-- Name: participacion_concurso_individual id_participacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual ALTER COLUMN id_participacion SET DEFAULT nextval('public.participacion_concurso_individual_id_participacion_seq'::regclass);


--
-- Name: password_reset_token id_token; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token ALTER COLUMN id_token SET DEFAULT nextval('public.password_reset_token_id_token_seq'::regclass);


--
-- Name: programa_recurrente id_programa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_recurrente ALTER COLUMN id_programa SET DEFAULT nextval('public.programa_recurrente_id_programa_seq'::regclass);


--
-- Name: resultado_equipo_concurso id_resultado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultado_equipo_concurso ALTER COLUMN id_resultado SET DEFAULT nextval('public.resultado_equipo_concurso_id_resultado_seq'::regclass);


--
-- Name: sesion_programa id_sesion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_programa ALTER COLUMN id_sesion SET DEFAULT nextval('public.sesion_programa_id_sesion_seq'::regclass);


--
-- Name: staff_evento id_staff; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_evento ALTER COLUMN id_staff SET DEFAULT nextval('public.staff_evento_id_staff_seq'::regclass);


--
-- Name: actividad_plataforma_semanal actividad_plataforma_semanal_id_cuenta_anio_semana_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_plataforma_semanal
    ADD CONSTRAINT actividad_plataforma_semanal_id_cuenta_anio_semana_key UNIQUE (id_cuenta, anio, semana);


--
-- Name: actividad_plataforma_semanal actividad_plataforma_semanal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_plataforma_semanal
    ADD CONSTRAINT actividad_plataforma_semanal_pkey PRIMARY KEY (id_actividad);


--
-- Name: asistencia_invitado asistencia_invitado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_invitado
    ADD CONSTRAINT asistencia_invitado_pkey PRIMARY KEY (id_asistencia);


--
-- Name: asistencia_miembro asistencia_miembro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_miembro
    ADD CONSTRAINT asistencia_miembro_pkey PRIMARY KEY (id_asistencia);


--
-- Name: catalogo_alcance_evento catalogo_alcance_evento_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_alcance_evento
    ADD CONSTRAINT catalogo_alcance_evento_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_alcance_evento catalogo_alcance_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_alcance_evento
    ADD CONSTRAINT catalogo_alcance_evento_pkey PRIMARY KEY (id_alcance);


--
-- Name: catalogo_carrera catalogo_carrera_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_carrera
    ADD CONSTRAINT catalogo_carrera_codigo_key UNIQUE (codigo);


--
-- Name: catalogo_carrera catalogo_carrera_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_carrera
    ADD CONSTRAINT catalogo_carrera_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_carrera catalogo_carrera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_carrera
    ADD CONSTRAINT catalogo_carrera_pkey PRIMARY KEY (id_carrera);


--
-- Name: catalogo_plataforma catalogo_plataforma_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_plataforma
    ADD CONSTRAINT catalogo_plataforma_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_plataforma catalogo_plataforma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_plataforma
    ADD CONSTRAINT catalogo_plataforma_pkey PRIMARY KEY (id_plataforma);


--
-- Name: catalogo_rol_staff catalogo_rol_staff_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_rol_staff
    ADD CONSTRAINT catalogo_rol_staff_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_rol_staff catalogo_rol_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_rol_staff
    ADD CONSTRAINT catalogo_rol_staff_pkey PRIMARY KEY (id_rol);


--
-- Name: catalogo_tipo_evento catalogo_tipo_evento_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_tipo_evento
    ADD CONSTRAINT catalogo_tipo_evento_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_tipo_evento catalogo_tipo_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_tipo_evento
    ADD CONSTRAINT catalogo_tipo_evento_pkey PRIMARY KEY (id_tipo_evento);


--
-- Name: concurso concurso_id_evento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concurso
    ADD CONSTRAINT concurso_id_evento_key UNIQUE (id_evento);


--
-- Name: concurso concurso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concurso
    ADD CONSTRAINT concurso_pkey PRIMARY KEY (id_concurso);


--
-- Name: cuenta_plataforma cuenta_plataforma_id_miembro_id_plataforma_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_plataforma
    ADD CONSTRAINT cuenta_plataforma_id_miembro_id_plataforma_key UNIQUE (id_miembro, id_plataforma);


--
-- Name: cuenta_plataforma cuenta_plataforma_id_plataforma_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_plataforma
    ADD CONSTRAINT cuenta_plataforma_id_plataforma_usuario_key UNIQUE (id_plataforma, usuario);


--
-- Name: cuenta_plataforma cuenta_plataforma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_plataforma
    ADD CONSTRAINT cuenta_plataforma_pkey PRIMARY KEY (id_cuenta);


--
-- Name: equipo_concurso equipo_concurso_id_concurso_nombre_equipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipo_concurso
    ADD CONSTRAINT equipo_concurso_id_concurso_nombre_equipo_key UNIQUE (id_concurso, nombre_equipo);


--
-- Name: equipo_concurso equipo_concurso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipo_concurso
    ADD CONSTRAINT equipo_concurso_pkey PRIMARY KEY (id_equipo);


--
-- Name: evento_imagenes evento_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_imagenes
    ADD CONSTRAINT evento_imagenes_pkey PRIMARY KEY (id_imagen);


--
-- Name: evento evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT evento_pkey PRIMARY KEY (id_evento);


--
-- Name: evidencia evidencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT evidencia_pkey PRIMARY KEY (id_evidencia);


--
-- Name: inscripcion_evento inscripcion_evento_id_evento_id_invitado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_id_evento_id_invitado_key UNIQUE (id_evento, id_invitado);


--
-- Name: inscripcion_evento inscripcion_evento_id_evento_id_miembro_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_id_evento_id_miembro_key UNIQUE (id_evento, id_miembro);


--
-- Name: inscripcion_evento inscripcion_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_pkey PRIMARY KEY (id_inscripcion);


--
-- Name: inscripcion_programa inscripcion_programa_id_programa_id_invitado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa
    ADD CONSTRAINT inscripcion_programa_id_programa_id_invitado_key UNIQUE (id_programa, id_invitado);


--
-- Name: inscripcion_programa inscripcion_programa_id_programa_id_miembro_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa
    ADD CONSTRAINT inscripcion_programa_id_programa_id_miembro_key UNIQUE (id_programa, id_miembro);


--
-- Name: inscripcion_programa inscripcion_programa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa
    ADD CONSTRAINT inscripcion_programa_pkey PRIMARY KEY (id_inscripcion_programa);


--
-- Name: integrante_equipo integrante_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrante_equipo
    ADD CONSTRAINT integrante_equipo_pkey PRIMARY KEY (id_integrante);


--
-- Name: invitado invitado_correo_electronico_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitado
    ADD CONSTRAINT invitado_correo_electronico_key UNIQUE (correo_electronico);


--
-- Name: invitado invitado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitado
    ADD CONSTRAINT invitado_pkey PRIMARY KEY (id_invitado);


--
-- Name: juez_evento juez_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juez_evento
    ADD CONSTRAINT juez_evento_pkey PRIMARY KEY (id_juez);


--
-- Name: miembro miembro_correo_electronico_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembro
    ADD CONSTRAINT miembro_correo_electronico_key UNIQUE (correo_electronico);


--
-- Name: miembro miembro_numero_ieee_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembro
    ADD CONSTRAINT miembro_numero_ieee_key UNIQUE (numero_ieee);


--
-- Name: miembro miembro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembro
    ADD CONSTRAINT miembro_pkey PRIMARY KEY (id_miembro);


--
-- Name: pago pago_id_inscripcion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT pago_id_inscripcion_key UNIQUE (id_inscripcion);


--
-- Name: pago pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT pago_pkey PRIMARY KEY (id_pago);


--
-- Name: participacion_concurso_individual participacion_concurso_individual_id_concurso_id_invitado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual
    ADD CONSTRAINT participacion_concurso_individual_id_concurso_id_invitado_key UNIQUE (id_concurso, id_invitado);


--
-- Name: participacion_concurso_individual participacion_concurso_individual_id_concurso_id_miembro_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual
    ADD CONSTRAINT participacion_concurso_individual_id_concurso_id_miembro_key UNIQUE (id_concurso, id_miembro);


--
-- Name: participacion_concurso_individual participacion_concurso_individual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual
    ADD CONSTRAINT participacion_concurso_individual_pkey PRIMARY KEY (id_participacion);


--
-- Name: password_reset_token password_reset_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_pkey PRIMARY KEY (id_token);


--
-- Name: password_reset_token password_reset_token_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_token_key UNIQUE (token);


--
-- Name: programa_recurrente programa_recurrente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_recurrente
    ADD CONSTRAINT programa_recurrente_pkey PRIMARY KEY (id_programa);


--
-- Name: resultado_equipo_concurso resultado_equipo_concurso_id_equipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultado_equipo_concurso
    ADD CONSTRAINT resultado_equipo_concurso_id_equipo_key UNIQUE (id_equipo);


--
-- Name: resultado_equipo_concurso resultado_equipo_concurso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultado_equipo_concurso
    ADD CONSTRAINT resultado_equipo_concurso_pkey PRIMARY KEY (id_resultado);


--
-- Name: sesion_programa sesion_programa_id_programa_numero_sesion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_programa
    ADD CONSTRAINT sesion_programa_id_programa_numero_sesion_key UNIQUE (id_programa, numero_sesion);


--
-- Name: sesion_programa sesion_programa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_programa
    ADD CONSTRAINT sesion_programa_pkey PRIMARY KEY (id_sesion);


--
-- Name: staff_evento staff_evento_id_evento_id_miembro_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_evento
    ADD CONSTRAINT staff_evento_id_evento_id_miembro_key UNIQUE (id_evento, id_miembro);


--
-- Name: staff_evento staff_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_evento
    ADD CONSTRAINT staff_evento_pkey PRIMARY KEY (id_staff);


--
-- Name: asistencia_invitado uq_asistencia_invitado; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_invitado
    ADD CONSTRAINT uq_asistencia_invitado UNIQUE (id_sesion, id_invitado);


--
-- Name: asistencia_miembro uq_asistencia_miembro; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_miembro
    ADD CONSTRAINT uq_asistencia_miembro UNIQUE (id_sesion, id_miembro);


--
-- Name: idx_actividad_cuenta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actividad_cuenta ON public.actividad_plataforma_semanal USING btree (id_cuenta);


--
-- Name: idx_actividad_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actividad_periodo ON public.actividad_plataforma_semanal USING btree (anio, semana);


--
-- Name: idx_asistencia_invitado_invitado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asistencia_invitado_invitado ON public.asistencia_invitado USING btree (id_invitado);


--
-- Name: idx_asistencia_miembro_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asistencia_miembro_miembro ON public.asistencia_miembro USING btree (id_miembro);


--
-- Name: idx_concurso_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concurso_evento ON public.concurso USING btree (id_evento);


--
-- Name: idx_concurso_plataforma; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concurso_plataforma ON public.concurso USING btree (id_plataforma);


--
-- Name: idx_cuenta_activa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cuenta_activa ON public.cuenta_plataforma USING btree (activo) WHERE (activo = true);


--
-- Name: idx_cuenta_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cuenta_miembro ON public.cuenta_plataforma USING btree (id_miembro);


--
-- Name: idx_cuenta_plataforma; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cuenta_plataforma ON public.cuenta_plataforma USING btree (id_plataforma);


--
-- Name: idx_equipo_concurso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipo_concurso ON public.equipo_concurso USING btree (id_concurso);


--
-- Name: idx_evento_alcance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_alcance ON public.evento USING btree (id_alcance);


--
-- Name: idx_evento_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_estado ON public.evento USING btree (estado);


--
-- Name: idx_evento_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_fecha ON public.evento USING btree (fecha_inicio, fecha_fin);


--
-- Name: idx_evento_imagenes_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_imagenes_evento ON public.evento_imagenes USING btree (id_evento);


--
-- Name: idx_evento_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_tipo ON public.evento USING btree (id_tipo_evento);


--
-- Name: idx_evidencia_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidencia_evento ON public.evidencia USING btree (id_evento);


--
-- Name: idx_evidencia_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidencia_fecha ON public.evidencia USING btree (fecha_captura);


--
-- Name: idx_evidencia_publica; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidencia_publica ON public.evidencia USING btree (publica) WHERE (publica = true);


--
-- Name: idx_inscripcion_asistencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_asistencia ON public.inscripcion_evento USING btree (asistio);


--
-- Name: idx_inscripcion_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_estado ON public.inscripcion_evento USING btree (estado);


--
-- Name: idx_inscripcion_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_evento ON public.inscripcion_evento USING btree (id_evento);


--
-- Name: idx_inscripcion_invitado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_invitado ON public.inscripcion_evento USING btree (id_invitado);


--
-- Name: idx_inscripcion_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_miembro ON public.inscripcion_evento USING btree (id_miembro);


--
-- Name: idx_inscripcion_programa_invitado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_programa_invitado ON public.inscripcion_programa USING btree (id_invitado);


--
-- Name: idx_inscripcion_programa_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_programa_miembro ON public.inscripcion_programa USING btree (id_miembro);


--
-- Name: idx_inscripcion_programa_programa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inscripcion_programa_programa ON public.inscripcion_programa USING btree (id_programa);


--
-- Name: idx_integrante_equipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrante_equipo ON public.integrante_equipo USING btree (id_equipo);


--
-- Name: idx_invitado_correo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitado_correo ON public.invitado USING btree (correo_electronico);


--
-- Name: idx_juez_evento_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juez_evento_evento ON public.juez_evento USING btree (id_evento);


--
-- Name: idx_juez_evento_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_juez_evento_miembro ON public.juez_evento USING btree (id_miembro);


--
-- Name: idx_miembro_carrera; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_miembro_carrera ON public.miembro USING btree (id_carrera);


--
-- Name: idx_miembro_club; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_miembro_club ON public.miembro USING btree (es_club_programacion) WHERE (es_club_programacion = true);


--
-- Name: idx_miembro_correo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_miembro_correo ON public.miembro USING btree (correo_electronico);


--
-- Name: idx_miembro_cs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_miembro_cs ON public.miembro USING btree (es_computer_society) WHERE (es_computer_society = true);


--
-- Name: idx_miembro_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_miembro_estado ON public.miembro USING btree (estado) WHERE ((estado)::text = 'activo'::text);


--
-- Name: idx_miembro_numero_ieee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_miembro_numero_ieee ON public.miembro USING btree (numero_ieee) WHERE (numero_ieee IS NOT NULL);


--
-- Name: idx_pago_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pago_estado ON public.pago USING btree (estado);


--
-- Name: idx_pago_inscripcion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pago_inscripcion ON public.pago USING btree (id_inscripcion);


--
-- Name: idx_pago_mp_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pago_mp_payment ON public.pago USING btree (mp_payment_id) WHERE (mp_payment_id IS NOT NULL);


--
-- Name: idx_password_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_token ON public.password_reset_token USING btree (token) WHERE (usado = false);


--
-- Name: idx_sesion_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesion_evento ON public.sesion_programa USING btree (id_evento);


--
-- Name: idx_sesion_programa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesion_programa ON public.sesion_programa USING btree (id_programa);


--
-- Name: idx_sesion_programa_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesion_programa_fecha ON public.sesion_programa USING btree (fecha);


--
-- Name: idx_staff_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_evento ON public.staff_evento USING btree (id_evento);


--
-- Name: idx_staff_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_miembro ON public.staff_evento USING btree (id_miembro);


--
-- Name: uq_juez_evento_miembro; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_juez_evento_miembro ON public.juez_evento USING btree (id_evento, id_miembro) WHERE (id_miembro IS NOT NULL);


--
-- Name: uq_sesion_programa_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_sesion_programa_evento ON public.sesion_programa USING btree (id_evento) WHERE (id_evento IS NOT NULL);


--
-- Name: v_linea_tiempo_eventos _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_linea_tiempo_eventos AS
 SELECT e.id_evento,
    e.nombre AS evento,
    te.nombre AS tipo_evento,
    e.fecha_inicio,
    e.estado,
    count(DISTINCT ev.id_evidencia) AS total_evidencias,
    count(DISTINCT ie.id_inscripcion) AS total_participantes,
    count(DISTINCT
        CASE
            WHEN (ie.asistio = true) THEN ie.id_inscripcion
            ELSE NULL::integer
        END) AS total_asistentes,
    json_agg(json_build_object('id', ev.id_evidencia, 'titulo', ev.titulo, 'tipo', ev.tipo, 'url', ev.url, 'fecha', ev.fecha_captura) ORDER BY ev.orden, ev.fecha_captura) FILTER (WHERE ((ev.id_evidencia IS NOT NULL) AND (ev.publica = true))) AS evidencias
   FROM (((public.evento e
     JOIN public.catalogo_tipo_evento te ON ((e.id_tipo_evento = te.id_tipo_evento)))
     LEFT JOIN public.evidencia ev ON ((e.id_evento = ev.id_evento)))
     LEFT JOIN public.inscripcion_evento ie ON ((e.id_evento = ie.id_evento)))
  WHERE (e.deleted_at IS NULL)
  GROUP BY e.id_evento, te.nombre
  ORDER BY e.fecha_inicio DESC;


--
-- Name: v_miembros_activos _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_miembros_activos AS
 SELECT m.id_miembro,
    concat(m.nombre, ' ', m.apellido_paterno, ' ', COALESCE(m.apellido_materno, ''::character varying)) AS nombre_completo,
    m.nombre,
    m.apellido_paterno,
    m.apellido_materno,
    m.correo_electronico,
    m.numero_telefono,
    m.numero_ieee,
    c.nombre AS carrera,
    m.semestre_actual,
    m.periodo_ingreso,
    m.es_club_programacion,
    m.es_computer_society,
    m.fecha_registro,
    count(DISTINCT ie.id_inscripcion) AS eventos_participados,
    count(DISTINCT
        CASE
            WHEN (ie.asistio = true) THEN ie.id_evento
            ELSE NULL::integer
        END) AS eventos_asistidos
   FROM ((public.miembro m
     LEFT JOIN public.catalogo_carrera c ON ((m.id_carrera = c.id_carrera)))
     LEFT JOIN public.inscripcion_evento ie ON ((m.id_miembro = ie.id_miembro)))
  WHERE (((m.estado)::text = 'activo'::text) AND (m.deleted_at IS NULL))
  GROUP BY m.id_miembro, c.nombre;


--
-- Name: v_proximos_eventos _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_proximos_eventos AS
 SELECT e.id_evento,
    e.nombre,
    te.nombre AS tipo_evento,
    a.nombre AS alcance,
    e.fecha_inicio,
    e.hora_inicio,
    e.fecha_fin,
    e.hora_fin,
    e.ubicacion,
    e.cupos,
    e.cupos_disponibles,
    e.tiene_costo,
    e.costo,
    e.imagen_flyer_url,
    e.estado,
    count(ie.id_inscripcion) AS total_inscritos
   FROM (((public.evento e
     JOIN public.catalogo_tipo_evento te ON ((e.id_tipo_evento = te.id_tipo_evento)))
     JOIN public.catalogo_alcance_evento a ON ((e.id_alcance = a.id_alcance)))
     LEFT JOIN public.inscripcion_evento ie ON (((e.id_evento = ie.id_evento) AND ((ie.estado)::text = ANY (ARRAY[('confirmada'::character varying)::text, ('pendiente'::character varying)::text])))))
  WHERE ((e.fecha_inicio >= CURRENT_DATE) AND ((e.estado)::text = ANY (ARRAY[('publicado'::character varying)::text, ('en_curso'::character varying)::text])) AND (e.deleted_at IS NULL))
  GROUP BY e.id_evento, te.nombre, a.nombre;


--
-- Name: inscripcion_evento trigger_actualizar_cupos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_actualizar_cupos AFTER INSERT OR DELETE OR UPDATE ON public.inscripcion_evento FOR EACH ROW EXECUTE FUNCTION public.actualizar_cupos_evento();


--
-- Name: pago trigger_actualizar_pago_inscripcion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_actualizar_pago_inscripcion AFTER UPDATE ON public.pago FOR EACH ROW WHEN ((((new.estado)::text = 'completado'::text) AND ((old.estado)::text <> 'completado'::text))) EXECUTE FUNCTION public.actualizar_estado_pago_inscripcion();


--
-- Name: equipo_concurso trigger_equipo_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_equipo_updated_at BEFORE UPDATE ON public.equipo_concurso FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: asistencia_invitado trigger_estadisticas_prog_invitado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_estadisticas_prog_invitado AFTER INSERT OR DELETE OR UPDATE ON public.asistencia_invitado FOR EACH ROW EXECUTE FUNCTION public.actualizar_estadisticas_programa();


--
-- Name: asistencia_miembro trigger_estadisticas_prog_miembro; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_estadisticas_prog_miembro AFTER INSERT OR DELETE OR UPDATE ON public.asistencia_miembro FOR EACH ROW EXECUTE FUNCTION public.actualizar_estadisticas_programa();


--
-- Name: evento trigger_evento_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_evento_updated_at BEFORE UPDATE ON public.evento FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: evidencia trigger_evidencia_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_evidencia_updated_at BEFORE UPDATE ON public.evidencia FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: evento trigger_inicializar_cupos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_inicializar_cupos BEFORE INSERT ON public.evento FOR EACH ROW EXECUTE FUNCTION public.inicializar_cupos_disponibles();


--
-- Name: inscripcion_evento trigger_inscripcion_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_inscripcion_updated_at BEFORE UPDATE ON public.inscripcion_evento FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: invitado trigger_invitado_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_invitado_updated_at BEFORE UPDATE ON public.invitado FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: miembro trigger_miembro_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_miembro_updated_at BEFORE UPDATE ON public.miembro FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: pago trigger_pago_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_pago_updated_at BEFORE UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();


--
-- Name: actividad_plataforma_semanal actividad_plataforma_semanal_id_cuenta_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_plataforma_semanal
    ADD CONSTRAINT actividad_plataforma_semanal_id_cuenta_fkey FOREIGN KEY (id_cuenta) REFERENCES public.cuenta_plataforma(id_cuenta) ON DELETE CASCADE;


--
-- Name: asistencia_invitado asistencia_invitado_id_invitado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_invitado
    ADD CONSTRAINT asistencia_invitado_id_invitado_fkey FOREIGN KEY (id_invitado) REFERENCES public.invitado(id_invitado) ON DELETE CASCADE;


--
-- Name: asistencia_invitado asistencia_invitado_id_sesion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_invitado
    ADD CONSTRAINT asistencia_invitado_id_sesion_fkey FOREIGN KEY (id_sesion) REFERENCES public.sesion_programa(id_sesion) ON DELETE CASCADE;


--
-- Name: asistencia_miembro asistencia_miembro_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_miembro
    ADD CONSTRAINT asistencia_miembro_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: asistencia_miembro asistencia_miembro_id_sesion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia_miembro
    ADD CONSTRAINT asistencia_miembro_id_sesion_fkey FOREIGN KEY (id_sesion) REFERENCES public.sesion_programa(id_sesion) ON DELETE CASCADE;


--
-- Name: concurso concurso_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concurso
    ADD CONSTRAINT concurso_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: concurso concurso_id_plataforma_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concurso
    ADD CONSTRAINT concurso_id_plataforma_fkey FOREIGN KEY (id_plataforma) REFERENCES public.catalogo_plataforma(id_plataforma);


--
-- Name: cuenta_plataforma cuenta_plataforma_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_plataforma
    ADD CONSTRAINT cuenta_plataforma_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: cuenta_plataforma cuenta_plataforma_id_plataforma_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuenta_plataforma
    ADD CONSTRAINT cuenta_plataforma_id_plataforma_fkey FOREIGN KEY (id_plataforma) REFERENCES public.catalogo_plataforma(id_plataforma);


--
-- Name: equipo_concurso equipo_concurso_id_concurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipo_concurso
    ADD CONSTRAINT equipo_concurso_id_concurso_fkey FOREIGN KEY (id_concurso) REFERENCES public.concurso(id_concurso) ON DELETE CASCADE;


--
-- Name: evento evento_id_alcance_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT evento_id_alcance_fkey FOREIGN KEY (id_alcance) REFERENCES public.catalogo_alcance_evento(id_alcance);


--
-- Name: evento evento_id_tipo_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento
    ADD CONSTRAINT evento_id_tipo_evento_fkey FOREIGN KEY (id_tipo_evento) REFERENCES public.catalogo_tipo_evento(id_tipo_evento);


--
-- Name: evento_imagenes evento_imagenes_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_imagenes
    ADD CONSTRAINT evento_imagenes_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: evidencia evidencia_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT evidencia_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: evidencia evidencia_id_miembro_creador_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT evidencia_id_miembro_creador_fkey FOREIGN KEY (id_miembro_creador) REFERENCES public.miembro(id_miembro);


--
-- Name: inscripcion_evento inscripcion_evento_id_equipo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_id_equipo_fkey FOREIGN KEY (id_equipo) REFERENCES public.equipo_concurso(id_equipo) ON DELETE SET NULL;


--
-- Name: inscripcion_evento inscripcion_evento_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: inscripcion_evento inscripcion_evento_id_invitado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_id_invitado_fkey FOREIGN KEY (id_invitado) REFERENCES public.invitado(id_invitado) ON DELETE CASCADE;


--
-- Name: inscripcion_evento inscripcion_evento_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_evento
    ADD CONSTRAINT inscripcion_evento_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: inscripcion_programa inscripcion_programa_id_invitado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa
    ADD CONSTRAINT inscripcion_programa_id_invitado_fkey FOREIGN KEY (id_invitado) REFERENCES public.invitado(id_invitado) ON DELETE CASCADE;


--
-- Name: inscripcion_programa inscripcion_programa_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa
    ADD CONSTRAINT inscripcion_programa_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: inscripcion_programa inscripcion_programa_id_programa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripcion_programa
    ADD CONSTRAINT inscripcion_programa_id_programa_fkey FOREIGN KEY (id_programa) REFERENCES public.programa_recurrente(id_programa) ON DELETE CASCADE;


--
-- Name: integrante_equipo integrante_equipo_id_equipo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrante_equipo
    ADD CONSTRAINT integrante_equipo_id_equipo_fkey FOREIGN KEY (id_equipo) REFERENCES public.equipo_concurso(id_equipo) ON DELETE CASCADE;


--
-- Name: integrante_equipo integrante_equipo_id_invitado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrante_equipo
    ADD CONSTRAINT integrante_equipo_id_invitado_fkey FOREIGN KEY (id_invitado) REFERENCES public.invitado(id_invitado) ON DELETE CASCADE;


--
-- Name: integrante_equipo integrante_equipo_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrante_equipo
    ADD CONSTRAINT integrante_equipo_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: juez_evento juez_evento_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juez_evento
    ADD CONSTRAINT juez_evento_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: juez_evento juez_evento_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.juez_evento
    ADD CONSTRAINT juez_evento_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE SET NULL;


--
-- Name: miembro miembro_id_carrera_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembro
    ADD CONSTRAINT miembro_id_carrera_fkey FOREIGN KEY (id_carrera) REFERENCES public.catalogo_carrera(id_carrera);


--
-- Name: pago pago_id_inscripcion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pago
    ADD CONSTRAINT pago_id_inscripcion_fkey FOREIGN KEY (id_inscripcion) REFERENCES public.inscripcion_evento(id_inscripcion) ON DELETE CASCADE;


--
-- Name: participacion_concurso_individual participacion_concurso_individual_id_concurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual
    ADD CONSTRAINT participacion_concurso_individual_id_concurso_fkey FOREIGN KEY (id_concurso) REFERENCES public.concurso(id_concurso) ON DELETE CASCADE;


--
-- Name: participacion_concurso_individual participacion_concurso_individual_id_invitado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual
    ADD CONSTRAINT participacion_concurso_individual_id_invitado_fkey FOREIGN KEY (id_invitado) REFERENCES public.invitado(id_invitado) ON DELETE CASCADE;


--
-- Name: participacion_concurso_individual participacion_concurso_individual_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participacion_concurso_individual
    ADD CONSTRAINT participacion_concurso_individual_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: password_reset_token password_reset_token_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: programa_recurrente programa_recurrente_id_alcance_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_recurrente
    ADD CONSTRAINT programa_recurrente_id_alcance_fkey FOREIGN KEY (id_alcance) REFERENCES public.catalogo_alcance_evento(id_alcance);


--
-- Name: programa_recurrente programa_recurrente_id_tipo_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programa_recurrente
    ADD CONSTRAINT programa_recurrente_id_tipo_evento_fkey FOREIGN KEY (id_tipo_evento) REFERENCES public.catalogo_tipo_evento(id_tipo_evento);


--
-- Name: resultado_equipo_concurso resultado_equipo_concurso_id_equipo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultado_equipo_concurso
    ADD CONSTRAINT resultado_equipo_concurso_id_equipo_fkey FOREIGN KEY (id_equipo) REFERENCES public.equipo_concurso(id_equipo) ON DELETE CASCADE;


--
-- Name: sesion_programa sesion_programa_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_programa
    ADD CONSTRAINT sesion_programa_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: sesion_programa sesion_programa_id_programa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesion_programa
    ADD CONSTRAINT sesion_programa_id_programa_fkey FOREIGN KEY (id_programa) REFERENCES public.programa_recurrente(id_programa) ON DELETE CASCADE;


--
-- Name: staff_evento staff_evento_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_evento
    ADD CONSTRAINT staff_evento_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.evento(id_evento) ON DELETE CASCADE;


--
-- Name: staff_evento staff_evento_id_miembro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_evento
    ADD CONSTRAINT staff_evento_id_miembro_fkey FOREIGN KEY (id_miembro) REFERENCES public.miembro(id_miembro) ON DELETE CASCADE;


--
-- Name: staff_evento staff_evento_id_rol_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_evento
    ADD CONSTRAINT staff_evento_id_rol_fkey FOREIGN KEY (id_rol) REFERENCES public.catalogo_rol_staff(id_rol);


--
-- PostgreSQL database dump complete
--



