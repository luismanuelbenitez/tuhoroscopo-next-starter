-- ============================================================================
-- Inteligencia de visitantes (2026-10-22)
--
-- Arquitectura: Vercel Web Analytics muestra el tráfico agregado (visitas,
-- páginas, referencias, países, dispositivos). Esta capa propia cubre SOLO lo
-- que Vercel no da: sesiones individuales unidas a órdenes, campañas con su
-- costo por comprador, recorridos y exclusión de tráfico propio.
--
-- Reutiliza funnel_sessions (existía sin uso) y funnel_events (ya en uso por
-- el funnel actual — no se cambia su contenido ni su semántica).
--
-- Minimización: NO se guarda IP ni user agent completo; solo campos
-- derivados (tipo de dispositivo, SO, navegador, rango de pantalla, ubicación
-- aproximada que entrega Vercel por cabeceras).
--
-- Aditiva e idempotente. Aplicar con: supabase db query --linked -f (NUNCA db push).
-- ============================================================================

-- 1) Sesiones ---------------------------------------------------------------
-- anonymous_id = identificador de sesión del navegador (el mismo que viaja a
-- tarot_ordenes.funnel_session_id).
alter table funnel_sessions
  add column if not exists visitor_id     text,
  add column if not exists es_recurrente  boolean not null default false,
  add column if not exists device_type    text,      -- movil | tablet | escritorio
  add column if not exists os             text,
  add column if not exists browser        text,
  add column if not exists in_app         text,      -- instagram | facebook | null
  add column if not exists screen_bucket  text,
  add column if not exists country        text,
  add column if not exists region         text,      -- departamento (ISO 3166-2, nivel 1)
  add column if not exists city           text,      -- aproximada
  add column if not exists fuente         text,      -- clasificación de la procedencia
  add column if not exists referrer_host  text,
  add column if not exists fbclid         boolean not null default false,
  add column if not exists gclid          boolean not null default false,
  add column if not exists es_interno     boolean not null default false,
  add column if not exists started_at     timestamptz,
  add column if not exists last_seen_at   timestamptz,
  add column if not exists page_views     integer not null default 0,
  add column if not exists eventos        integer not null default 0,
  add column if not exists vio_producto   boolean not null default false,
  add column if not exists checkout       boolean not null default false;

create unique index if not exists funnel_sessions_anonymous_id_key on funnel_sessions (anonymous_id);
create index if not exists idx_funnel_sessions_started on funnel_sessions (started_at desc);
create index if not exists idx_funnel_sessions_visitor on funnel_sessions (visitor_id) where visitor_id is not null;
create index if not exists idx_funnel_sessions_campana on funnel_sessions (utm_campaign) where utm_campaign is not null;
create index if not exists idx_tarot_ordenes_funnel_session on tarot_ordenes (funnel_session_id) where funnel_session_id is not null;

-- 2) Registro atómico de un lote de eventos -------------------------------
-- Lo llama SOLO /api/analytics/event (service role). Crea/actualiza la sesión
-- e inserta los eventos en una sola ida a la base. Tope de 500 eventos por
-- sesión: pasado eso se descarta (protección contra abuso / bucles).
create or replace function funnel_registrar_lote(p_sesion jsonb, p_eventos jsonb)
returns integer
language plpgsql
as $$
declare
  v_id text := p_sesion->>'session_id';
  v_visitor text := nullif(p_sesion->>'visitor_id', '');
  v_eventos integer;
  v_n integer;
  v_pv integer;
  v_primer_path text;
begin
  if v_id is null or jsonb_typeof(p_eventos) <> 'array' then
    return 0;
  end if;

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
    coalesce((p_sesion->>'es_interno')::boolean, false), now(), now()
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

  insert into funnel_events (session_id, event_name, product_id, product_name, path, value, currency, metadata)
  select v_id, e.event_name, e.product_id, e.product_name, e.path, e.value, coalesce(e.currency, 'UYU'), '{}'::jsonb
  from jsonb_to_recordset(p_eventos) as e(event_name text, product_id text, product_name text, path text, value numeric, currency text)
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
$$;

-- 3) Consultas del panel (agregadas) ---------------------------------------
-- Estados de orden que implican pago confirmado (incluye errores de entrega
-- posteriores al pago: la compra ocurrió).
create or replace function visitantes_orden_pagada(p_estado text)
returns boolean language sql immutable as $$
  select p_estado = any (array['pago_confirmado','generando_lectura','lectura_lista','generando_pdf','pdf_listo',
    'enviando_whatsapp','entregado','entregado_simulado','error_lectura','error_pdf','error_whatsapp','error_critico']);
$$;

