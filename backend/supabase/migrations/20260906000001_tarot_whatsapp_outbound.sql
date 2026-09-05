-- ============================================================================
-- Responder WhatsApp desde Admin (sprint 2026-09-06) — columnas mínimas para
-- soportar outbound real en tarot_whatsapp_mensajes. NO se crea tabla nueva
-- (ya alcanzaba con extender la existente, ver docs/modules/whatsapp-inbox.md).
--
-- whatsapp_message_id pasa a ser nullable: un intento de outbound se
-- persiste como 'preparando' ANTES de llamar a la Cloud API (mismo patrón
-- que tarot_envios_whatsapp/tarot_envios_email — insertar antes de llamar
-- al proveedor, actualizar después) — en ese momento todavía no existe el
-- id real que asigna Meta. UNIQUE sobre una columna nullable admite
-- múltiples NULL sin conflicto (semántica estándar de Postgres).
-- ============================================================================

alter table tarot_whatsapp_mensajes
  alter column whatsapp_message_id drop not null,
  add column if not exists enviado_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_detalle text;

comment on column tarot_whatsapp_mensajes.estado is
  'inbound: siempre null. outbound: preparando | enviado | entregado | leido | error | simulado (sandbox, nunca es un envío real — ver ef_tarot_admin_whatsapp).';
