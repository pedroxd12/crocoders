-- Script para agregar soporte de eventos recurrentes (cursos con múltiples sesiones)
-- Permite manejar cursos que ocurren múltiples veces durante un periodo

BEGIN;

-- Tabla para agrupar sesiones de un curso/evento recurrente
CREATE TABLE IF NOT EXISTS public.programa_recurrente
(
    id_programa serial NOT NULL,
    nombre character varying(255) COLLATE pg_catalog."default" NOT NULL,
    descripcion text COLLATE pg_catalog."default",
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    id_tipo_evento integer NOT NULL,
    id_alcance integer NOT NULL,
    sesiones_requeridas_certificado integer DEFAULT 0,
    porcentaje_asistencia_minimo numeric(5,2) DEFAULT 80.00,
    ubicacion character varying(255) COLLATE pg_catalog."default",
    imagen_url character varying(500) COLLATE pg_catalog."default",
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT programa_recurrente_pkey PRIMARY KEY (id_programa),
    CONSTRAINT programa_recurrente_id_tipo_evento_fkey FOREIGN KEY (id_tipo_evento)
        REFERENCES public.catalogo_tipo_evento (id_tipo_evento),
    CONSTRAINT programa_recurrente_id_alcance_fkey FOREIGN KEY (id_alcance)
        REFERENCES public.catalogo_alcance_evento (id_alcance)
);

COMMENT ON TABLE public.programa_recurrente
    IS 'Programas o cursos con múltiples sesiones durante un periodo extendido';

COMMENT ON COLUMN public.programa_recurrente.sesiones_requeridas_certificado
    IS 'Número mínimo de sesiones que debe asistir para obtener certificado';

COMMENT ON COLUMN public.programa_recurrente.porcentaje_asistencia_minimo
    IS 'Porcentaje mínimo de asistencia requerido para certificado';

-- Tabla para sesiones individuales de un programa
CREATE TABLE IF NOT EXISTS public.sesion_programa
(
    id_sesion serial NOT NULL,
    id_programa integer NOT NULL,
    id_evento integer NOT NULL,
    numero_sesion integer NOT NULL,
    titulo character varying(255) COLLATE pg_catalog."default",
    descripcion text COLLATE pg_catalog."default",
    es_obligatoria boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sesion_programa_pkey PRIMARY KEY (id_sesion),
    CONSTRAINT sesion_programa_id_programa_numero_sesion_key UNIQUE (id_programa, numero_sesion),
    CONSTRAINT sesion_programa_id_evento_key UNIQUE (id_evento),
    CONSTRAINT sesion_programa_id_programa_fkey FOREIGN KEY (id_programa)
        REFERENCES public.programa_recurrente (id_programa)
        ON DELETE CASCADE,
    CONSTRAINT sesion_programa_id_evento_fkey FOREIGN KEY (id_evento)
        REFERENCES public.evento (id_evento)
        ON DELETE CASCADE
);

COMMENT ON TABLE public.sesion_programa
    IS 'Sesiones individuales que conforman un programa recurrente';

CREATE INDEX IF NOT EXISTS idx_sesion_programa
    ON public.sesion_programa(id_programa);

CREATE INDEX IF NOT EXISTS idx_sesion_evento
    ON public.sesion_programa(id_evento);

-- Tabla para inscripciones a programas completos
CREATE TABLE IF NOT EXISTS public.inscripcion_programa
(
    id_inscripcion_programa serial NOT NULL,
    id_programa integer NOT NULL,
    id_miembro integer,
    id_invitado integer,
    fecha_inscripcion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    estado character varying(20) COLLATE pg_catalog."default" DEFAULT 'activo'::character varying,
    sesiones_asistidas integer DEFAULT 0,
    porcentaje_asistencia numeric(5,2) DEFAULT 0.00,
    elegible_certificado boolean DEFAULT false,
    certificado_emitido boolean DEFAULT false,
    fecha_certificado timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inscripcion_programa_pkey PRIMARY KEY (id_inscripcion_programa),
    CONSTRAINT inscripcion_programa_id_programa_id_miembro_key UNIQUE (id_programa, id_miembro),
    CONSTRAINT inscripcion_programa_id_programa_id_invitado_key UNIQUE (id_programa, id_invitado),
    CONSTRAINT inscripcion_programa_id_programa_fkey FOREIGN KEY (id_programa)
        REFERENCES public.programa_recurrente (id_programa)
        ON DELETE CASCADE,
    CONSTRAINT inscripcion_programa_id_miembro_fkey FOREIGN KEY (id_miembro)
        REFERENCES public.miembro (id_miembro)
        ON DELETE CASCADE,
    CONSTRAINT inscripcion_programa_id_invitado_fkey FOREIGN KEY (id_invitado)
        REFERENCES public.invitado (id_invitado)
        ON DELETE CASCADE,
    CONSTRAINT un_tipo_inscrito_programa CHECK (
        (id_miembro IS NOT NULL)::integer + 
        (id_invitado IS NOT NULL)::integer = 1
    )
);

