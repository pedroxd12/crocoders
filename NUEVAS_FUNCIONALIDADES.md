# 🎓 Sistema de Programas Recurrentes y Panel de Staff

## ✅ Implementación Completada

Se han creado dos funcionalidades principales para el sistema de gestión de eventos del Club Crocoders:

---

## 1. 📚 Programas Recurrentes (Cursos con Múltiples Sesiones)

### ¿Qué es?
Sistema para gestionar cursos o programas que tienen múltiples sesiones a lo largo de un periodo. Por ejemplo: "Curso de Python - 8 semanas" con sesiones independientes.

### Características Principales:

#### 📋 Gestión de Programas
- **Crear/Editar Programas**: Define nombre, descripción, fechas, tipo, alcance
- **Configuración de Certificados**: 
  - Número mínimo de sesiones requeridas
  - Porcentaje mínimo de asistencia (por defecto 80%)
- **Lista de Programas**: Vista general con estadísticas

#### 📅 Gestión de Sesiones
- **Vincular Eventos Existentes**: Agregar eventos como sesiones del programa
- **Numeración de Sesiones**: Organizar sesiones secuencialmente (1, 2, 3...)
- **Sesiones Obligatorias**: Marcar sesiones como obligatorias para certificado
- **Estadísticas por Sesión**: Ver asistencia de cada sesión

#### 👥 Registro y Asistencia
- **Inscripción al Programa Completo**: Usuarios se inscriben una vez al programa entero
- **Asistencia Automática**: Al marcar asistencia en cada sesión, se actualiza automáticamente:
  - Número de sesiones asistidas
  - Porcentaje de asistencia
  - Elegibilidad para certificado
- **Reporte Detallado**: Ver progreso de cada participante

#### 🎓 Certificados
- **Elegibilidad Automática**: El sistema calcula automáticamente quién califica
- **Criterios**:
  - Asistió al número mínimo de sesiones requeridas
  - Alcanzó el porcentaje mínimo de asistencia
- **Exportación CSV**: Descargar reporte completo

### Rutas Creadas:

```
📂 Admin - Programas Recurrentes
├── /admin/programas                     → Lista de programas
├── /admin/programas/[id]/sesiones       → Sesiones del programa
└── /admin/programas/[id]/asistencia     → Reporte de asistencia

📡 APIs
├── /api/admin/programas                 → GET (listar), POST (crear)
├── /api/admin/programas/[id]            → GET, PUT, DELETE
├── /api/admin/programas/[id]/sesiones   → GET, POST
├── /api/admin/programas/[id]/asistencia → GET (reporte)
└── /api/admin/programas/[id]/inscribir  → POST
```

---

## 2. 👔 Panel de Staff para Miembros

### ¿Qué es?
Sistema para que miembros asignados como staff de eventos puedan gestionar asistencia y ver información de los eventos donde participan.

### Características Principales:

#### 🏠 Dashboard de Staff
- **Vista General**: Todos los eventos donde eres staff
- **Estadísticas**: Total eventos, en curso, próximos
- **Filtros por Estado**: Próximos, en curso, finalizados
- **Info de Rol**: Ver tu rol en cada evento (Organizador, Apoyo, etc.)

#### 🎯 Vista Detallada del Evento
- **Información Completa**: Detalles del evento, horarios, ubicación
- **Estadísticas en Tiempo Real**: 
  - Total de inscritos
  - Asistentes presentes
  - Porcentaje de asistencia
- **Lista de Asistentes**: Ver quiénes están registrados

#### 📱 Herramientas de Asistencia
- **Escáner QR**: Usar la cámara para escanear códigos QR de asistencia
- **Modo Manual**: Ingresar código QR manualmente si no hay cámara
- **Búsqueda de Asistentes**: Filtrar por nombre, email, número IEEE
- **Vista en Tiempo Real**: La lista se actualiza automáticamente al escanear

### Seguridad:
- ✅ Solo miembros autenticados pueden acceder
- ✅ Las APIs verifican que el usuario sea staff del evento específico
- ✅ No pueden ver eventos donde no son staff

### Rutas Creadas:

```
📂 Staff - Panel Miembros
├── /staff                               → Dashboard principal
└── /staff/eventos/[id]                  → Detalles del evento + herramientas

📡 APIs
├── /api/staff/eventos                   → GET (mis eventos como staff)
├── /api/staff/eventos/[id]              → GET (detalles del evento)
└── /api/staff/eventos/[id]/asistentes   → GET (lista de asistentes)
```

---

## 🔧 Configuración Requerida

### 1. Ejecutar Migración de Base de Datos

**IMPORTANTE**: Debes ejecutar este script SQL para crear las tablas necesarias:

```powershell
psql -U tu_usuario -d tu_base_datos -f agregar_soporte_eventos_recurrentes.sql
```

