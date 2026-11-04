-- Meta Ads (2026-11-04, Manuel): el panel se filtra por campaña. Con
-- p_campana (id de la campaña en Meta) todo — gasto, visitas, ventas,
-- ubicaciones, anuncios, objetos y cambios — es solo de esa campaña; sin él,
-- de toda la cuenta como antes. Suma 'campanas': todas las campañas vistas
-- (también las archivadas o borradas) para elegir. La tabla por hora es de la
-- cuenta: Meta no la separa por campaña.
-- Solo reemplaza la función de lectura; no toca datos.
drop function if exists meta_ads_panel(int);

create or replace function meta_ads_panel(p_dias int default 14, p_campana text default null)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with rango as (select (now() at time zone 'America/Montevideo')::date - (p_dias - 1) as desde),
  objs as (select * from meta_ads_objetos where p_campana is null or campana_id = p_campana or id = p_campana),
  utms as (select distinct utm_campaign from objs where utm_campaign is not null),
  rend as (select * from meta_ads_rendimiento where p_campana is null or campana_id = p_campana),
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
    from rend where ubicacion = 'total' and fecha >= (select desde from rango) group by fecha
  )
  select jsonb_build_object(
    'campana', p_campana,
    'campanas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', c.id, 'nombre', c.nombre, 'estado', c.estado, 'estado_efectivo', c.estado_efectivo,
                  'utm_campaign', c.utm_campaign, 'inicio', c.inicio, 'fin', c.fin, 'primer_visto_at', c.primer_visto_at,
                  'gasto_total', (select coalesce(sum(r.gasto), 0) from meta_ads_rendimiento r where r.campana_id = c.id and r.ubicacion = 'total'),
                  'primer_dia', (select min(r.fecha) from meta_ads_rendimiento r where r.campana_id = c.id and r.ubicacion = 'total' and r.gasto > 0),
                  'ultimo_dia', (select max(r.fecha) from meta_ads_rendimiento r where r.campana_id = c.id and r.ubicacion = 'total' and r.gasto > 0))
                 order by coalesce(c.inicio, c.primer_visto_at) desc), '[]'::jsonb)
                 from meta_ads_objetos c where c.nivel = 'campana'),
    'cuenta', (select to_jsonb(c) - 'datos' from meta_ads_cuenta c order by synced_at desc limit 1),
    'ultimo_sync', (select to_jsonb(s) from meta_ads_sync s order by iniciado_at desc limit 1),
    'ultimo_sync_ok', (select max(terminado_at) from meta_ads_sync where ok),
    -- Toda la cuenta: solo lo vigente. Una campaña elegida: también si está archivada o borrada.
    'objetos', (select coalesce(jsonb_agg(to_jsonb(o) - 'config' - 'huella' order by o.nivel, o.nombre), '[]'::jsonb) from objs o
                where p_campana is not null or (o.estado is distinct from 'DELETED' and o.estado is distinct from 'ARCHIVED')),
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
               from rend where ubicacion <> 'total' and fecha >= (select desde from rango)
               group by ubicacion) u),
    'por_anuncio', (select coalesce(jsonb_agg(a order by a.gasto desc), '[]'::jsonb) from (
               select r.anuncio_id, sum(r.gasto) as gasto, sum(r.impresiones) as impresiones, sum(r.clics_enlace) as clics_enlace,
                      sum(r.vistas_pagina) as vistas_pagina, sum(r.compras) as compras_meta, max(r.frecuencia) as frecuencia_max
               from rend r where r.ubicacion = 'total' and r.fecha >= (select desde from rango)
               group by r.anuncio_id) a),
    'horas', (select coalesce(jsonb_agg(h order by h.fecha, h.hora), '[]'::jsonb) from (
               select fecha, hora, gasto, impresiones, clics_enlace from meta_ads_horas
               where fecha >= (now() at time zone 'America/Montevideo')::date - 1) h),
    'cambios', (select coalesce(jsonb_agg(c order by c.detectado_at desc), '[]'::jsonb) from (
               select id, objeto_id, nivel, nombre, tipo, detectado_at,
                      case when tipo = 'config' then null else antes end as antes,
                      case when tipo = 'config' then null else despues end as despues
               from meta_ads_cambios
               where p_campana is null or objeto_id in (select id from objs)
               order by detectado_at desc limit 30) c)
  );
$$;

revoke execute on function meta_ads_panel(int, text) from public, anon, authenticated;
