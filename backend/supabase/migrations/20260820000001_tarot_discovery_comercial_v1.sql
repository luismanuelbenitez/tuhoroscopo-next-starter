-- ============================================================
-- Discovery comercial V1 — Tu Tirada: unit economics + panel de
-- adquisición. Ver docs/product/DECISIONS.md (2026-08-20).
--
-- Reutiliza estructura existente en vez de crear una segunda fuente
-- de verdad:
--   - campaign_costs ya existía (vacía, sin migración local, nunca
--     usada en código) — se extiende con las columnas mínimas que
--     faltaban para registrar gasto de Meta Ads.
--   - tarot_configuracion ya es la fuente EAV de config operativa —
--     se agrega una sola clave nueva (tipo de cambio), no una tabla.
--   - discovery_experimentos es la única tabla genuinamente nueva:
--     no existía nada equivalente para modelar "un experimento con
--     presupuesto y fecha de inicio", y sobrecargar tarot_configuracion
--     con esto perdería el historial de experimentos futuros
--     (Experimento 02, 03...).
-- ============================================================

-- ── campaign_costs: agregar columnas mínimas para Meta Ads ────
ALTER TABLE campaign_costs
  ADD COLUMN IF NOT EXISTS platform    TEXT NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS impressions INTEGER,
  ADD COLUMN IF NOT EXISTS clicks      INTEGER;

COMMENT ON TABLE campaign_costs IS
  'Registro manual de gasto publicitario por fecha/campaña. Carga manual V1 (sin integración con Meta Marketing API) — ver docs/product/DECISIONS.md 2026-08-20.';

-- ── tarot_configuracion: tipo de cambio USD/UYU ────────────────
-- Sin valor por defecto inventado: queda vacío hasta que el admin lo
-- cargue explícitamente desde /admin/tarot/adquisicion. Mientras esté
-- vacío o no sea numérico, el panel muestra ROAS como "No disponible"
-- en vez de calcular con un tipo de cambio ficticio.
INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tipo_cambio_usd_uyu',
  '',
  'number',
  'Tipo de cambio USD→UYU usado para calcular ROAS en el panel de Adquisición. Cargar manualmente — no se actualiza solo.',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;

-- ── discovery_experimentos: mínima persistencia para administrar
-- presupuestos de descubrimiento comercial por etapas, sin
-- sobrearquitectura (sin checkpoints hardcodeados en lógica de
-- negocio — el % consumido es continuo, la disciplina de checkpoints
-- es de gestión, no de código).
CREATE TABLE IF NOT EXISTS discovery_experimentos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT        NOT NULL,
  hipotesis     TEXT,
  presupuesto   NUMERIC     NOT NULL,
  moneda        TEXT        NOT NULL DEFAULT 'USD',
  fecha_inicio  DATE,
  fecha_fin     DATE,
  activo        BOOLEAN     NOT NULL DEFAULT true,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE discovery_experimentos IS
  'Experimentos de descubrimiento comercial (presupuesto + hipótesis + fecha). Uno activo a la vez en V1. Ver docs/product/DECISIONS.md 2026-08-20.';

INSERT INTO discovery_experimentos (nombre, hipotesis, presupuesto, moneda, activo, notas)
SELECT
  'Experimento 01',
  'Personas que no conocen Tu Oráculo están dispuestas a pagar $U 690 por Tu Tirada.',
  200,
  'USD',
  true,
  'Precio V1 congelado en $U 690 durante este experimento. Canal inicial: Meta Ads. Objetivo: evidencia de CAC y viabilidad, no ROAS óptimo ni escala. fecha_inicio se carga manualmente cuando arranquen los anuncios.'
WHERE NOT EXISTS (SELECT 1 FROM discovery_experimentos);
