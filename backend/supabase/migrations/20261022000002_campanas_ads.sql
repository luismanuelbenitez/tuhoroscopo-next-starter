-- Campañas de anuncios (2026-10-22)
--
-- Registro de campañas pagas creado desde el Admin. Cada campaña tiene un
-- identificador fijo (utm_campaign) que el Admin entrega ya armado dentro de
-- los "Parámetros de URL" para Meta. Ese mismo identificador une:
--   anuncio → funnel_sessions.utm_campaign → tarot_ordenes (funnel_session_id)
--           → campaign_costs.utm_campaign (gasto cargado)
-- Migración aditiva e idempotente: no modifica ni borra datos existentes.

create table if not exists ads_campanas (
  id uuid primary key default gen_random_uuid(),
  utm_campaign text not null unique check (utm_campaign ~ '^[a-z0-9][a-z0-9_-]{1,59}$'),
  nombre text not null,
  plataforma text not null default 'meta',
  objetivo text,
  destino_path text not null default '/tarot' check (destino_path like '/%'),
  presupuesto numeric check (presupuesto is null or presupuesto >= 0),
  moneda text not null default 'USD',
  fecha_inicio date,
  fecha_fin date,
  estado text not null default 'borrador' check (estado in ('borrador','activa','pausada','finalizada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ads_campanas enable row level security;
create index if not exists idx_campaign_costs_utm_campaign on campaign_costs (utm_campaign);

-- Resumen de todas las campañas registradas + campañas detectadas sin registrar.
-- Las visitas internas (?interno=1 / admin) se cuentan aparte como "pruebas":
-- sirven para confirmar que el enganche funciona sin ensuciar los números.
create or replace function ads_campanas_resumen()
returns jsonb
language sql stable as $$
  with b as (
    select * from visitantes_sesiones_base('-infinity'::timestamptz, 'infinity'::timestamptz, true, null, null, null, null)
    where utm_campaign is not null
  ),
  vis as (
    select utm_campaign,
           count(*) filter (where not es_interno) as sesiones,
           count(*) filter (where es_interno) as pruebas,
           count(*) filter (where not es_interno and vio_producto) as vieron_producto,
           count(*) filter (where not es_interno and checkout) as checkout,
           count(*) filter (where not es_interno and compro) as compras,
           coalesce(sum(orden_monto) filter (where not es_interno and compro), 0) as ingresos_uyu,
           min(started_at) filter (where not es_interno) as primera_visita,
           max(started_at) filter (where not es_interno) as ultima_visita,
           max(started_at) filter (where es_interno) as ultima_prueba,
           string_agg(distinct utm_content, ', ') filter (where not es_interno and utm_content is not null) as anuncios
    from b group by utm_campaign
  ),
  gas as (
    select utm_campaign, sum(amount) as gasto, max(currency) as moneda_gasto, max(date) as ultimo_gasto,
           sum(impressions) as impresiones, sum(clicks) as clics
    from campaign_costs where utm_campaign is not null group by utm_campaign
  )
  select jsonb_build_object(
    'campanas', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
      select c.*, coalesce(v.sesiones, 0) as sesiones, coalesce(v.pruebas, 0) as pruebas,
             coalesce(v.vieron_producto, 0) as vieron_producto, coalesce(v.checkout, 0) as checkout,
             coalesce(v.compras, 0) as compras, coalesce(v.ingresos_uyu, 0) as ingresos_uyu,
             v.primera_visita, v.ultima_visita, v.ultima_prueba, v.anuncios,
             g.gasto, g.moneda_gasto, g.ultimo_gasto, g.impresiones, g.clics,
             case when g.gasto is not null and coalesce(v.compras, 0) > 0 then round(g.gasto / v.compras, 2) end as costo_por_compra
      from ads_campanas c
      left join vis v on v.utm_campaign = c.utm_campaign
      left join gas g on g.utm_campaign = c.utm_campaign
    ) x),
    'sin_registrar', (select coalesce(jsonb_agg(y order by y.sesiones desc), '[]'::jsonb) from (
      select coalesce(v.utm_campaign, g.utm_campaign) as utm_campaign,
             coalesce(v.sesiones, 0) as sesiones, coalesce(v.compras, 0) as compras, g.gasto
      from vis v full join gas g on g.utm_campaign = v.utm_campaign
      where coalesce(v.utm_campaign, g.utm_campaign) not in (select utm_campaign from ads_campanas)
        and (coalesce(v.sesiones, 0) > 0 or g.gasto is not null)
    ) y)
  );
$$;

revoke execute on function ads_campanas_resumen() from public, anon, authenticated;
grant execute on function ads_campanas_resumen() to service_role;
