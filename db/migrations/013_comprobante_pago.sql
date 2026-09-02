-- 013: Comprobante de pago de la inscripción a un evento con costo.
--
-- Motivo: `evento.tiene_costo` sólo servía para PINTAR el importe. El cobro se
-- hace fuera de la plataforma (transferencia/depósito) y la única huella era el
-- booleano `inscripcion_evento.pago_completado`, que un administrador marcaba a
-- ciegas: no había forma de saber quién había pagado de verdad ni de auditarlo
-- después. Ahora el inscrito sube una IMAGEN del comprobante y el staff o un
-- administrador la valida contra la lista de asistentes.
--
-- Decisiones:
--  - UNA fila por inscripción (UNIQUE): volver a subir REEMPLAZA la anterior y
--    la deja otra vez en 'pendiente'. Guardar histórico obligaría a decidir en
--    cada consulta cuál es "el bueno"; el archivo viejo se borra de UploadThing
--    en el mismo camino que hace el reemplazo.
--  - `estado` es del comprobante, no de la inscripción: aprobar un comprobante
--    es lo que pone `inscripcion_evento.pago_completado = true` (y con ello el
--    trigger/endpoint deja la inscripción 'confirmada'). Así el estado de pago
--    de la inscripción sigue siendo el único que consulta el resto del sistema.
--  - `evento.instrucciones_pago` porque pedir un comprobante sin decir a qué
--    cuenta se deposita no sirve de nada.
--
-- Aditiva e idempotente.

BEGIN;

-- Dónde y cómo se paga. Se muestra en la ficha pública del evento y dentro del
-- modal que pide el comprobante.
ALTER TABLE evento
  ADD COLUMN IF NOT EXISTS instrucciones_pago text;

COMMENT ON COLUMN evento.instrucciones_pago IS
  'Texto libre con los datos de pago (cuenta, referencia, dónde pagar en persona). Se muestra al inscribirse en eventos con tiene_costo.';

CREATE TABLE IF NOT EXISTS comprobante_pago (
  id_comprobante  serial PRIMARY KEY,
  -- ON DELETE CASCADE: si se borra la inscripción, el comprobante no tiene
  -- sentido. El archivo del CDN lo limpia el código que borra la inscripción.
  id_inscripcion  integer NOT NULL UNIQUE
                  REFERENCES inscripcion_evento(id_inscripcion) ON DELETE CASCADE,
  imagen_url      varchar(500) NOT NULL,
  imagen_key      varchar(255) NOT NULL,
  nombre_archivo  varchar(255),
  -- Folio / referencia de la transferencia, tal cual la teclea quien paga.
  referencia      varchar(120),
  monto_declarado numeric(10,2),
  estado          varchar(20) NOT NULL DEFAULT 'pendiente',
  motivo_rechazo  text,
  subido_en       timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Quién lo revisó: administrador o staff del evento (miembro con cuenta).
  revisado_por    integer REFERENCES miembro(id_miembro) ON DELETE SET NULL,
  revisado_en     timestamp without time zone,
  created_at      timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT comprobante_pago_estado_check
    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  CONSTRAINT comprobante_pago_monto_check
    CHECK (monto_declarado IS NULL OR monto_declarado >= 0)
);

COMMENT ON TABLE comprobante_pago IS
  'Imagen del pago que sube quien se inscribe a un evento con costo; la valida el staff o un administrador.';

-- El panel filtra por "pendientes de revisar".
CREATE INDEX IF NOT EXISTS idx_comprobante_pago_estado ON comprobante_pago (estado);

-- Mismo trigger de updated_at que el resto de las tablas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_comprobante_pago_updated_at'
  ) THEN
    CREATE TRIGGER trigger_comprobante_pago_updated_at
      BEFORE UPDATE ON comprobante_pago
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();
  END IF;
END $$;

COMMIT;
