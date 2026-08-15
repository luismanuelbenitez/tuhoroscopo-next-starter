-- ============================================================
-- tarot_entregas_v1: Gobernanza de entregas (WhatsApp + Email)
--
-- ARQUITECTURA:
--   Regenerar un artefacto (PDF) y entregarlo son operaciones
--   independientes. Una entrega exitosa previa solo puede
--   reenviarse mediante autorización administrativa explícita,
--   de un solo uso, trazada por orden + canal.
--
--   La decisión de permitir/bloquear un envío vive en backend
--   (Edge Functions vía _shared/tarot-entregas.ts). Esta
--   migración solo agrega la persistencia mínima faltante:
--     1. tarot_envios_email — no existía ninguna tabla estructurada
--        para email (solo tarot_logs, sin idempotencia posible).
--     2. tarot_solicitudes_reenvio — no existía ninguna entidad
--        que representara autorización administrativa de reenvío.
--     3. es_reenvio / solicitud_reenvio_id en ambas tablas de envío,
--        para poder distinguir "Original" vs "Reenvío" en el admin.
-- ============================================================

-- ── 1. tarot_envios_email (nueva — mismo espejo que tarot_envios_whatsapp) ────

CREATE TABLE tarot_envios_email (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id              uuid NOT NULL REFERENCES tarot_ordenes(id) ON DELETE RESTRICT,
  pdf_id                uuid REFERENCES tarot_pdfs(id) ON DELETE RESTRICT,
  estado                text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','enviando','enviado','error')),
  numero_intento        smallint NOT NULL DEFAULT 1,
  email_destino         text NOT NULL,
  proveedor_email       text NOT NULL DEFAULT 'resend',
  proveedor_message_id  text,
  error_codigo          text,
  error_mensaje         text,
  respuesta_raw         jsonb,
  es_reenvio            boolean NOT NULL DEFAULT false,
  solicitud_reenvio_id  uuid,
  enviado_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tarot_envios_email_orden_estado ON tarot_envios_email(orden_id, estado);

ALTER TABLE tarot_envios_email ENABLE ROW LEVEL SECURITY;
-- Sin políticas públicas — las Edge Functions operan con service_role (bypass RLS).

-- ── 2. tarot_solicitudes_reenvio (nueva) ───────────────────────────────────────

CREATE TABLE tarot_solicitudes_reenvio (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        uuid NOT NULL REFERENCES tarot_ordenes(id) ON DELETE RESTRICT,
  canal           text NOT NULL CHECK (canal IN ('whatsapp','email')),
  motivo          text NOT NULL
                  CHECK (motivo IN (
                    'cliente_no_recibio','direccion_corregida',
                    'solicitud_cliente','prueba_administrativa','otro'
                  )),
  motivo_detalle  text,
  estado          text NOT NULL DEFAULT 'pendiente_autorizacion'
                  CHECK (estado IN ('pendiente_autorizacion','autorizada','ejecutada','rechazada')),
  solicitado_por  text NOT NULL,
  solicitado_at   timestamptz NOT NULL DEFAULT now(),
  autorizado_por  text,
  autorizado_at   timestamptz,
  ejecutado_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tarot_solicitudes_reenvio_orden ON tarot_solicitudes_reenvio(orden_id, canal);
CREATE INDEX idx_tarot_solicitudes_reenvio_estado ON tarot_solicitudes_reenvio(estado, created_at DESC);

-- Solo una solicitud pendiente por orden+canal a la vez.
CREATE UNIQUE INDEX idx_tarot_solicitudes_reenvio_pendiente_unica
  ON tarot_solicitudes_reenvio(orden_id, canal)
  WHERE estado = 'pendiente_autorizacion';

ALTER TABLE tarot_solicitudes_reenvio ENABLE ROW LEVEL SECURITY;

-- ── 3. Columnas de trazabilidad de reenvío en tablas de envío existentes ──────

ALTER TABLE tarot_envios_whatsapp
  ADD COLUMN es_reenvio           boolean NOT NULL DEFAULT false,
  ADD COLUMN solicitud_reenvio_id uuid;

ALTER TABLE tarot_envios_email
  ADD CONSTRAINT tarot_envios_email_solicitud_fk
  FOREIGN KEY (solicitud_reenvio_id) REFERENCES tarot_solicitudes_reenvio(id);

ALTER TABLE tarot_envios_whatsapp
  ADD CONSTRAINT tarot_envios_whatsapp_solicitud_fk
  FOREIGN KEY (solicitud_reenvio_id) REFERENCES tarot_solicitudes_reenvio(id);

-- ── 4. Nuevo tipo de alerta operativa (reutiliza dispararAlerta() existente) ──

INSERT INTO tarot_alertas_config (tipo, activa, descripcion) VALUES
  ('reenvio_pendiente_autorizacion', true, 'Un administrador solicitó reenviar una entrega ya exitosa — requiere autorización')
ON CONFLICT (tipo) DO NOTHING;
