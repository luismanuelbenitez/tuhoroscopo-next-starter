-- ============================================================
-- Nueva alerta operativa: pago_monto_incoherente.
--
-- ef_tarot_webhook_mp ahora compara transaction_amount (Mercado
-- Pago) contra tarot_ordenes.precio_cobrado antes de disparar el
-- pipeline post-cobro. Si no coinciden, además de registrar el log
-- crítico y bloquear el pipeline, dispara esta alerta (reutilizando
-- dispararAlerta() ya existente en _shared/tarot-alertas.ts).
--
-- Sin esta fila, el evento igual queda persistido en
-- tarot_alertas_eventos (visible en el admin) — esta fila solo
-- habilita la notificación por email, igual que el resto de tipos.
-- Ver docs/product/DECISIONS.md (2026-08-18).
-- ============================================================

INSERT INTO tarot_alertas_config (tipo, activa, descripcion) VALUES
  ('pago_monto_incoherente', true, 'El monto aprobado por Mercado Pago no coincide con el precio_cobrado de la orden — pipeline detenido, requiere revisión manual')
ON CONFLICT (tipo) DO NOTHING;
