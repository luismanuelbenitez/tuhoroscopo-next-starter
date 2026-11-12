-- Embudo del checkout para visitas de Google Ads (2026-11-12, Manuel: "dejamos
-- ir muchos clientes"). Solo lectura. Misma base que google_ads_panel
-- (visitantes_sesiones_base, fuente 'Google Ads', sin tráfico interno).
-- Por cada visita que llegó al checkout: eligió tema → nombre → WhatsApp →
-- términos → envió → fue a Mercado Pago → compró. Total y por día.
create or replace function public.google_ads_embudo_checkout(p_dias integer default 14)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  with rango as (
    select ((now() at time zone 'America/Montevideo')::date - (p_dias - 1))::timestamp at time zone 'America/Montevideo' as desde
  ),
  base as (
    select b.sesion, b.started_at, b.compro, b.cortesia, b.device_type
    from visitantes_sesiones_base((select desde from rango), 'infinity'::timestamptz, false, 'Google Ads', null, null, null) b
    where b.checkout
  ),
  pasos as (
    select b.*,
      exists (select 1 from funnel_events e where e.session_id = b.sesion and (e.event_name = 'form_started' or (e.event_name = 'form_field_done' and e.metadata->>'detalle' = 'tema'))) as tema,
      exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'form_field_done' and e.metadata->>'detalle' = 'nombre') as nombre,
      exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'form_field_done' and e.metadata->>'detalle' = 'telefono') as telefono,
      exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'form_field_done' and e.metadata->>'detalle' = 'acepta_terminos') as terminos,
      exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'form_submit') as envio,
      exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'mp_redirect') as mp,
      (select extract(epoch from max(e.created_at) - min(e.created_at)) from funnel_events e where e.session_id = b.sesion and e.path = '/tarot/checkout') as seg
    from base b
  ),
  resumen as (
    select count(*) as llegaron, count(*) filter (where tema) as tema, count(*) filter (where nombre) as nombre,
           count(*) filter (where telefono) as telefono, count(*) filter (where terminos) as terminos,
           count(*) filter (where envio) as envio, count(*) filter (where mp) as mp,
           count(*) filter (where compro and not coalesce(cortesia, false)) as compro,
           count(*) filter (where device_type = 'movil') as movil,
           percentile_cont(0.5) within group (order by seg) as mediana_seg
    from pasos
  )
  select jsonb_build_object(
    'dias', p_dias,
    'total', (select to_jsonb(r) from resumen r),
    'por_dia', coalesce((select jsonb_agg(d order by d->>'fecha') from (
      select jsonb_build_object('fecha', (started_at at time zone 'America/Montevideo')::date,
        'llegaron', count(*), 'tema', count(*) filter (where tema), 'nombre', count(*) filter (where nombre),
        'telefono', count(*) filter (where telefono), 'mp', count(*) filter (where mp),
        'compro', count(*) filter (where compro and not coalesce(cortesia, false))) d
      from pasos group by (started_at at time zone 'America/Montevideo')::date) x), '[]'::jsonb)
  );
$$;

revoke all on function public.google_ads_embudo_checkout(integer) from public, anon, authenticated;
grant execute on function public.google_ads_embudo_checkout(integer) to service_role;