COMMENT ON TABLE public.inscripcion_programa
    IS 'Inscripciones a programas completos (cursos recurrentes)';

CREATE INDEX IF NOT EXISTS idx_inscripcion_programa_programa
    ON public.inscripcion_programa(id_programa);

CREATE INDEX IF NOT EXISTS idx_inscripcion_programa_miembro
    ON public.inscripcion_programa(id_miembro);

CREATE INDEX IF NOT EXISTS idx_inscripcion_programa_invitado
    ON public.inscripcion_programa(id_invitado);

-- Trigger para actualizar estadísticas de asistencia
CREATE OR REPLACE FUNCTION actualizar_estadisticas_programa()
RETURNS TRIGGER AS $$
BEGIN
    -- Cuando se marca asistencia en una sesión, actualizar inscripción del programa
    IF NEW.asistio = true AND (OLD IS NULL OR OLD.asistio = false) THEN
        UPDATE inscripcion_programa ip
        SET 
            sesiones_asistidas = (
                SELECT COUNT(DISTINCT ie.id_evento)
                FROM inscripcion_evento ie
                JOIN sesion_programa sp ON ie.id_evento = sp.id_evento
                WHERE sp.id_programa = (
                    SELECT id_programa 
                    FROM sesion_programa 
                    WHERE id_evento = NEW.id_evento
                )
                AND (ie.id_miembro = ip.id_miembro OR ie.id_invitado = ip.id_invitado)
                AND ie.asistio = true
            ),
            updated_at = NOW()
        WHERE (ip.id_miembro = NEW.id_miembro OR ip.id_invitado = NEW.id_invitado)
        AND ip.id_programa = (
            SELECT id_programa 
            FROM sesion_programa 
            WHERE id_evento = NEW.id_evento
        );
        
        -- Calcular porcentaje y elegibilidad
        UPDATE inscripcion_programa ip
        SET 
            porcentaje_asistencia = (
                CASE 
                    WHEN (SELECT COUNT(*) FROM sesion_programa WHERE id_programa = ip.id_programa) > 0
                    THEN (ip.sesiones_asistidas::numeric / 
                          (SELECT COUNT(*) FROM sesion_programa WHERE id_programa = ip.id_programa)::numeric * 100)
                    ELSE 0
                END
            ),
            elegible_certificado = (
                ip.sesiones_asistidas >= (
                    SELECT COALESCE(sesiones_requeridas_certificado, 0)
                    FROM programa_recurrente WHERE id_programa = ip.id_programa
                )
                AND
                (CASE 
                    WHEN (SELECT COUNT(*) FROM sesion_programa WHERE id_programa = ip.id_programa) > 0
                    THEN (ip.sesiones_asistidas::numeric / 
                          (SELECT COUNT(*) FROM sesion_programa WHERE id_programa = ip.id_programa)::numeric * 100)
                    ELSE 0
                END) >= (
                    SELECT COALESCE(porcentaje_asistencia_minimo, 80)
                    FROM programa_recurrente WHERE id_programa = ip.id_programa
                )
            ),
            updated_at = NOW()
        WHERE (ip.id_miembro = NEW.id_miembro OR ip.id_invitado = NEW.id_invitado)
        AND ip.id_programa = (
            SELECT id_programa 
            FROM sesion_programa 
            WHERE id_evento = NEW.id_evento
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_estadisticas_programa
AFTER INSERT OR UPDATE OF asistio ON inscripcion_evento
FOR EACH ROW
EXECUTE FUNCTION actualizar_estadisticas_programa();

COMMIT;

-- Ejemplos de consultas útiles:

-- Ver progreso de un estudiante en un programa
/*
SELECT 
    pr.nombre as programa,
    m.nombre || ' ' || m.apellido_paterno as estudiante,
    ip.sesiones_asistidas,
    (SELECT COUNT(*) FROM sesion_programa WHERE id_programa = pr.id_programa) as total_sesiones,
    ip.porcentaje_asistencia,
    ip.elegible_certificado,
    ip.certificado_emitido
FROM inscripcion_programa ip
JOIN programa_recurrente pr ON ip.id_programa = pr.id_programa
LEFT JOIN miembro m ON ip.id_miembro = m.id_miembro
LEFT JOIN invitado i ON ip.id_invitado = i.id_invitado
WHERE pr.id_programa = 1;
*/

-- Listar estudiantes elegibles para certificado
/*
SELECT 
    pr.nombre as programa,
    COALESCE(m.nombre || ' ' || m.apellido_paterno, i.nombre_completo) as estudiante,
    ip.sesiones_asistidas,
    ip.porcentaje_asistencia,
    ip.certificado_emitido
FROM inscripcion_programa ip
JOIN programa_recurrente pr ON ip.id_programa = pr.id_programa
LEFT JOIN miembro m ON ip.id_miembro = m.id_miembro
LEFT JOIN invitado i ON ip.id_invitado = i.id_invitado
WHERE ip.elegible_certificado = true
AND ip.certificado_emitido = false
ORDER BY pr.nombre, estudiante;
*/
