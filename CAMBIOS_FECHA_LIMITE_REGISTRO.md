# Cambios Realizados: Fecha Límite de Registro para Eventos

## Resumen
Se ha implementado la funcionalidad de **fecha límite de registro** para eventos, permitiendo definir una fecha y hora específica hasta la cual los usuarios pueden inscribirse, independientemente de la fecha de inicio del evento.

## Problema Resuelto
Anteriormente, el sistema no permitía inscripciones a eventos el mismo día del evento, incluso si aún no era la hora de inicio. Ahora puedes controlar exactamente hasta cuándo se aceptan inscripciones.

---

## 🗄️ Cambios en la Base de Datos

### 1. Script SQL de Migración
**Archivo:** `agregar_fecha_limite_registro.sql`

Ejecuta este script en tu base de datos PostgreSQL:

```bash
psql -U tu_usuario -d tu_base_de_datos -f agregar_fecha_limite_registro.sql
```

Este script:
- Agrega el campo `fecha_limite_registro` (TIMESTAMP) a la tabla `evento`
- Establece valores por defecto para eventos existentes (1 hora antes del inicio)
- Agrega documentación al campo

---

## 🔧 Cambios en el Backend

### APIs Modificadas:

#### 1. `/api/eventos/route.js`
- ✅ Incluye `fecha_limite_registro` en la consulta GET

#### 2. `/api/eventos/[id]/route.js`
- ✅ Devuelve `fecha_limite_registro` en formato ISO string

#### 3. `/api/eventos/register/route.js`
- ✅ Valida que la fecha actual no exceda la `fecha_limite_registro`
- ✅ Muestra mensaje: "El periodo de inscripción para este evento ha finalizado"

#### 4. `/api/admin/eventos/route.js`
- ✅ GET: Incluye `fecha_limite_registro` en la respuesta
- ✅ POST: Permite crear eventos con `fecha_limite_registro`

#### 5. `/api/admin/eventos/[id]/route.js`
- ✅ PUT: Permite actualizar `fecha_limite_registro`

---

## 🎨 Cambios en el Frontend

### Vistas Públicas:

#### 1. `/src/app/eventos/page.jsx` (Lista de Eventos)
- ✅ Calcula `registroCerrado` basándose en `fecha_limite_registro`
- ✅ Pasa la propiedad a los EventCards

#### 2. `/src/app/eventos/[id]/page.jsx` (Detalle de Evento)
- ✅ Nueva propiedad: `registroCerrado` que verifica `fecha_limite_registro`
- ✅ Separa `isPastEvent` (para badge "Finalizado") de `registroCerrado` (para controlar inscripciones)
- ✅ El botón de inscripción muestra "Inscripciones Cerradas" cuando corresponde
- ✅ Toast informativo cuando se intenta inscribir después del límite

#### 3. `/src/components/EventCard.js`
- ✅ Muestra badge "Inscripciones Cerradas" (naranja) cuando `registroCerrado === true`
- ✅ Prioridad de badges: Finalizado > Inscrito > Inscripciones Cerradas > Cupos Llenos > Disponible

### Panel de Administración:

#### 4. `/src/app/admin/eventos/page.jsx`
- ✅ Nuevo campo en el formulario: **"Fecha Límite de Registro"** (datetime-local)
- ✅ Tooltip explicativo para el administrador
- ✅ Campo opcional: si se deja vacío, se permite inscripción hasta 1 hora antes del evento
- ✅ Carga y guarda correctamente al editar eventos existentes

---

## 📋 Instrucciones de Uso

### Para Administradores:

1. **Crear o Editar un Evento:**
   - Ve al panel de administración en `/admin/eventos`
   - Al crear o editar un evento, verás el campo "Fecha Límite de Registro"
   - Selecciona la fecha y hora hasta la cual se aceptarán inscripciones
   - Si lo dejas vacío, el sistema usa un valor por defecto

2. **Valores Recomendados:**
   - Para eventos presenciales: 1-2 días antes
   - Para eventos virtuales: 1 hora antes
   - Para concursos: El día anterior

### Para Usuarios:

1. **Visualización:**
   - En la lista de eventos verás un badge "Inscripciones Cerradas" en naranja
   - En el detalle del evento, el botón dirá "Inscripciones Cerradas" y estará deshabilitado
   
2. **Comportamiento:**
   - No podrás inscribirte después de la fecha límite
   - Verás un mensaje informativo si intentas inscribirte

---

## 🧪 Pruebas Recomendadas

1. **Base de Datos:**
   ```sql
   -- Verificar que el campo existe
   SELECT fecha_limite_registro FROM evento LIMIT 1;
   ```

2. **Crear Evento de Prueba:**
   - Crea un evento con fecha límite de registro en el futuro cercano
   - Espera a que pase la fecha límite
   - Intenta inscribirte y verifica que se bloquee

3. **Validar Frontend:**
   - Verifica que el badge aparece correctamente
   - Confirma que el botón se deshabilita
   - Revisa que el mensaje de error es claro

---

## ⚠️ Notas Importantes

1. **Compatibilidad con Eventos Existentes:**
   - El script SQL establece fechas límite automáticamente para eventos existentes
   - Revisa y ajusta estas fechas según tus necesidades

2. **Campo Opcional:**
   - `fecha_limite_registro` puede ser NULL
   - Si es NULL, se recomienda implementar lógica de fallback (ej: 1 hora antes del inicio)

3. **Zona Horaria:**
   - El campo es TIMESTAMP WITHOUT TIME ZONE
   - Asegúrate de que tu servidor y base de datos usen la misma zona horaria

---

## 🔄 Próximas Mejoras Sugeridas

- [ ] Agregar recordatorio automático cuando se acerca la fecha límite
- [ ] Estadísticas de inscripciones por día
- [ ] Configuración de fecha límite por defecto en el panel admin
- [ ] Extensión de fecha límite para eventos con pocos inscritos

---

## 📞 Soporte

Si encuentras algún problema con esta implementación:
1. Verifica que el script SQL se ejecutó correctamente
2. Revisa los logs del servidor para errores
3. Confirma que todos los archivos fueron actualizados

---

**Fecha de Implementación:** 2026-02-07  
**Versión:** 1.0.0