-- Sesiones filtradas + su orden vinculada (la más relevante: pagada > creada).
create or replace function visitantes_sesiones_base(
  p_desde timestamptz, p_hasta timestamptz, p_interno boolean,
  p_fuente text, p_campana text, p_dispositivo text, p_region text
) returns table (
  sesion text, visitor_id text, es_recurrente boolean, started_at timestamptz, last_seen_at timestamptz,
  fuente text, utm_source text, utm_medium text, utm_campaign text, utm_content text, referrer_host text,
  device_type text, os text, browser text, in_app text, screen_bucket text, country text, region text, city text,
  page_views integer, vio_producto boolean, checkout boolean, es_interno boolean, first_path text,
  orden_id uuid, orden_estado text, orden_tipo text, orden_monto numeric, compro boolean, cortesia boolean
)
language sql stable as $$
  select s.anonymous_id, s.visitor_id, s.es_recurrente, s.started_at, s.last_seen_at,
         s.fuente, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.referrer_host,
         s.device_type, s.os, s.browser, s.in_app, s.screen_bucket, s.country, s.region, s.city,
         s.page_views, s.vio_producto, s.checkout, s.es_interno, s.first_path,
         o.id, o.estado, o.tipo_orden, o.precio_cobrado,
         coalesce(o.tipo_orden = 'venta' and visitantes_orden_pagada(o.estado), false),
         coalesce(o.tipo_orden = 'cortesia', false)
  from funnel_sessions s
  left join lateral (
    select t.id, t.estado, t.tipo_orden, t.precio_cobrado from tarot_ordenes t
    where t.funnel_session_id = s.anonymous_id
    order by visitantes_orden_pagada(t.estado) desc, t.created_at desc limit 1
  ) o on true
  where s.started_at >= p_desde and s.started_at < p_hasta
    and (p_interno or not s.es_interno)
    and (p_fuente is null or s.fuente = p_fuente)
    and (p_campana is null or s.utm_campaign = p_campana)
    and (p_dispositivo is null or s.device_type = p_dispositivo)
    and (p_region is null or s.region = p_region);
$$;

-- Panel completo en una sola llamada (jsonb).
create or replace function visitantes_panel(
  p_desde timestamptz, p_hasta timestamptz, p_interno boolean default false,
  p_fuente text default null, p_campana text default null, p_dispositivo text default null, p_region text default null
) returns jsonb
language sql stable as $$
  with b as (select * from visitantes_sesiones_base(p_desde, p_hasta, p_interno, p_fuente, p_campana, p_dispositivo, p_region)),
  costos as (
    select coalesce(utm_campaign, '(sin campaña)') as campana, sum(amount) as costo, max(currency) as moneda
    from campaign_costs where date >= p_desde::date and date <= p_hasta::date
    group by 1
  )
  select jsonb_build_object(
    'resumen', (select jsonb_build_object(
        'sesiones', count(*),
        'visitantes', count(distinct coalesce(visitor_id, sesion)),
        'recurrentes', count(*) filter (where es_recurrente),
        'vieron_producto', count(*) filter (where vio_producto),
        'checkout', count(*) filter (where checkout),
        'ordenes', count(*) filter (where orden_id is not null and not cortesia),
        'compras', count(*) filter (where compro),
        'cortesias', count(*) filter (where cortesia),
        'ingresos', coalesce(sum(orden_monto) filter (where compro), 0),
        'abandono_checkout', count(*) filter (where checkout and not compro and not cortesia),
        'paginas_por_sesion', round(avg(page_views)::numeric, 1),
        'duracion_mediana_seg', (percentile_cont(0.5) within group (order by extract(epoch from (last_seen_at - started_at))))::int
      ) from b),
    'por_fuente', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select coalesce(fuente, 'Directo') as fuente, count(*) as sesiones, count(*) filter (where checkout) as checkout,
               count(*) filter (where compro) as compras, coalesce(sum(orden_monto) filter (where compro), 0) as ingresos
        from b group by 1) x),
    'campanas', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select b2.fuentes, b2.utm_campaign as campana, b2.sesiones, b2.checkout, b2.compras, b2.ingresos,
               c.costo, c.moneda,
               case when c.costo is not null and b2.compras > 0 then round(c.costo / b2.compras, 2) end as costo_por_compra
        from (select utm_campaign, string_agg(distinct coalesce(fuente, utm_source), ', ') as fuentes,
                     count(*) as sesiones, count(*) filter (where checkout) as checkout,
                     count(*) filter (where compro) as compras, coalesce(sum(orden_monto) filter (where compro), 0) as ingresos
              from b where utm_campaign is not null group by 1) b2
        left join costos c on c.campana = b2.utm_campaign) x),
    'anuncios', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select utm_campaign as campana, utm_content as anuncio, count(*) as sesiones,
               count(*) filter (where checkout) as checkout, count(*) filter (where compro) as compras
        from b where utm_content is not null group by 1, 2 limit 30) x),
    'dispositivos', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select coalesce(device_type, 'desconocido') as clave, count(*) as sesiones,
               count(*) filter (where checkout) as checkout, count(*) filter (where compro) as compras
        from b group by 1) x),
    'navegadores', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select coalesce(in_app, browser, 'desconocido') as clave, count(*) as sesiones,
               count(*) filter (where checkout) as checkout, count(*) filter (where compro) as compras
        from b group by 1 order by 2 desc limit 8) x),
    'sistemas', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select coalesce(os, 'desconocido') as clave, count(*) as sesiones, count(*) filter (where compro) as compras
        from b group by 1 order by 2 desc limit 8) x),
    'departamentos', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select coalesce(nullif(region, ''), country, 'desconocido') as clave, country, count(*) as sesiones,
               count(*) filter (where checkout) as checkout, count(*) filter (where compro) as compras
        from b group by 1, 2 order by 3 desc limit 12) x),
    'ciudades', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select coalesce(city, 'desconocida') as clave, count(*) as sesiones, count(*) filter (where compro) as compras
        from b group by 1 order by 2 desc limit 10) x),
    'recorridos', (select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
        select r.recorrido, count(*) as sesiones, count(*) filter (where r.compro) as compras
        from (
          select b.compro, (
            select string_agg(p.path, ' → ' order by p.n)
            from (
              select e.path, row_number() over (order by e.created_at) as n
              from funnel_events e where e.session_id = b.sesion and e.event_name = 'page_view'
            ) p where p.n <= 4
          ) as recorrido
          from b where b.page_views > 0
        ) r where r.recorrido is not null
        group by 1 order by 2 desc limit 10) x),
    'filtros', jsonb_build_object(
        'fuentes', (select coalesce(jsonb_agg(distinct fuente), '[]'::jsonb) from funnel_sessions where fuente is not null and started_at >= p_desde and started_at < p_hasta),
        'campanas', (select coalesce(jsonb_agg(distinct utm_campaign), '[]'::jsonb) from funnel_sessions where utm_campaign is not null and started_at >= p_desde and started_at < p_hasta),
        'regiones', (select coalesce(jsonb_agg(distinct region), '[]'::jsonb) from funnel_sessions where region is not null and started_at >= p_desde and started_at < p_hasta)
      )
  );
