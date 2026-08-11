-- ============================================================
-- tarot_alertas_v1: Módulo simple de alertas operativas para Tu Tirada (TTC)
--
-- ARQUITECTURA:
--   Supabase = detección + reglas + envío de alertas (via Resend en _shared/tarot-alertas.ts)
--   Next.js  = configuración y visualización (/admin/tarot/alertas)
--
-- Las alertas se disparan desde las edge functions en los puntos canónicos
-- donde ya se conoce el éxito/error. NUNCA desde el frontend.
-- ============================================================

-- ── Tabla de configuración por tipo de alerta ─────────────────────────────────

CREATE TABLE IF NOT EXISTS tarot_alertas_config (
  tipo              TEXT        PRIMARY KEY,
  activa            BOOLEAN     NOT NULL DEFAULT true,
  usa_email_general BOOLEAN     NOT NULL DEFAULT true,
  email_particular  TEXT,
  descripcion       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6 alertas V1
INSERT INTO tarot_alertas_config (tipo, activa, descripcion) VALUES
  ('nueva_venta',         true, 'Pago aprobado de una nueva orden Tarot'),
  ('error_generacion',    true, 'Una lectura no pudo generarse'),
  ('error_pdf',           true, 'Falló la generación del PDF'),
  ('error_whatsapp',      true, 'Falló la entrega por WhatsApp'),
  ('error_email_cliente', true, 'Falló el envío por email al cliente'),
  ('orden_trabada',       true, 'Una orden pagada sin avanzar al estado final (trigger: pendiente)')
ON CONFLICT (tipo) DO NOTHING;

-- RLS: solo service role tiene acceso; el admin usa API routes server-side
ALTER TABLE tarot_alertas_config ENABLE ROW LEVEL SECURITY;

-- ── Config global en tarot_configuracion ──────────────────────────────────────

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES
  ('TTC_ALERTAS_EMAIL_GENERAL',   'mbenitezmdeo@gmail.com', 'string', 'Email general para alertas operativas de Tu Tirada', false, true),
  ('TTC_ALERTAS_TIMEOUT_MINUTOS', '30',                     'number', 'Minutos antes de considerar una orden Tarot como trabada', false, true)
ON CONFLICT DO NOTHING;
