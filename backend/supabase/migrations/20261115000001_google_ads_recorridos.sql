-- Recorridos de Google Ads (2026-11-15, piloto "Tarot del amor").
-- Por cada página de entrada de las visitas de Google Ads: cuántas tocaron el
-- botón, llegaron al checkout, empezaron el formulario, fueron a pagar y
-- compraron, con el tema de cada venta. Solo lectura; lo usa el panel
-- Admin → Google Ads → Recorridos (lib/googleAdsApi/recorridos.ts).

create or replace function public.google_ads_recorridos(p_dias integer default 30)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with rango as (
    select ((now() at time zone 'America/Montevideo')::date - (greatest(p_dias, 1) - 1))::timestamp
           at time zone 'America/Montevideo' as desde
  ),
  base as (
    select b.sesion, b.started_at, b.checkout, b.compro, coalesce(b.cortesia, false) as cortesia, b.orden_monto, b.orden_id,
           coalesce(fs.landing_path, b.first_path, '—') as pagina,
           exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'cta_click') as toco_boton,
           exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'form_started') as empezo_form,
           exists (select 1 from funnel_events e where e.session_id = b.sesion and e.event_name = 'mp_redirect') as fue_a_pagar
    from visitantes_sesiones_base((select desde from rango), 'infinity'::timestamptz, false, 'Google Ads', null, null, null) b
    left join funnel_sessions fs on fs.anonymous_id = b.sesion
  )
  select jsonb_build_object(
    'dias', p_dias,
    'desde', (select desde from rango),
    'paginas', coalesce((
      select jsonb_agg(p order by (p->>'visitas')::int desc) from (
        select jsonb_build_object(
          'pagina', pagina,
          'visitas', count(*),
          'tocaron_boton', count(*) filter (where toco_boton),
          'checkout', count(*) filter (where checkout),
          'empezaron_form', count(*) filter (where empezo_form),
          'fueron_a_pagar', count(*) filter (where fue_a_pagar),
          'ventas', count(*) filter (where compro and not cortesia),
          'ingresos', coalesce(sum(orden_monto) filter (where compro and not cortesia), 0),
          'temas_venta', coalesce((
            select jsonb_object_agg(t.tema, t.n) from (
              select o.tema, count(*) as n from base b2 join tarot_ordenes o on o.id = b2.orden_id
              where b2.pagina = base.pagina and b2.compro and not b2.cortesia group by o.tema
            ) t), '{}'::jsonb),
          'ultima_visita', max(started_at)
        ) as p
        from base group by pagina
      ) x), '[]'::jsonb),
    -- Medición de cada página (cualquier origen): si la página manda sus
    -- eventos de botón y de secciones, el recorrido se puede seguir.
    'medicion', coalesce((
      select jsonb_object_agg(path, n) from (
        select path, count(*) as n from funnel_events
        where created_at >= (select desde from rango) and event_name in ('cta_click', 'section_view') and path like '/tarot%'
        group by path
      ) m), '{}'::jsonb)
  );
$$;

revoke all on function public.google_ads_recorridos(integer) from public, anon, authenticated;
grant execute on function public.google_ads_recorridos(integer) to service_role;
