-- SQL para corregir el error de restricción 'un_tipo_inscrito'

-- 1. Eliminar la restricción actual (que no contempla equipos)
ALTER TABLE inscripcion_evento DROP CONSTRAINT IF EXISTS un_tipo_inscrito;

-- 2. Agregar la restricción actualizada que acepte id_equipo
ALTER TABLE inscripcion_evento 
ADD CONSTRAINT un_tipo_inscrito 
CHECK (
    (id_miembro IS NOT NULL)::integer + 
    (id_invitado IS NOT NULL)::integer + 
    (id_equipo IS NOT NULL)::integer = 1
);

-- Nota: Esto asegura que una inscripción pertenezca EXCLUSIVAMENTE a:
-- un Miembro, un Invitado, O un Equipo.