$$;

-- Lista de sesiones (paginada).
create or replace function visitantes_sesiones(
  p_desde timestamptz, p_hasta timestamptz, p_interno boolean default false,
  p_fuente text default null, p_campana text default null, p_dispositivo text default null, p_region text default null,
  p_solo text default 'todas', p_limite integer default 50, p_offset integer default 0
) returns jsonb
language sql stable as $$
  with b as (
    select * from visitantes_sesiones_base(p_desde, p_hasta, p_interno, p_fuente, p_campana, p_dispositivo, p_region)
    where (p_solo = 'todas')
       or (p_solo = 'checkout' and checkout)
       or (p_solo = 'compra' and compro)
       or (p_solo = 'abandono' and checkout and not compro and not cortesia)
  )
  select jsonb_build_object(
    'total', (select count(*) from b),
    'filas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc), '[]'::jsonb) from (
      select * from b order by started_at desc limit least(p_limite, 200) offset p_offset) x)
  );
$$;

-- Detalle cronológico de una sesión.
create or replace function visitantes_sesion_detalle(p_sesion text)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'sesion', (select to_jsonb(s) - 'user_agent' from funnel_sessions s where s.anonymous_id = p_sesion),
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object('evento', e.event_name, 'path', e.path, 'at', e.created_at, 'valor', e.value) order by e.created_at), '[]'::jsonb)
                from funnel_events e where e.session_id = p_sesion),
    'ordenes', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'estado', t.estado, 'tipo', t.tipo_orden, 'monto', t.precio_cobrado,
                  'moneda', t.moneda, 'creada', t.created_at, 'pagada', visitantes_orden_pagada(t.estado)) order by t.created_at), '[]'::jsonb)
                from tarot_ordenes t where t.funnel_session_id = p_sesion),
    'otras_sesiones_del_visitante', (select count(*) from funnel_sessions o
                where o.visitor_id = (select visitor_id from funnel_sessions where anonymous_id = p_sesion)
                  and o.anonymous_id <> p_sesion)
  );
$$;

