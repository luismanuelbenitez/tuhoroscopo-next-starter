-- Hora real de cada evento + detalle completo de la sesión (2026-11-02).
--
-- 1) funnel_registrar_lote: el navegador agrupa eventos (cada 2 s o al salir),
--    así que todos quedaban con la hora de llegada del lote. Ahora cada evento
--    puede traer edad_ms (cuánto antes del envío ocurrió, ya validado y acotado
--    en /api/analytics/event) y se guarda created_at = now() - edad_ms. Sin
--    edad_ms (navegadores con la versión anterior en caché) queda now(), igual
--    que antes: compatible en ambos sentidos.
-- 2) visitantes_sesion_detalle: devuelve también el `detalle` de cada evento
--    (sección, botón, campo) para contar el recorrido en el panel. Empates de
--    hora (eventos viejos, del mismo lote) por ctid = orden de inserción.

create or replace function public.funnel_registrar_lote(p_sesion jsonb, p_eventos jsonb)
 returns integer
 language plpgsql
as $function$
declare
  v_id text := p_sesion->>'session_id';
  v_visitor text := nullif(p_sesion->>'visitor_id', '');
  v_eventos integer;
  v_n integer;
  v_pv integer;
  v_primer_path text;
  v_edad_max integer;
begin
  if v_id is null or jsonb_typeof(p_eventos) <> 'array' then
    return 0;
  end if;

  select coalesce(max(least(greatest(coalesce(e.edad_ms, 0), 0), 1800000)), 0) into v_edad_max
  from jsonb_to_recordset(p_eventos) as e(edad_ms integer);

  insert into funnel_sessions as s (
    anonymous_id, visitor_id, es_recurrente, first_path, landing_path, referrer, referrer_host,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, fuente,
    device_type, os, browser, in_app, screen_bucket, country, region, city,
    es_interno, started_at, last_seen_at
  ) values (
    v_id, v_visitor,
    v_visitor is not null and exists (select 1 from funnel_sessions x where x.visitor_id = v_visitor and x.anonymous_id <> v_id),
    p_sesion->>'landing_path', p_sesion->>'landing_path', p_sesion->>'referrer', p_sesion->>'referrer_host',
    p_sesion->>'utm_source', p_sesion->>'utm_medium', p_sesion->>'utm_campaign', p_sesion->>'utm_content', p_sesion->>'utm_term',
    coalesce((p_sesion->>'fbclid')::boolean, false), coalesce((p_sesion->>'gclid')::boolean, false), p_sesion->>'fuente',
    p_sesion->>'device_type', p_sesion->>'os', p_sesion->>'browser', p_sesion->>'in_app', p_sesion->>'screen_bucket',
    p_sesion->>'country', p_sesion->>'region', p_sesion->>'city',
    coalesce((p_sesion->>'es_interno')::boolean, false), now() - v_edad_max * interval '1 millisecond', now()
  )
  on conflict (anonymous_id) do update set
    last_seen_at = now(),
    updated_at = now(),
    -- Una sesión que en algún momento fue interna queda interna.
    es_interno = s.es_interno or excluded.es_interno,
    visitor_id = coalesce(s.visitor_id, excluded.visitor_id)
  returning s.eventos into v_eventos;

  if coalesce(v_eventos, 0) >= 500 then
    return 0;
  end if;

  insert into funnel_events (session_id, event_name, product_id, product_name, path, value, currency, metadata, created_at)
  select v_id, e.event_name, e.product_id, e.product_name, e.path, e.value, coalesce(e.currency, 'UYU'),
         case when e.detalle is not null then jsonb_build_object('detalle', e.detalle) else '{}'::jsonb end,
         now() - least(greatest(coalesce(e.edad_ms, 0), 0), 1800000) * interval '1 millisecond'
  from jsonb_to_recordset(p_eventos) as e(event_name text, product_id text, product_name text, path text, value numeric, currency text, detalle text, edad_ms integer)
  where e.event_name is not null;
  get diagnostics v_n = row_count;

  select count(*) filter (where e.event_name = 'page_view'),
         (array_agg(e.path) filter (where e.event_name = 'page_view'))[1]
    into v_pv, v_primer_path
  from jsonb_to_recordset(p_eventos) as e(event_name text, path text);

  update funnel_sessions set
    eventos = eventos + v_n,
    page_views = page_views + coalesce(v_pv, 0),
    first_path = coalesce(first_path, v_primer_path),
    vio_producto = vio_producto or exists (select 1 from jsonb_to_recordset(p_eventos) as e(event_name text) where e.event_name = 'product_viewed'),
    checkout = checkout or exists (select 1 from jsonb_to_recordset(p_eventos) as e(event_name text) where e.event_name = 'checkout_started')
  where anonymous_id = v_id;

  return v_n;
end;
$function$;

create or replace function public.visitantes_sesion_detalle(p_sesion text)
 returns jsonb
 language sql
 stable
as $function$
  select jsonb_build_object(
    'sesion', (select to_jsonb(s) - 'user_agent' from funnel_sessions s where s.anonymous_id = p_sesion),
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object('evento', e.event_name, 'path', e.path, 'at', e.created_at, 'valor', e.value,
                  'detalle', e.metadata->>'detalle') order by e.created_at, e.ctid), '[]'::jsonb)
                from funnel_events e where e.session_id = p_sesion),
    'ordenes', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'estado', t.estado, 'tipo', t.tipo_orden, 'monto', t.precio_cobrado,
                  'moneda', t.moneda, 'creada', t.created_at, 'pagada', visitantes_orden_pagada(t.estado)) order by t.created_at), '[]'::jsonb)
                from tarot_ordenes t where t.funnel_session_id = p_sesion),
    'otras_sesiones_del_visitante', (select count(*) from funnel_sessions o
                where o.visitor_id = (select visitor_id from funnel_sessions where anonymous_id = p_sesion)
                  and o.anonymous_id <> p_sesion)
  );
$function$;
