-- ============================================================================
-- Bandeja de WhatsApp P0 (2026-10-21) — ingesta independiente de cliente/orden.
--
-- Contexto (auditoría 2026-10-21): la bandeja solo se poblaba si el número
-- existía en tarot_clientes, y las reacciones nunca se guardaban porque
-- 'reaction' no estaba en el CHECK de tipo (error 23514). Desde ahora la
-- escritura la hace ef_tarot_wa_ingesta para CUALQUIER número; cliente_id y
-- orden_id siguen siendo enriquecimiento opcional (ya eran nullable).
--
-- Aplicar con: supabase db query --linked -f <este archivo>  (NUNCA db push).
-- Idempotente: se puede correr más de una vez.
-- ============================================================================

-- 1) Tipos: + reaction (reacciones y "quitó la reacción") + button (respuesta
--    a botón de respuesta rápida de una plantilla).
alter table tarot_whatsapp_mensajes drop constraint if exists tarot_whatsapp_mensajes_tipo_check;
alter table tarot_whatsapp_mensajes add constraint tarot_whatsapp_mensajes_tipo_check check (tipo in (
  'text', 'image', 'document', 'audio', 'video', 'sticker', 'location',
  'contact', 'interactive', 'button', 'reaction', 'unknown'
));

-- 2) Columnas nuevas de mensajes.
--    origen:         quién originó el mensaje (cliente | manual | automatico |
--                    plantilla | entrega | campana). Null en filas previas.
--    contexto_wamid: wamid del mensaje al que responde (cita / "reply").
--    leido_at:       inbound — cuándo el admin lo leyó (abrir la conversación).
alter table tarot_whatsapp_mensajes
  add column if not exists origen text,
  add column if not exists contexto_wamid text,
  add column if not exists leido_at timestamptz;

alter table tarot_whatsapp_mensajes drop constraint if exists tarot_whatsapp_mensajes_origen_check;
alter table tarot_whatsapp_mensajes add constraint tarot_whatsapp_mensajes_origen_check check (
  origen is null or origen in ('cliente', 'manual', 'automatico', 'plantilla', 'entrega', 'campana')
);

-- Reacciones por mensaje objetivo (detalle de la conversación).
create index if not exists idx_tarot_wa_msj_reaccion_objetivo
  on tarot_whatsapp_mensajes ((payload_meta->>'message_id'))
  where tipo = 'reaction';

-- Inbound pendientes de leer (marcar leído al abrir).
create index if not exists idx_tarot_wa_msj_no_leidos
  on tarot_whatsapp_mensajes (conversacion_id)
  where direccion = 'inbound' and leido_at is null;

-- 3) Conversación: última respuesta automática (tope 1 cada 24 h).
alter table tarot_whatsapp_conversaciones
  add column if not exists auto_respuesta_at timestamptz;

-- 4) Reclamo ATÓMICO de la respuesta automática. Devuelve true solo si esta
--    llamada se quedó con el derecho a responder: sin auto-respuesta en las
--    últimas 24 h y sin respuesta MANUAL del admin en las últimas 24 h (si el
--    admin ya está conversando, un "te respondemos por acá" sería absurdo).
--    Dos webhooks simultáneos no pueden ganar los dos: el UPDATE serializa.
create or replace function tarot_wa_reclamar_auto_respuesta(p_conversacion_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  update tarot_whatsapp_conversaciones c
  set auto_respuesta_at = now(), updated_at = now()
  where c.id = p_conversacion_id
    and (c.auto_respuesta_at is null or c.auto_respuesta_at < now() - interval '24 hours')
    and not exists (
      select 1 from tarot_whatsapp_mensajes m
      where m.conversacion_id = c.id
        and m.direccion = 'outbound'
        and m.origen = 'manual'
        and m.estado in ('enviado', 'entregado', 'leido', 'simulado')
        and coalesce(m.enviado_at, m.created_at) > now() - interval '24 hours'
    )
  returning c.id into v_id;
  return v_id is not null;
end;
$$;
