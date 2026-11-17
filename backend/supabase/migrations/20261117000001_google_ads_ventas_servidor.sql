-- Ventas de Google Ads avisadas desde el servidor (2026-11-17, Manuel:
-- "cuando MP confirma el pago, si viene de Google, hay que avisarle").
--
-- Hasta ahora la compra se le avisaba a Google solo desde el navegador, en
-- /tarot/estado: si la compradora no volvía de Mercado Pago, Google no se
-- enteraba (15/11: 3 ventas reales de Google, 1 registrada).
--
-- 1. google_ads_clics: el identificador del clic del anuncio (gclid; en
--    iPhone gbraid/wbraid) por sesión de la web. Lo manda el navegador junto
--    con los eventos (lib/analytics.ts). No es un dato personal: es el código
--    que Google pone en la URL del anuncio.
-- 2. google_ads_ventas_enviadas: una fila por orden avisada (o intentada), para
--    no mandarla dos veces y ver qué pasó.
-- 3. google_ads_ventas_por_enviar(): ventas aprobadas por MP de los últimos
--    60 días cuya sesión trae clic de Google y que todavía no se avisaron.
--
-- Solo el servidor (clave secreta) lee y escribe: RLS activo y sin políticas.

create table if not exists google_ads_clics (
  session_id   text primary key,
  gclid        text,
  gbraid       text,
  wbraid       text,
  clic_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint google_ads_clics_alguno check (gclid is not null or gbraid is not null or wbraid is not null)
);
alter table google_ads_clics enable row level security;

create table if not exists google_ads_ventas_enviadas (
  orden_id     uuid primary key references tarot_ordenes(id) on delete cascade,
  session_id   text,
  estado       text not null check (estado in ('enviada', 'error')),
  valor        numeric,
  moneda       text,
  venta_at     timestamptz,
  request_id   text,
  detalle      text,
  intentos     integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table google_ads_ventas_enviadas enable row level security;

create or replace function google_ads_ventas_por_enviar()
returns table (
  orden_id uuid, session_id text, gclid text, gbraid text, wbraid text,
  valor numeric, moneda text, venta_at timestamptz, intentos integer
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (o.id)
         o.id, o.funnel_session_id, c.gclid, c.gbraid, c.wbraid,
         coalesce(nullif(p.monto, 0), o.precio_cobrado), coalesce(p.moneda, o.moneda, 'UYU'),
         coalesce(p.webhook_received_at, p.updated_at), coalesce(e.intentos, 0)
    from tarot_pagos p
    join tarot_ordenes o on o.id = p.orden_id
    join google_ads_clics c on c.session_id = o.funnel_session_id
    left join google_ads_ventas_enviadas e on e.orden_id = o.id
   where p.mp_status = 'approved'
     and coalesce(p.cobro_manual, false) = false
     and coalesce(nullif(p.monto, 0), o.precio_cobrado) > 0
     and coalesce(p.webhook_received_at, p.updated_at) > now() - interval '60 days'
     and (e.orden_id is null or (e.estado = 'error' and e.intentos < 5))
   order by o.id, coalesce(p.webhook_received_at, p.updated_at);
$$;

revoke all on function google_ads_ventas_por_enviar() from public, anon, authenticated;
grant execute on function google_ads_ventas_por_enviar() to service_role;
