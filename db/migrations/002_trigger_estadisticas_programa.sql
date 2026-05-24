-- =========================================================================
-- Migración 002 — Reescritura del trigger de estadísticas de programa
-- PostgreSQL 14+
--
-- Contexto: la función `actualizar_estadisticas_programa()` original estaba
-- escrita para el modelo VIEJO (asistencia vía inscripcion_evento.asistio sobre
-- eventos espejo vinculados a sesion_programa.id_evento). Tras el rediseño, la
-- asistencia a sesiones de programa vive en asistencia_miembro / asistencia_invitado.
--
-- Esta migración:
--  1. Quita el trigger viejo en inscripcion_evento.
--  2. Reescribe la función para recalcular las estadísticas del inscrito a partir
--     de las tablas de asistencia por sesión, contando SOLO sesiones obligatorias.
--  3. Crea triggers AFTER INSERT/UPDATE/DELETE en asistencia_miembro y
--     asistencia_invitado que llaman a la función.
--
-- Idempotente: puede ejecutarse repetidamente.
-- =========================================================================

BEGIN;

-- 1. Eliminar el trigger viejo del modelo anterior (si existe).
DROP TRIGGER IF EXISTS trigger_actualizar_estadisticas_programa ON inscripcion_evento;

-- 2. Reescribir la función. Recalcula la inscripción de programa afectada
--    (la del miembro/invitado de la fila de asistencia, en el programa de la sesión).
CREATE OR REPLACE FUNCTION public.actualizar_estadisticas_programa()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

    -- ¿De qué tabla de asistencia viene? (miembro o invitado)
    IF TG_TABLE_NAME = 'asistencia_miembro' THEN
        v_id_miembro := COALESCE(NEW.id_miembro, OLD.id_miembro);
    ELSE
        v_id_invitado := COALESCE(NEW.id_invitado, OLD.id_invitado);
    END IF;

    -- Programa al que pertenece la sesión.
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

    -- Actualizar la inscripción de programa correspondiente.
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
$function$;

-- 3. Triggers sobre las tablas de asistencia nuevas.
DROP TRIGGER IF EXISTS trigger_estadisticas_prog_miembro  ON asistencia_miembro;
DROP TRIGGER IF EXISTS trigger_estadisticas_prog_invitado ON asistencia_invitado;

CREATE TRIGGER trigger_estadisticas_prog_miembro
    AFTER INSERT OR UPDATE OR DELETE ON asistencia_miembro
    FOR EACH ROW EXECUTE FUNCTION actualizar_estadisticas_programa();

CREATE TRIGGER trigger_estadisticas_prog_invitado
    AFTER INSERT OR UPDATE OR DELETE ON asistencia_invitado
    FOR EACH ROW EXECUTE FUNCTION actualizar_estadisticas_programa();

COMMIT;
