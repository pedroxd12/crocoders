-- 004_hash_codigo_verificacion.sql
-- Endurece el flujo de recuperación de contraseña: el código de verificación de
-- 6 dígitos deja de guardarse en TEXTO PLANO y pasa a almacenarse como hash
-- SHA-256 (64 caracteres hex). El código en claro solo viaja en el correo.
--
-- Cambios:
--   1. Ampliar codigo_verificacion de varchar(6) a varchar(64) para alojar el hash.
--
-- IMPORTANTE: aplicar esta migración ANTES de desplegar el código que escribe el
-- hash (src/lib/email-service.js). Si no, el INSERT de un hash de 64 chars en una
-- columna varchar(6) fallaría y rompería el envío del correo de recuperación.
--
-- Los códigos en claro que ya existieran seguirán validando: verify-token tolera
-- valores legacy de 6 dígitos además del hash. Expiran en 1h, así que se drenan solos.
--
-- Idempotente.

BEGIN;

ALTER TABLE public.password_reset_token
  ALTER COLUMN codigo_verificacion TYPE character varying(64);

COMMENT ON COLUMN public.password_reset_token.codigo_verificacion IS
  'Hash SHA-256 (hex) del código de verificación de 6 dígitos. Nunca en texto plano.';

COMMIT;
