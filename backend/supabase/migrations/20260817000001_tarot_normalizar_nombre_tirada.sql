-- ============================================================
-- Normalización de nomenclatura de producto: "Tu Tirada Cósmica"
-- queda deprecado. Nombre oficial del producto Tarot: "Tu Tirada".
-- Ver docs/product/DECISIONS.md (2026-08-17).
--
-- Este UPDATE es quirúrgico: una sola fila, el tipo de tirada
-- actualmente activo. NO se toca la migración de seed original
-- (20260518145258_tarot_sprint1_seeds_base.sql) — permanece como
-- registro histórico fiel de qué se sembró originalmente.
--
-- "Tirada de 5 Cartas" describe el tipo de tirada (config/catálogo,
-- no el nombre del producto en sí) y es el valor interpolado en
-- {{tipo_tirada}} para el prompt activo de generación de lecturas —
-- se corrige acá porque es CONFIG ACTIVA, no contenido histórico.
-- ============================================================

UPDATE tarot_tipos_tirada
SET nombre = 'Tirada de 5 Cartas'
WHERE id = 'b1000000-0000-0000-0000-000000000001'
  AND nombre = 'Tirada Cósmica de 5 Cartas';
