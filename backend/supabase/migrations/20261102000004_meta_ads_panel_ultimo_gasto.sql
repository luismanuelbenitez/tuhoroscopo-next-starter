-- Meta Ads (2026-11-02): el panel informa, por ubicación, el último día con
-- gasto. Así el aviso de Audience Network solo salta si hubo gasto reciente
-- (no por gasto viejo del período cuando ya se sacó la ubicación).
-- Solo reemplaza la función de lectura meta_ads_panel; no toca datos.
create or replace function meta_ads_panel(p_dias int default 14)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with rango as (select (now() at time zone 'America/Montevideo')::date - (p_dias - 1) as desde),
  utms as (select distinct utm_campaign from meta_ads_objetos where utm_campaign is not null),
  propias as (
    select (started_at at time zone 'America/Montevideo')::date as fecha,
           count(*) as visitas, count(*) filter (where checkout) as checkout, count(*) filter (where compro) as ventas,
           coalesce(sum(orden_monto) filter (where compro), 0) as ingresos
    from visitantes_sesiones_base((select desde from rango)::timestamp at time zone 'America/Montevideo', 'infinity'::timestamptz, false, null, null, null, null)
    where utm_campaign in (select utm_campaign from utms) and not es_interno
    group by 1
  ),
  meta as (
    select fecha, sum(gasto) as gasto, sum(impresiones) as impresiones, sum(clics_enlace) as clics_enlace,
           sum(vistas_pagina) as vistas_pagina, sum(compras) as compras_meta
    from meta_ads_rendimiento where ubicacion = 'total' and fecha >= (select desde from rango) group by fecha
  )
  select jsonb_build_object(
    'cuenta', (select to_jsonb(c) - 'datos' from meta_ads_cuenta c order by synced_at desc limit 1),
    'ultimo_sync', (select to_jsonb(s) from meta_ads_sync s order by iniciado_at desc limit 1),
    'ultimo_sync_ok', (select max(terminado_at) from meta_ads_sync where ok),
    'objetos', (select coalesce(jsonb_agg(to_jsonb(o) - 'config' - 'huella' order by o.nivel, o.nombre), '[]'::jsonb) from meta_ads_objetos o
                where o.estado is distinct from 'DELETED' and o.estado is distinct from 'ARCHIVED'),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object(
                'fecha', d::date, 'gasto', coalesce(m.gasto, 0), 'impresiones', coalesce(m.impresiones, 0),
                'clics_enlace', coalesce(m.clics_enlace, 0), 'vistas_pagina', coalesce(m.vistas_pagina, 0),
                'compras_meta', coalesce(m.compras_meta, 0), 'visitas', coalesce(pr.visitas, 0),
                'checkout', coalesce(pr.checkout, 0), 'ventas', coalesce(pr.ventas, 0), 'ingresos', coalesce(pr.ingresos, 0))
              order by d), '[]'::jsonb)
             from generate_series((select desde from rango), (now() at time zone 'America/Montevideo')::date, interval '1 day') d
             left join meta m on m.fecha = d::date left join propias pr on pr.fecha = d::date),
    'ubicaciones', (select coalesce(jsonb_agg(u order by u.gasto desc), '[]'::jsonb) from (
               select ubicacion, sum(gasto) as gasto, sum(impresiones) as impresiones, sum(clics_enlace) as clics_enlace,
                      sum(vistas_pagina) as vistas_pagina, sum(compras) as compras_meta,
                      max(fecha) filter (where gasto > 0) as ultimo_gasto
               from meta_ads_rendimiento where ubicacion <> 'total' and fecha >= (select desde from rango)
               group by ubicacion) u),
    'por_anuncio', (select coalesce(jsonb_agg(a order by a.gasto desc), '[]'::jsonb) from (
               select r.anuncio_id, sum(r.gasto) as gasto, sum(r.impresiones) as impresiones, sum(r.clics_enlace) as clics_enlace,
                      sum(r.vistas_pagina) as vistas_pagina, sum(r.compras) as compras_meta, max(r.frecuencia) as frecuencia_max
               from meta_ads_rendimiento r where r.ubicacion = 'total' and r.fecha >= (select desde from rango)
               group by r.anuncio_id) a),
    'horas', (select coalesce(jsonb_agg(h order by h.fecha, h.hora), '[]'::jsonb) from (
               select fecha, hora, gasto, impresiones, clics_enlace from meta_ads_horas
               where fecha >= (now() at time zone 'America/Montevideo')::date - 1) h),
    'cambios', (select coalesce(jsonb_agg(c order by c.detectado_at desc), '[]'::jsonb) from (
               select id, objeto_id, nivel, nombre, tipo, detectado_at,
                      case when tipo = 'config' then null else antes end as antes,
                      case when tipo = 'config' then null else despues end as despues
               from meta_ads_cambios order by detectado_at desc limit 30) c)
  );
$$;

revoke execute on function meta_ads_panel(int) from public, anon, authenticated;
