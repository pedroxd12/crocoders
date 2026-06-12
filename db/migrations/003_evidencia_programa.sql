-- 003_evidencia_programa.sql
-- Permite que una evidencia pertenezca a un EVENTO o a un PROGRAMA recurrente
-- (antes sólo a eventos, con id_evento NOT NULL). Necesario para mostrar
-- evidencias de talleres/cursos en la línea de tiempo pública.
--
-- Cambios:
--   1. Nueva columna id_programa (nullable) -> FK a programa_recurrente (CASCADE).
--   2. id_evento pasa a NULLABLE.
--   3. CHECK: exactamente uno de {id_evento, id_programa} debe estar presente (XOR).
--   4. Índice por id_programa para las consultas de la galería.
--
-- Idempotente: usa IF NOT EXISTS / comprobaciones para poder re-ejecutarse.

BEGIN;

-- 1. Columna id_programa
ALTER TABLE public.evidencia
  ADD COLUMN IF NOT EXISTS id_programa integer;

-- 2. id_evento nullable (drop NOT NULL si lo tuviera)
ALTER TABLE public.evidencia
  ALTER COLUMN id_evento DROP NOT NULL;

-- 3. FK a programa_recurrente (sólo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'evidencia_id_programa_fkey'
      AND table_name = 'evidencia'
  ) THEN
    ALTER TABLE public.evidencia
      ADD CONSTRAINT evidencia_id_programa_fkey
      FOREIGN KEY (id_programa) REFERENCES public.programa_recurrente(id_programa)
      ON DELETE CASCADE;
  END IF;
END$$;

-- 4. CHECK XOR: una evidencia es de evento O de programa, no ambos ni ninguno.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'evidencia_target_xor'
      AND table_name = 'evidencia'
  ) THEN
    ALTER TABLE public.evidencia
      ADD CONSTRAINT evidencia_target_xor
      CHECK (
        ((id_evento IS NOT NULL)::int + (id_programa IS NOT NULL)::int) = 1
      );
  END IF;
END$$;

-- 5. Índice para filtrar evidencias por programa.
CREATE INDEX IF NOT EXISTS idx_evidencia_programa
  ON public.evidencia (id_programa)
  WHERE id_programa IS NOT NULL;

COMMIT;
