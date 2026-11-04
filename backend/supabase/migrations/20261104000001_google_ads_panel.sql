-- Panel de Google Ads (2026-11-04), solo lectura. Sin acceso a la API de
-- Google Ads: muestra lo que la web mide de las visitas que llegan desde un
-- anuncio de Google (fuente "Google Ads": gclid o utm google + cpc). Misma
-- base que Visitantes y Meta Ads (visitantes_sesiones_base, sin tráfico
-- interno), así los números coinciden entre paneles. No toca datos.
create or replace function google_ads_panel(p_dias int default 14)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with rango as (
    select ((now() at time zone 'America/Montevideo')::date - (p_dias - 1))::timestamp at time zone 'America/Montevideo' as desde
  ),
  base as (
    select b.*, fs.landing_path, fs.utm_term,
           exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'form_started') as empezo_form,
           exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'mp_redirect') as fue_a_pagar
    from visitantes_sesiones_base((select desde from rango), 'infinity'::timestamptz, false, 'Google Ads', null, null, null) b
    left join funnel_sessions fs on fs.anonymous_id = b.sesion
  ),
  todas as (
    select fuente, count(*) as visitas, count(*) filter (where checkout) as checkout,
           count(*) filter (where compro and not coalesce(cortesia, false)) as ventas
    from visitantes_sesiones_base((select desde from rango), 'infinity'::timestamptz, false, null, null, null, null)
    group by fuente
  )
  select jsonb_build_object(
    'dias', p_dias,
    'resumen', (select jsonb_build_object(
        'visitas', count(*),
        'vieron_producto', count(*) filter (where vio_producto),
        'checkout', count(*) filter (where checkout),
        'empezaron_form', count(*) filter (where empezo_form),
        'fueron_a_pagar', count(*) filter (where fue_a_pagar),
        'ventas', count(*) filter (where compro and not coalesce(cortesia, false)),
        'ingresos', coalesce(sum(orden_monto) filter (where compro and not coalesce(cortesia, false)), 0),
        'movil', count(*) filter (where device_type = 'movil'),
        'ultima_visita', max(started_at)
      ) from base),
    'por_dia', coalesce((select jsonb_agg(d order by d->>'fecha') from (
        select jsonb_build_object('fecha', (started_at at time zone 'America/Montevideo')::date,
          'visitas', count(*), 'checkout', count(*) filter (where checkout),
          'ventas', count(*) filter (where compro and not coalesce(cortesia, false))) d
        from base group by (started_at at time zone 'America/Montevideo')::date) x), '[]'::jsonb),
    'landings', coalesce((select jsonb_agg(l order by (l->>'visitas')::int desc) from (
        select jsonb_build_object('path', coalesce(landing_path, first_path, '—'), 'visitas', count(*),
          'checkout', count(*) filter (where checkout), 'ventas', count(*) filter (where compro and not coalesce(cortesia, false))) l
        from base group by coalesce(landing_path, first_path, '—')) x), '[]'::jsonb),
    'dispositivos', coalesce((select jsonb_agg(v order by (v->>'visitas')::int desc) from (
        select jsonb_build_object('dispositivo', coalesce(device_type, '—'), 'visitas', count(*),
          'checkout', count(*) filter (where checkout), 'ventas', count(*) filter (where compro and not coalesce(cortesia, false))) v
        from base group by coalesce(device_type, '—')) x), '[]'::jsonb),
    'terminos', coalesce((select jsonb_agg(t order by (t->>'visitas')::int desc) from (
        select jsonb_build_object('termino', utm_term, 'visitas', count(*),
          'checkout', count(*) filter (where checkout), 'ventas', count(*) filter (where compro and not coalesce(cortesia, false))) t
        from base where nullif(utm_term, '') is not null group by utm_term) x), '[]'::jsonb),
    'visitas', coalesce((select jsonb_agg(v order by v->>'inicio' desc) from (
        select jsonb_build_object('inicio', started_at, 'dispositivo', device_type, 'ciudad', city,
          'landing', coalesce(landing_path, first_path), 'termino', nullif(utm_term, ''), 'paginas', page_views,
          'etapa', case when compro and not coalesce(cortesia, false) then 'compró'
                        when fue_a_pagar then 'fue a pagar'
                        when empezo_form then 'empezó el formulario'
                        when checkout then 'llegó al checkout'
                        when vio_producto then 'vio el producto'
                        else 'solo entró' end) v
        from base order by started_at desc limit 40) x), '[]'::jsonb),
    'fuentes', coalesce((select jsonb_agg(f order by (f->>'visitas')::int desc) from (
        select jsonb_build_object('fuente', fuente, 'visitas', visitas, 'checkout', checkout, 'ventas', ventas) f from todas) x), '[]'::jsonb)
  );
$$;

revoke execute on function google_ads_panel(int) from public, anon, authenticated;
