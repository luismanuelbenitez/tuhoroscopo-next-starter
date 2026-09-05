-- ============================================================================
-- Bandeja de WhatsApp inbound para Tu Oráculo (Tarot) — sprint 2026-09-05.
--
-- Extiende (no reemplaza) la infraestructura de webhook ya existente
-- (ef_webhook_whatsapp_events / ef_webhook_whatsapp_inbound, tabla
-- wa_conversaciones compartida con Horóscopo). wa_conversaciones es en la
-- práctica una tabla de MENSAJES (una fila por inbound, sin agregado de
-- conversación ni no_leidos ni asociación a orden) — estas dos tablas nuevas
-- son el modelo relacional que necesita la bandeja del Admin,
-- exclusivamente para Tarot.
--
-- Identidad: telefono_normalizado es la clave natural de conversación (un
-- número de WhatsApp = una conversación). cliente_id/orden_id son nullable
-- a propósito — NUNCA se inventa una asociación (ver
-- docs/modules/whatsapp-inbox.md § Identidad).
-- ============================================================================

create table if not exists tarot_whatsapp_conversaciones (
  id                     uuid primary key default gen_random_uuid(),
  telefono_normalizado   text not null unique,
  cliente_id             uuid references tarot_clientes(id),
  orden_id               uuid references tarot_ordenes(id),
  wa_contact_name        text,
  estado                 text not null default 'abierta',
  no_leidos              integer not null default 0,
  ultimo_mensaje_at      timestamptz,
  ultimo_mensaje_preview text,
  ultimo_mensaje_direccion text check (ultimo_mensaje_direccion in ('inbound', 'outbound')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_tarot_wa_conv_ultimo_mensaje
  on tarot_whatsapp_conversaciones (ultimo_mensaje_at desc nulls last);
create index if not exists idx_tarot_wa_conv_cliente
  on tarot_whatsapp_conversaciones (cliente_id) where cliente_id is not null;
create index if not exists idx_tarot_wa_conv_orden
  on tarot_whatsapp_conversaciones (orden_id) where orden_id is not null;
create index if not exists idx_tarot_wa_conv_no_leidos
  on tarot_whatsapp_conversaciones (no_leidos) where no_leidos > 0;

alter table tarot_whatsapp_conversaciones enable row level security;
-- Sin policies: acceso exclusivo vía service_role (Edge Functions), igual
-- que tarot_clientes / tarot_ordenes / wa_conversaciones / whatsapp_webhook_events.

create table if not exists tarot_whatsapp_mensajes (
  id                   uuid primary key default gen_random_uuid(),
  conversacion_id      uuid not null references tarot_whatsapp_conversaciones(id) on delete cascade,
  whatsapp_message_id  text not null unique,
  direccion            text not null check (direccion in ('inbound', 'outbound')),
  tipo                 text not null check (tipo in (
                          'text', 'image', 'document', 'audio', 'video',
                          'sticker', 'location', 'contact', 'interactive', 'unknown'
                        )),
  texto                text,
  media_id             text,
  mime_type            text,
  filename             text,
  payload_meta         jsonb,
  timestamp_whatsapp   timestamptz,
  estado               text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_tarot_wa_msj_conversacion
  on tarot_whatsapp_mensajes (conversacion_id, timestamp_whatsapp);

alter table tarot_whatsapp_mensajes enable row level security;
-- Sin policies: acceso exclusivo vía service_role.

-- ============================================================================
-- Helpers atómicos — evitan condiciones de carrera en el contador no_leidos
-- cuando dos webhooks de Meta llegan casi simultáneos para el mismo número.
-- Ambos son SECURITY INVOKER (por defecto): se llaman siempre desde Edge
-- Functions con service_role, que ya bypasea RLS — no necesitan privilegios
-- elevados propios.
-- ============================================================================

-- Paso 1: obtiene (o crea) la conversación por teléfono, sin tocar no_leidos.
-- Los datos de asociación (cliente/orden/nombre) se sobrescriben de forma
-- idempotente en cada llamada — recalculados en cada mensaje, nunca fijados
-- una sola vez (si el cliente hace una orden nueva, la próxima asociación
-- refleja la orden más reciente).
create or replace function tarot_wa_obtener_o_crear_conversacion(
  p_telefono text,
  p_cliente_id uuid,
  p_orden_id uuid,
  p_wa_contact_name text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into tarot_whatsapp_conversaciones (telefono_normalizado, cliente_id, orden_id, wa_contact_name)
  values (p_telefono, p_cliente_id, p_orden_id, p_wa_contact_name)
  on conflict (telefono_normalizado) do update set
    cliente_id = coalesce(excluded.cliente_id, tarot_whatsapp_conversaciones.cliente_id),
    orden_id = coalesce(excluded.orden_id, tarot_whatsapp_conversaciones.orden_id),
    wa_contact_name = coalesce(excluded.wa_contact_name, tarot_whatsapp_conversaciones.wa_contact_name),
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Paso 2 (solo si el mensaje era genuinamente nuevo, ver dedup por
-- whatsapp_message_id en la tabla de mensajes): incrementa no_leidos y
-- actualiza el resumen — atómico, sin condición de carrera.
create or replace function tarot_wa_registrar_mensaje_inbound(
  p_conversacion_id uuid,
  p_timestamp timestamptz,
  p_preview text
) returns void
language sql
as $$
  update tarot_whatsapp_conversaciones
  set no_leidos = no_leidos + 1,
      ultimo_mensaje_at = coalesce(p_timestamp, now()),
      ultimo_mensaje_preview = p_preview,
      ultimo_mensaje_direccion = 'inbound',
      updated_at = now()
  where id = p_conversacion_id;
$$;

-- Actualiza el resumen tras un mensaje OUTBOUND (arquitectura preparada para
-- cuando exista respuesta desde el Admin — no incrementa no_leidos, el
-- admin ya sabe que respondió).
create or replace function tarot_wa_registrar_mensaje_outbound(
  p_conversacion_id uuid,
  p_timestamp timestamptz,
  p_preview text
) returns void
language sql
as $$
  update tarot_whatsapp_conversaciones
  set ultimo_mensaje_at = coalesce(p_timestamp, now()),
      ultimo_mensaje_preview = p_preview,
      ultimo_mensaje_direccion = 'outbound',
      updated_at = now()
  where id = p_conversacion_id;
$$;
