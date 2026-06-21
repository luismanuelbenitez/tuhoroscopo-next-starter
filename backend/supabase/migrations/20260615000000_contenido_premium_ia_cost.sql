-- ============================================================================
-- Migration: contenido_premium — columnas de costo IA
-- Aplicada: 2026-06-15
-- ============================================================================
-- Agrega trazabilidad de consumo de OpenAI por contenido generado.
-- Permite monitorear costo real por suscriptor/día desde el panel admin.

ALTER TABLE contenido_premium
  ADD COLUMN IF NOT EXISTS tokens_input  integer,
  ADD COLUMN IF NOT EXISTS tokens_output integer,
  ADD COLUMN IF NOT EXISTS costo_estimado numeric(10,6),
  ADD COLUMN IF NOT EXISTS modelo_ia     text;

COMMENT ON COLUMN contenido_premium.tokens_input   IS 'Tokens de entrada (prompt) consumidos por OpenAI';
COMMENT ON COLUMN contenido_premium.tokens_output  IS 'Tokens de salida (completion) consumidos por OpenAI';
COMMENT ON COLUMN contenido_premium.costo_estimado IS 'Costo estimado en USD calculado con precios por millón de tokens';
COMMENT ON COLUMN contenido_premium.modelo_ia      IS 'Modelo de OpenAI utilizado para generar este contenido';
