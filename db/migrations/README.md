# Migraciones

No hay tabla `schema_migrations`: el orden y el estado se llevan aquí, a mano.
Léelo antes de tocar la base.

## Reglas

1. **`db/schema.sql` es un DUMP, no una fuente editable.** Se regenera con:

   ```sh
   pg_dump --schema-only --no-owner --no-privileges \
           --host=$DB_HOST --port=$DB_PORT --username=$DB_USER --dbname=$DB_NAME \
           > db/schema.sql
   ```

   Cualquier cambio de esquema se escribe como migración numerada y se aplica a
   la base; después se regenera el dump. Editarlo a mano sin migración deja el
   repositorio diciendo una cosa y la base haciendo otra, que es exactamente el
   fallo que se corrigió en agosto de 2026 (el dump iba por detrás de 003 y 004,
   así que una base creada desde `schema.sql` rompía la recuperación de
   contraseña y las evidencias de programas).
2. Las migraciones son **idempotentes** (`IF NOT EXISTS`, comprobaciones en
   `DO $$`) para poder re-ejecutarlas sin miedo.
3. Cada una va envuelta en `BEGIN` / `COMMIT`.

## Estado

| Archivo | Estado | Qué hace |
|---|---|---|
| `001_rediseno_eventos.sql` | **aplicada** | `evento.listable`, `juez_evento`, tablas `asistencia_*` |
| `002_trigger_estadisticas_programa.sql` | **aplicada** | triggers `trigger_estadisticas_prog_miembro` / `_invitado` |
| `003_evidencia_programa.sql` | **aplicada** | `evidencia.id_programa`, `id_evento` nullable, CHECK XOR, FK e índice |
| `004_hash_codigo_verificacion.sql` | **aplicada** | `password_reset_token.codigo_verificacion` a `varchar(64)` (hash SHA-256) |
| `005_puntajes_sync_avatar.sql` | **aplicada** | `cuenta_plataforma.avatar_url`, `estado_sync`, `ultimo_intento` |
| `006_limpieza_esquema_muerto.sql` | **PENDIENTE — revisar antes de aplicar** | borra tabla, vista y columnas que ningún código lee ni escribe |

## Triggers activos en producción (verificado)

Conviene tenerlo escrito porque en su día se documentó lo contrario y se
escribieron endpoints que ajustaban los cupos a mano, duplicando el descuento:

- `trigger_actualizar_cupos` — mantiene `evento.cupos_disponibles` al
  insertar/actualizar/borrar en `inscripcion_evento`. **El código no debe sumar
  ni restar cupos por su cuenta.**
- `trigger_inicializar_cupos` — inicializa `cupos_disponibles` al crear el evento.
- `trigger_estadisticas_prog_miembro` / `trigger_estadisticas_prog_invitado`
- `trigger_actualizar_pago_inscripcion` — confirma la inscripción al completarse el pago.
- `trigger_*_updated_at` en `evento`, `evidencia`, `inscripcion_evento`,
  `invitado`, `miembro`, `pago`, `equipo_concurso`.
