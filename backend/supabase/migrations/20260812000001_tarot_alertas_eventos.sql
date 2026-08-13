-- ============================================================
-- tarot_alertas_eventos: Eventos operativos persistentes para Tu Tirada (TTC)
--
-- ARQUITECTURA:
--   Cada llamada a dispararAlerta() en _shared/tarot-alertas.ts
--   registra un evento aquí SIEMPRE, independientemente del canal email.
--   El canal email es opcional y se controla via tarot_alertas_config.
--
--   Una alerta operativa es un evento del backend.
--   Email y Admin son canales de presentación del mismo evento.
--   La fuente canónica es dispararAlerta(). NUNCA crear eventos
--   directamente desde Next.js, React o APIs de presentación.
-- ============================================================

CREATE TABLE IF NOT EXISTS tarot_alertas_eventos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_alerta TEXT        NOT NULL,
  severidad   TEXT        NOT NULL CHECK (severidad IN ('success', 'warning', 'error')),
  titulo      TEXT        NOT NULL,
  mensaje     TEXT        NOT NULL,
  orden_id    UUID,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  creada_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leida_at    TIMESTAMPTZ
);

-- Índice principal para listado ordenado por fecha
CREATE INDEX IF NOT EXISTS idx_ttc_alertas_eventos_creada
  ON tarot_alertas_eventos (creada_at DESC);

-- Índice para badge de no-leídas (query frecuente, ~30s polling)
CREATE INDEX IF NOT EXISTS idx_ttc_alertas_eventos_no_leidas
  ON tarot_alertas_eventos (leida_at)
  WHERE leida_at IS NULL;

-- Índice para búsquedas por orden
CREATE INDEX IF NOT EXISTS idx_ttc_alertas_eventos_orden
  ON tarot_alertas_eventos (orden_id)
  WHERE orden_id IS NOT NULL;

-- Idempotencia: una sola alerta de nueva_venta por orden
-- Evita registros duplicados ante reintentos del webhook de Mercado Pago
CREATE UNIQUE INDEX IF NOT EXISTS idx_ttc_alertas_nueva_venta_unica
  ON tarot_alertas_eventos (orden_id, tipo_alerta)
  WHERE tipo_alerta = 'nueva_venta' AND orden_id IS NOT NULL;

-- RLS: solo service role tiene acceso directo
-- El admin usa únicamente API routes server-side autenticadas
ALTER TABLE tarot_alertas_eventos ENABLE ROW LEVEL SECURITY;
