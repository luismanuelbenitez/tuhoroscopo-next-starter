-- ============================================================================
-- Bandeja de WhatsApp — P0-c + P1 (2026-10-21)
--   1) Media persistente: bucket privado wa-media + columnas de estado.
--      Meta conserva la media entrante solo 7 días; se copia al recibirla.
--   2) Alerta "WhatsApp sin responder" (tipo wa_sin_responder).
--   3) Plantilla de reapertura (fuera de la ventana de 24 h): config.
-- El cron de tareas va aparte (20261021000005) para no programarlo en QA.
-- Aplicar con: supabase db query --linked -f <este archivo> (NUNCA db push).
-- Idempotente.
-- ============================================================================

-- 1) Media ---------------------------------------------------------------
alter table tarot_whatsapp_mensajes
  add column if not exists media_ruta text,
  add column if not exists media_sha256 text,
  add column if not exists media_bytes integer,
  add column if not exists media_estado text,
  add column if not exists media_intentos integer not null default 0;

alter table tarot_whatsapp_mensajes drop constraint if exists tarot_whatsapp_mensajes_media_estado_check;
alter table tarot_whatsapp_mensajes add constraint tarot_whatsapp_mensajes_media_estado_check check (
  media_estado is null or media_estado in ('pendiente', 'guardada', 'bloqueada', 'vencida', 'error')
);

-- Media ya recibida (inbound con media_id) que todavía no se copió.
update tarot_whatsapp_mensajes
set media_estado = 'pendiente'
where direccion = 'inbound' and media_id is not null and media_estado is null;

create index if not exists idx_tarot_wa_msj_media_pendiente
  on tarot_whatsapp_mensajes (created_at)
  where media_estado in ('pendiente', 'error');

-- Bucket PRIVADO: sin políticas de acceso → solo service_role (Edge
-- Functions). El Admin lo ve únicamente por el proxy protegido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wa-media', 'wa-media', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
  'video/mp4', 'video/3gpp',
  'application/pdf', 'text/plain', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Alerta "sin responder" ---------------------------------------------
alter table tarot_whatsapp_conversaciones
  add column if not exists alerta_sin_respuesta_at timestamptz;

insert into tarot_alertas_config (tipo, activa, usa_email_general, descripcion)
values ('wa_sin_responder', true, true, 'Un mensaje de WhatsApp lleva más de 30 min sin respuesta manual (revisión cada 15 min)')
on conflict (tipo) do nothing;

insert into tarot_configuracion (clave, valor) values ('whatsapp_alerta_sin_respuesta_min', '30')
on conflict (clave) do nothing;

-- Conversaciones cuyo último mensaje REAL del contacto (no reacciones) es
-- posterior a la última respuesta humana (manual o plantilla de reapertura;
-- la auto-respuesta NO cuenta como atendido), que lleva más de p_minutos
-- esperando, de los últimos 3 días, y por la que todavía no se avisó.
create or replace function tarot_wa_conversaciones_sin_respuesta(p_minutos integer)
returns table (conversacion_id uuid, telefono text, nombre text, ultimo_inbound_at timestamptz, preview text)
language sql
stable
as $$
  with ult as (
    select c.id, c.telefono_normalizado, c.wa_contact_name, c.cliente_id, c.alerta_sin_respuesta_at,
      (select max(m.timestamp_whatsapp) from tarot_whatsapp_mensajes m
        where m.conversacion_id = c.id and m.direccion = 'inbound' and m.tipo <> 'reaction') as in_at,
      (select max(coalesce(m.enviado_at, m.created_at)) from tarot_whatsapp_mensajes m
        where m.conversacion_id = c.id and m.direccion = 'outbound' and m.origen in ('manual', 'plantilla')
          and m.estado in ('enviado', 'entregado', 'leido', 'simulado')) as out_at
    from tarot_whatsapp_conversaciones c
  )
  select u.id, u.telefono_normalizado,
         coalesce(cl.nombre_completo, u.wa_contact_name),
         u.in_at,
         (select left(coalesce(m.texto, '[' || m.tipo || ']'), 140) from tarot_whatsapp_mensajes m
           where m.conversacion_id = u.id and m.direccion = 'inbound' and m.tipo <> 'reaction'
           order by m.timestamp_whatsapp desc limit 1)
  from ult u
  left join tarot_clientes cl on cl.id = u.cliente_id
  where u.in_at is not null
    and u.in_at < now() - make_interval(mins => p_minutos)
    and u.in_at > now() - interval '3 days'
    and (u.out_at is null or u.out_at < u.in_at)
    and (u.alerta_sin_respuesta_at is null or u.alerta_sin_respuesta_at < u.in_at);
$$;

-- 3) Plantilla de reapertura --------------------------------------------
insert into tarot_configuracion (clave, valor) values
  ('whatsapp_template_reapertura_nombre', 'seguimiento_consulta_v1'),
  ('whatsapp_template_reapertura_idioma', 'es')
on conflict (clave) do nothing;