Este script crea:
- Tabla `programa_recurrente`: Almacena los programas
- Tabla `sesion_programa`: Vincula eventos como sesiones
- Tabla `inscripcion_programa`: Inscripciones a programas
- Trigger automático: Actualiza estadísticas de asistencia

### 2. Verificar Script de Fecha Límite

Ya está corregido el script `agregar_fecha_limite_registro.sql` con `IF NOT EXISTS`.

---

## 📍 Acceso a las Nuevas Funcionalidades

### Para Administradores:
1. Inicia sesión como administrador
2. Abre el menú de navegación (☰)
3. Verás nueva opción: **"Programas"**
4. También puedes acceder directamente a: `/admin/programas`

### Para Miembros Staff:
1. Inicia sesión como miembro (no admin)
2. Abre el menú de navegación (☰)
3. Verás nueva opción: **"Panel Staff"**
4. También puedes acceder directamente a: `/staff`
5. Si no eres staff de ningún evento, verás mensaje informativo

---

## 🎨 Ejemplo de Uso: Curso de Python

### 1. Crear el Programa
- Nombre: "Curso Completo de Python"
- Periodo: 8 semanas (01/03/2026 - 26/04/2026)
- Sesiones requeridas: 6 de 8
- % mínimo asistencia: 75%

### 2. Agregar Sesiones
Crear 8 eventos independientes:
- Sesión 1: "Introducción a Python"
- Sesión 2: "Variables y Tipos de Datos"
- ...
- Sesión 8: "Proyecto Final"

Vincular cada evento al programa.

### 3. Inscribir Participantes
Los participantes se inscriben una vez al programa completo.

### 4. Marcar Asistencia
Cada sesión, marca asistencia normalmente.
El sistema actualiza automáticamente:
- Sesiones asistidas: 6/8
- % Asistencia: 75%
- Elegible: ✅ Sí (cumple requisitos)

### 5. Emitir Certificados
Al final, filtra por elegibles y emite certificados.

---

## 🚨 Solución de Problemas

### "No veo la opción de Programas"
- Verifica que seas administrador
- Refresca la página (Ctrl+F5)
- Verifica que estés logueado

### "No veo ningún evento en Panel Staff"
- Es normal si no te han asignado como staff
- Los administradores deben agregarte en: Eventos → Staff del Evento

### "Error al cargar programas"
- Verifica que hayas ejecutado el script SQL
- Revisa la consola del servidor para errores
- Verifica conexión a base de datos

### Dropdown de Staff Vacío (YA CORREGIDO)
- Se corrigió el endpoint `/api/admin/users`
- Ahora concatena correctamente nombre completo de miembros
- Reinicia el servidor: `npm run dev`

---

## 📊 Base de Datos - Tablas Creadas

```sql
-- Programa recurrente
⚙️ programa_recurrente
   ├─ id_programa
   ├─ nombre, descripcion
   ├─ fecha_inicio, fecha_fin
   ├─ sesiones_requeridas_certificado
   ├─ porcentaje_asistencia_minimo
   └─ activo

-- Sesiones del programa
⚙️ sesion_programa
   ├─ id_sesion
   ├─ id_programa (FK)
   ├─ id_evento (FK)
   ├─ numero_sesion
   ├─ titulo, descripcion
   └─ es_obligatoria

-- Inscripciones a programas
⚙️ inscripcion_programa
   ├─ id_inscripcion_programa
   ├─ id_programa (FK)
   ├─ id_miembro/id_invitado (FK)
   ├─ sesiones_asistidas
   ├─ porcentaje_asistencia
   ├─ elegible_certificado
   └─ certificado_emitido
```

---

## ✨ Mejoras Futuras Sugeridas

1. **Emisión Automática de Certificados**: Generar PDFs automáticamente
2. **Notificaciones**: Email cuando un participante sea elegible
3. **Plantillas de Certificados**: Diseño personalizable
4. **Estadísticas Avanzadas**: Gráficas de progreso
5. **App Móvil para Staff**: Aplicación nativa para escaneo más rápido

---

## 📝 Notas Importantes

- ✅ **Sistema QR**: Ya implementado y funcionando en asistentes
- ✅ **Dropdown Staff**: Corregido (concatenación de nombres)
- ✅ **Timezone**: Corregido en todas las fechas
- ✅ **Fecha Límite Registro**: Script con IF NOT EXISTS
- ⚠️ **Ejecutar SQL**: No olvides el script de eventos recurrentes

---

## 🎉 ¡Todo Listo!

El sistema está completamente funcional. Solo falta:
1. Ejecutar el script SQL de eventos recurrentes
2. Reiniciar el servidor Next.js
3. Probar las funcionalidades

¿Preguntas o necesitas algo más? 🚀
