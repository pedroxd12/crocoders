-- 006_limpieza_esquema_muerto.sql
--
-- ESTADO: PENDIENTE. Revísala y aplícala a mano; después regenera db/schema.sql
-- (ver db/migrations/README.md). El dump del repositorio describe la base SIN
-- esta migración, que es como está hoy producción.
--
-- Retira estructuras que ninguna parte de src/ lee ni escribe. Son peores que
-- inútiles: hacen creer que existe una funcionalidad ("problemas resueltos esta
-- semana", "fecha límite de registro del concurso") y esconden dónde está la
-- que sí funciona.
--
-- 1. actividad_plataforma_semanal + v_actividad_semanal_actual +
--    cuenta_plataforma.problemas_resueltos_semana
--    Nadie ha insertado nunca una fila en la tabla: el sincronizador
--    (src/lib/puntajes-sync.js, guardarResultados) sólo escribe totales,
--    dificultad, rating, rank, avatar y estado. La vista hace LEFT JOIN contra
--    la tabla vacía, así que `problemas_esta_semana` es 0 para todo el mundo,
--    siempre. Ninguna pantalla la consulta.
--
-- 2. concurso.fecha_limite_registro y concurso.permite_registro_tardio
--    Duplican el nombre de evento.fecha_limite_registro, que es el ÚNICO que se
--    consulta (src/app/api/eventos/register/route.js) y el único que el panel
--    escribe. Dos columnas con el mismo nombre y semántica distinta en tablas
--    relacionadas es una trampa para quien lea la base.
--
-- Si en el futuro se quiere la actividad semanal de verdad, el punto de
-- enganche es `guardarResultados`: allí se conoce el total anterior de la
-- cuenta antes del UPDATE, así que el delta es directo. Pero sólo tiene sentido
-- si alguna pantalla lo va a mostrar.
--
-- Idempotente.

BEGIN;

-- 1. Actividad semanal por plataforma (nunca poblada).
DROP VIEW IF EXISTS public.v_actividad_semanal_actual;
DROP TABLE IF EXISTS public.actividad_plataforma_semanal;
ALTER TABLE public.cuenta_plataforma
  DROP COLUMN IF EXISTS problemas_resueltos_semana;

-- 2. Campos de concurso que nadie lee (el vigente es evento.fecha_limite_registro).
ALTER TABLE public.concurso
  DROP COLUMN IF EXISTS permite_registro_tardio,
  DROP COLUMN IF EXISTS fecha_limite_registro;

COMMIT;
