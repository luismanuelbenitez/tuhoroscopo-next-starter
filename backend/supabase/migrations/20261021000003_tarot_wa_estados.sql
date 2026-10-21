-- ============================================================================
-- Estados de mensajes salientes de la bandeja (2026-10-21) — sin retrocesos
-- y sin avisos perdidos.
--
-- Problema visto en producción: Meta puede mandar sent/delivered/read
-- (1) desordenados y (2) ANTES de que la función que envió el mensaje
-- termine de guardar su wamid. Con (1) un "delivered" tardío pisaba un
-- "read"; con (2) los avisos no encontraban el mensaje y se perdían (la
-- auto-respuesta quedó "enviado" aunque ya estaba leída).
--
-- Solución:
--   - tarot_wa_aplicar_status: único punto donde un aviso de Meta cambia el
--     estado de un saliente; solo AVANZA (preparando < enviado < entregado <
--     leido); "error" solo sobre preparando/enviado. Atómico (un UPDATE).
--   - tarot_wa_reconciliar_status: al guardar el wamid de un envío, aplica
--     los avisos que ya hubieran llegado (están en whatsapp_webhook_events).
--   - Backfill de los salientes existentes.
-- Solo tarot_whatsapp_mensajes (bandeja). tarot_envios_whatsapp no cambia.
--
-- Aplicar con: supabase db query --linked -f <este archivo>  (NUNCA db push).
-- Idempotente.
-- ============================================================================

create or replace function tarot_wa_rango_estado(p_estado text)
returns integer
language sql
immutable
as $$
  select case p_estado
    when 'preparando' then 0
    when 'enviado' then 1
    when 'entregado' then 2
    when 'leido' then 3
    else null
  end;
$$;

-- p_status en vocabulario de Meta: sent | delivered | read | failed.
-- Devuelve cuántas filas cambió (0 = sin match o el aviso no hacía avanzar).
create or replace function tarot_wa_aplicar_status(
  p_wamid text,
  p_status text,
  p_error_code text default null,
  p_error_detalle text default null
) returns integer
language plpgsql
as $$
declare
  v_estado text := case p_status
    when 'sent' then 'enviado'
    when 'delivered' then 'entregado'
    when 'read' then 'leido'
    when 'failed' then 'error'
    else null
  end;
  v_n integer;
begin
  if p_wamid is null or v_estado is null then
    return 0;
  end if;

  if v_estado = 'error' then
    update tarot_whatsapp_mensajes
    set estado = 'error', error_code = p_error_code, error_detalle = p_error_detalle
    where whatsapp_message_id = p_wamid
      and direccion = 'outbound'
      and estado in ('preparando', 'enviado');
  else
    update tarot_whatsapp_mensajes
    set estado = v_estado
    where whatsapp_message_id = p_wamid
      and direccion = 'outbound'
      and tarot_wa_rango_estado(estado) is not null          -- nunca toca error/simulado
      and tarot_wa_rango_estado(v_estado) > tarot_wa_rango_estado(estado);
  end if;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Aplica, en orden, los avisos de Meta ya recibidos para el wamid de un
-- mensaje saliente. Llamar después de guardar el wamid del envío.
create or replace function tarot_wa_reconciliar_status(p_mensaje_id uuid)
returns integer
language plpgsql
as $$
declare
  v_wamid text;
  v_ev record;
  v_total integer := 0;
begin
  select whatsapp_message_id into v_wamid
  from tarot_whatsapp_mensajes
  where id = p_mensaje_id and direccion = 'outbound';
  if v_wamid is null then
    return 0;
  end if;

  for v_ev in
    select status,
           payload #>> '{entry,0,changes,0,value,statuses,0,errors,0,code}' as error_code,
           left(payload #>> '{entry,0,changes,0,value,statuses,0,errors,0,title}', 200) as error_detalle
    from whatsapp_webhook_events
    where es_evento_status and wamid = v_wamid
    order by id
  loop
    v_total := v_total + tarot_wa_aplicar_status(v_wamid, v_ev.status, v_ev.error_code, v_ev.error_detalle);
  end loop;
  return v_total;
end;
$$;

create index if not exists idx_whatsapp_webhook_events_wamid_status
  on whatsapp_webhook_events (wamid)
  where es_evento_status;

-- Backfill: salientes ya existentes con wamid (p. ej. la auto-respuesta del
-- smoke del 2026-10-21, que quedó "enviado" siendo leída).
select tarot_wa_reconciliar_status(id)
from tarot_whatsapp_mensajes
where direccion = 'outbound' and whatsapp_message_id is not null;
