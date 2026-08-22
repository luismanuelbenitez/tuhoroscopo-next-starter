-- ============================================================
-- Fix de bug bloqueante en checkout de Tu Tirada.
--
-- CAUSA RAÍZ (demostrada en tarot_logs, funcion_origen=
-- ef_tarot_crear_orden, NO relacionada con los cambios recientes de
-- precio/UTM/Discovery Comercial — ver docs/product/DECISIONS.md
-- 2026-08-22):
--
-- 1. tarot_ordenes_tema_check permitía solo
--    ('general','amor','trabajo','salud','dinero') pero el checkout
--    (TarotCheckoutContent.tsx) y ef_tarot_crear_orden
--    (TEMAS_VALIDOS) siempre ofrecieron/aceptaron 'decision'
--    ("🔮 Decisión personal") — cualquier cliente real que elegía esa
--    opción no podía crear la orden. Confirmado con logs de
--    producción reales (2026-08-21) de clientes reales fallando acá.
--
-- 2. tarot_clientes.fecha_nacimiento era NOT NULL pero el checkout
--    la marca explícitamente como "(opcional — ayuda a
--    personalizar)" sin el atributo `required`. Cualquier cliente
--    que dejara el campo vacío no podía crear la orden. El resto del
--    pipeline (ef_tarot_generar_lectura vía interpolarTemplate(),
--    ef_tarot_generar_pdf) ya tolera fecha_nacimiento null — el
--    fix es puramente de constraint, sin cambios de código
--    downstream necesarios.
-- ============================================================

-- ── Fix 1: alinear el CHECK constraint con los valores que la
-- aplicación ya ofrece y acepta desde antes de este fix.
ALTER TABLE tarot_ordenes DROP CONSTRAINT IF EXISTS tarot_ordenes_tema_check;
ALTER TABLE tarot_ordenes ADD CONSTRAINT tarot_ordenes_tema_check
  CHECK (tema = ANY (ARRAY['general','amor','trabajo','salud','dinero','decision']));

-- ── Fix 2: alinear la nullability con lo que el checkout ya
-- comunica como opcional.
ALTER TABLE tarot_clientes ALTER COLUMN fecha_nacimiento DROP NOT NULL;
