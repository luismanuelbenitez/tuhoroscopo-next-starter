-- Teléfonos de usos de códigos a E.164 (2026-10-18).
--
-- Hasta hoy el checkout mandaba el teléfono tal como se tipeó (099…) al
-- validar un código, y ef_tarot_validar_codigo lo guardaba y comparaba sin
-- normalizar: el cupo por cliente no reconocía como la misma persona a
-- 099863263 y +59899863263. Desde ahora ef_tarot_validar_codigo normaliza
-- con _shared/tarot-identidad.ts (normalizarTelefono). Esta migración lleva
-- los usos ya guardados al mismo formato, con la misma regla canónica de
-- Uruguay (09XXXXXXX → +5989XXXXXXX), para que sigan contando.
-- Solo toca filas que hoy no están en E.164; idempotente.

update tarot_codigos_descuento_usos
   set telefono = '+598' || substring(regexp_replace(telefono, '[\s\-().]', '', 'g') from 2),
       updated_at = now()
 where regexp_replace(telefono, '[\s\-().]', '', 'g') ~ '^09\d{7}$';

update tarot_codigos_descuento_usos
   set telefono = '+' || regexp_replace(telefono, '[\s\-().]', '', 'g'),
       updated_at = now()
 where regexp_replace(telefono, '[\s\-().]', '', 'g') ~ '^598\d{8}$';
