-- 005_puntajes_sync_avatar.sql
--
-- La página de puntajes dependía por completo de las APIs externas para las
-- fotos de perfil: `cuenta_plataforma` no tenía dónde guardarlas, así que
-- cualquier respuesta servida desde BD (arranque en frío, caché stale, fallo de
-- Codeforces) llegaba sin avatares. Además no había forma de recordar que un
-- usuario NO existe en la plataforma, así que cada refresco reintentaba los
-- handles inválidos (41 de 63 cuentas de prueba) y consumía el rate limit que
-- necesitaban los miembros reales.
--
-- Columnas nuevas:
--   avatar_url      foto de perfil cacheada (Codeforces titlePhoto / gravatar de omegaUp)
--   rating_usuario  rating del usuario en la plataforma (Codeforces)
--   rank_usuario    título del rango (newbie, pupil, specialist, ...)
--   estado_sync     pendiente | ok | no_encontrado | error
--   ultimo_intento  último intento de sincronización (exitoso o no)
--
-- Nota: `rating` ya existía y guarda la DIFICULTAD del problema más difícil
-- resuelto, no el rating del usuario. Por eso `rating_usuario` es una columna
-- aparte en vez de reutilizar la existente.

ALTER TABLE public.cuenta_plataforma
  ADD COLUMN IF NOT EXISTS avatar_url     character varying(500),
  ADD COLUMN IF NOT EXISTS rating_usuario integer,
  ADD COLUMN IF NOT EXISTS rank_usuario   character varying(50),
  ADD COLUMN IF NOT EXISTS estado_sync    character varying(20) DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS ultimo_intento timestamp without time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cuenta_plataforma_estado_sync_check'
  ) THEN
    ALTER TABLE public.cuenta_plataforma
      ADD CONSTRAINT cuenta_plataforma_estado_sync_check
      CHECK (estado_sync IN ('pendiente', 'ok', 'no_encontrado', 'error'));
  END IF;
END $$;

-- Backfill: las cuentas que alguna vez se sincronizaron con éxito ya tienen
-- `ultima_actualizacion`. Las que nunca lo lograron (handles inventados de las
-- pruebas) se quedan en 'pendiente' y el primer sync las marcará como
-- 'no_encontrado', sacándolas de la tabla pública.
UPDATE public.cuenta_plataforma
   SET estado_sync = 'ok'
 WHERE ultima_actualizacion IS NOT NULL
   AND estado_sync = 'pendiente';

-- El sync toma las cuentas más antiguas primero (rotación round-robin), así que
-- este índice cubre exactamente la consulta de selección.
CREATE INDEX IF NOT EXISTS idx_cuenta_plataforma_sync
  ON public.cuenta_plataforma (ultima_actualizacion NULLS FIRST)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_cuenta_plataforma_miembro_activo
  ON public.cuenta_plataforma (id_miembro)
  WHERE activo = true;

COMMENT ON COLUMN public.cuenta_plataforma.avatar_url IS
  'Foto de perfil cacheada de la plataforma; evita depender de la API externa para mostrarla.';
COMMENT ON COLUMN public.cuenta_plataforma.estado_sync IS
  'pendiente | ok | no_encontrado (el handle no existe) | error (fallo transitorio).';
COMMENT ON COLUMN public.cuenta_plataforma.rating IS
  'Dificultad del problema más difícil resuelto (NO es el rating del usuario).';
