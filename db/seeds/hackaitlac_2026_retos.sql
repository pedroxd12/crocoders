-- Semilla: los cinco desafíos de la convocatoria HackaItlac 2026.
--
-- PARA QUÉ SIRVE
-- --------------
-- Hasta la migración 014 estos desafíos vivían escritos a mano dentro de
-- src/components/hackaitlac/HackaitlacLanding.jsx. Este script los mete en la
-- base para que la landing deje de leerlos del código y un administrador pueda
-- editarlos, ponerles cupo de equipos e imagen desde /admin/eventos.
--
-- CÓMO SE USA
-- -----------
--  1. Aplica antes la migración db/migrations/014_retos_evento.sql.
--  2. Crea el evento del hackatón en /admin/eventos (fechas, aforo, concurso
--     por equipos) y escribe «hackaitlac» en «Identificador de página propia».
--  3. Ejecuta este archivo:
--       psql "$DATABASE_URL" -f db/seeds/hackaitlac_2026_retos.sql
--
-- Si no existe ningún evento con ese slug, el script no inserta nada y avisa.
-- Es idempotente: re-ejecutarlo no duplica desafíos ni pisa las ediciones que
-- se hayan hecho después desde el panel.
--
-- NOTA SOBRE EL CUPO: `cupo_equipos` queda en NULL (sin tope propio) porque
-- cuántos equipos admite cada desafío lo decide el comité, no este archivo. Se
-- pone desde el panel, en «Cupo de equipos» de cada desafío.

BEGIN;

DO $$
DECLARE
  v_id_evento integer;
  v_criterios text[] := ARRAY[
    'Propuesta de valor: pertinencia, relevancia, beneficios y distinción',
    'Grado de solución al desafío planteado',
    'Innovación por el uso de tecnología: datos abiertos, ciencia de datos, IA',
    'Potencial de escalabilidad',
    'Y lo que consideren los especialistas del desafío'
  ];
BEGIN
  SELECT id_evento INTO v_id_evento
    FROM evento
   WHERE slug = 'hackaitlac' AND deleted_at IS NULL
   LIMIT 1;

  IF v_id_evento IS NULL THEN
    RAISE NOTICE 'No hay ningún evento con slug = ''hackaitlac''. Créalo en /admin/eventos y vuelve a ejecutar esta semilla.';
    RETURN;
  END IF;

  INSERT INTO reto_evento (
    id_evento, slug, titulo, lede, resumen, descripcion, entregable,
    patrocinador, premio, tags, criterios, tono, orden
  )
  VALUES
    (
      v_id_evento,
      'clasificacion-arancelaria',
      'Clasificación arancelaria',
      'Un algoritmo que determine la fracción arancelaria de un producto.',
      'Una fracción mal asignada cuesta multas y mercancía detenida en aduana. Automatizar esa decisión es el reto.',
      'Diseña y prueba un algoritmo capaz de determinar automáticamente la clasificación arancelaria de un producto a partir de sus características. Es un problema real del comercio exterior: una fracción mal asignada cuesta tiempo, multas y mercancía detenida en aduana.',
      'Prototipo funcional que reciba la descripción de un producto y devuelva su clasificación, con evidencia de las pruebas realizadas sobre casos reales.',
      'Sector aduanal',
      '$15,000 MXN',
      ARRAY['IA', 'Ciencia de datos', 'Comercio exterior'],
      v_criterios, 1, 0
    ),
    (
      v_id_evento,
      'alerta-ciudadana',
      'Alerta ciudadana',
      'Un sistema inteligente de alerta para la seguridad de la ciudad.',
      'Reportar y avisar en segundos, desde la calle y con mala señal. Tiene que servirle a cualquiera, no sólo a quien sabe usarlo.',
      'Diseña un sistema inteligente de alerta ciudadana: que la gente pueda reportar incidentes y recibir avisos de forma rápida y confiable. Piensa en quién lo va a usar en la calle, con prisa y con mala señal.',
      'Prototipo funcional del sistema de reporte y notificación, probado durante el evento con casos de uso concretos.',
      'Seguridad pública municipal',
      '$15,000 MXN',
      ARRAY['Móvil', 'Tiempo real', 'Geolocalización'],
      v_criterios, 2, 1
    ),
    (
      v_id_evento,
      'resguardo-equipo-industrial',
      'Resguardo de equipo industrial',
      'Una plataforma web para registrar, rastrear y controlar equipo.',
      'Alta y baja de activos, asignación, ubicación e historial. Que nadie tenga que perseguir una herramienta por radio.',
      'Desarrolla una plataforma web para el resguardo de equipo industrial: alta y baja de activos, asignación a personal, ubicación, historial de movimientos y reportes de estado. El objetivo es que nadie tenga que perseguir una herramienta por radio.',
      'Plataforma web funcional con el flujo completo de resguardo y devolución, más los reportes básicos de inventario.',
      'Industria del puerto',
      '$15,000 MXN',
      ARRAY['Web', 'Inventario', 'Trazabilidad'],
      v_criterios, 3, 2
    ),
    (
      v_id_evento,
      'despacho-automatico-de-agua',
      'Despacho automático de agua',
      'Automatizar el despacho de agua cruda en CAPALAC.',
      'Sensado, control del flujo y registro de cada despacho de agua cruda, con monitoreo de lo que pasa en la toma.',
      'Crea un sistema para el despacho automático de agua cruda en la Comisión de Agua Potable y Alcantarillado de Lázaro Cárdenas. Sensado, control del flujo, registro de cada despacho y monitoreo de lo que está pasando en la toma.',
      'Prototipo funcional (software y, si aplica, hardware) que ejecute y registre un ciclo completo de despacho.',
      'CAPALAC',
      '$15,000 MXN',
      ARRAY['IoT', 'Automatización', 'Sensores'],
      v_criterios, 4, 3
    ),
    (
      v_id_evento,
      'imagen-urbana',
      'Imagen urbana',
      'Una propuesta de imagen urbana para Lázaro Cárdenas.',
      'Diseño urbano apoyado en tecnología: visualización, participación ciudadana y una propuesta ejecutable por etapas.',
      'Desarrolla una propuesta para el diseño de la imagen urbana de la Ciudad de Lázaro Cárdenas, Michoacán. Aquí la tecnología acompaña al diseño: visualización, participación ciudadana y una propuesta que se pueda ejecutar por etapas.',
      'Propuesta de diseño acompañada de un prototipo que la comunique: maqueta digital, visualización interactiva o herramienta de consulta.',
      'Gobierno municipal',
      '$15,000 MXN',
      ARRAY['Diseño', 'Visualización', 'Ciudad'],
      v_criterios, 5, 4
    )
  ON CONFLICT ON CONSTRAINT reto_evento_slug_unico DO NOTHING;

  RAISE NOTICE 'Desafíos del HackaItlac cargados en el evento %.', v_id_evento;
END $$;

COMMIT;