-- Solo el servidor (service role) puede ejecutar estas funciones: sin esto,
-- cualquiera con la anon key podría llamarlas por PostgREST.
revoke execute on function funnel_registrar_lote(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function visitantes_sesiones_base(timestamptz, timestamptz, boolean, text, text, text, text) from public, anon, authenticated;
revoke execute on function visitantes_panel(timestamptz, timestamptz, boolean, text, text, text, text) from public, anon, authenticated;
revoke execute on function visitantes_sesiones(timestamptz, timestamptz, boolean, text, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function visitantes_sesion_detalle(text) from public, anon, authenticated;
grant execute on function funnel_registrar_lote(jsonb, jsonb) to service_role;
grant execute on function visitantes_sesiones_base(timestamptz, timestamptz, boolean, text, text, text, text) to service_role;
grant execute on function visitantes_panel(timestamptz, timestamptz, boolean, text, text, text, text) to service_role;
grant execute on function visitantes_sesiones(timestamptz, timestamptz, boolean, text, text, text, text, text, integer, integer) to service_role;
grant execute on function visitantes_sesion_detalle(text) to service_role;

-- 4) Registro "Normativa y cumplimiento" (solo informativo) ----------------
create table if not exists admin_normativa (
  id              uuid primary key default gen_random_uuid(),
  tema            text not null unique,
  posible_obligacion text not null,
  descripcion     text not null,
  referencia      text,
  verificacion    text not null default 'pendiente' check (verificacion in ('confirmado', 'pendiente', 'descartado')),
  riesgo          text not null default 'medio' check (riesgo in ('bajo', 'medio', 'alto')),
  prioridad       text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  resolucion      text not null default 'abierto' check (resolucion in ('abierto', 'en_curso', 'resuelto', 'descartado')),
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table admin_normativa enable row level security;
-- Sin políticas: solo service role (admin).

insert into admin_normativa (tema, posible_obligacion, descripcion, referencia, verificacion, riesgo, prioridad) values
('Política de privacidad: analítica y cookies',
 'Informar al usuario el uso de herramientas de analítica y publicidad (GA4, Meta Pixel, Vercel Web Analytics) y de identificadores en su navegador.',
 'Verificado en el repo (2026-10-21/22): la política de privacidad no menciona cookies, GA4, Meta Pixel ni analítica. GA4 y Meta Pixel ya ponen cookies. La capa propia guarda un identificador anónimo de visitante en localStorage.',
 'Ley 18.331 (principios de información y consentimiento); Decreto 414/009. Alcance para identificadores en línea: a validar.',
 'confirmado', 'medio', 'alta'),
('IP y user agent guardados en cada orden',
 'Informar y justificar la conservación de la IP de la orden (tarot_ordenes.ip_orden) y definir su plazo de conservación.',
 'Verificado: ef_tarot_crear_orden guarda ip_orden y user_agent_orden por orden; la política de privacidad no lo menciona. La analítica nueva NO guarda IP.',
 'Ley 18.331 (dato personal: información que identifique o haga identificable a una persona). Si la IP es dato personal: a validar.',
 'confirmado', 'medio', 'media'),
('Consentimiento para cookies e identificadores',
 'Determinar si se requiere consentimiento previo (aviso o banner) para GA4, Meta Pixel y el identificador anónimo de visitante.',
 'No hay aviso de cookies en el sitio (decisión del propietario: no implementar por ahora). No se encontró resolución oficial de la URCDP sobre cookies; las fuentes que lo afirman son proveedores privados.',
 'Ley 18.331 / URCDP — sin resolución específica verificada.',
 'pendiente', 'medio', 'media'),
('Inscripción de bases de datos ante la URCDP',
 'Verificar si las bases de clientes/órdenes (y la de analítica) deben inscribirse en el registro de la URCDP y si ya lo están.',
 'Fuentes secundarias indican que las bases de datos deben inscribirse; no verificado con la URCDP ni con un profesional.',
 'Ley 18.331; Decreto 414/009. A validar.',
 'pendiente', 'medio', 'media'),
('Plazos de conservación (retención)',
 'Definir y documentar cuánto tiempo se conservan datos de órdenes, conversaciones de WhatsApp, media recibida y analítica.',
 'No hay política de retención documentada. Técnicamente: analítica sin purga automática por ahora; media de WhatsApp en bucket privado sin vencimiento.',
 'Ley 18.331 (principio de finalidad / conservación). A validar.',
 'pendiente', 'bajo', 'baja'),
('Uso de Vercel Hobby con fines comerciales',
 'Las condiciones de Vercel indican que el plan Hobby es para uso personal no comercial.',
 'Plan de Vercel actual no verificado desde el código. Si es Hobby, corresponde pasar a Pro (no es normativa estatal: es contractual con el proveedor).',
 'Vercel — Pricing / Fair use (Hobby: "personal, non-commercial use").',
 'pendiente', 'medio', 'alta')
on conflict (tema) do nothing;
