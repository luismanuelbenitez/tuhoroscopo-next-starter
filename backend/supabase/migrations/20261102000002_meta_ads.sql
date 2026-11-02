-- Integración Meta Ads, SOLO LECTURA (2026-11-02)
--
-- La SaaS lee de la API de anuncios de Meta (clave con permiso ads_read) la
-- cuenta publicitaria, la configuración COMPLETA de campañas / conjuntos /
-- anuncios y el rendimiento diario (por ubicación) y por hora. Nunca escribe
-- en Meta. Todo queda acá para analizarlo después (panel, Asistente, Analista
-- y consultas directas) sin depender de capturas del Administrador de anuncios.
--
-- Una sincronización = una llamada a meta_ads_guardar(payload): guarda todo en
-- una sola transacción, registra cambios de estado y de configuración, y deja
-- el gasto diario en campaign_costs (filas con notes = 'auto:meta').
-- Migración aditiva e idempotente: no modifica ni borra datos existentes.

-- ── Registro de sincronizaciones ────────────────────────────────────────────
create table if not exists meta_ads_sync (
  id bigint generated always as identity primary key,
  origen text not null default 'cron' check (origen in ('cron', 'manual', 'inicial')),
  desde date,
  hasta date,
  ok boolean not null default false,
  error text,
  conteos jsonb,
  iniciado_at timestamptz not null default now(),
  terminado_at timestamptz
);
create index if not exists idx_meta_ads_sync_iniciado on meta_ads_sync (iniciado_at desc);

-- ── Cuenta publicitaria (una fila por cuenta) ───────────────────────────────
create table if not exists meta_ads_cuenta (
  id text primary key,                      -- act_XXXXXXXX
  nombre text,
  moneda text,
  zona_horaria text,
  estado int,                               -- account_status de Meta (1 = activa)
  motivo_deshabilitada int,                 -- disable_reason (0 = ninguno)
  gastado_total numeric,                    -- amount_spent, en unidades de la moneda
  limite_gasto numeric,                     -- spend_cap (null = sin límite)
  saldo numeric,                            -- balance (deuda pendiente de cobro)
  datos jsonb not null default '{}'::jsonb, -- respuesta completa
  synced_at timestamptz not null default now()
);

-- ── Campañas, conjuntos y anuncios: foto actual + configuración completa ────
create table if not exists meta_ads_objetos (
  id text primary key,
  nivel text not null check (nivel in ('campana', 'conjunto', 'anuncio')),
  cuenta_id text,
  campana_id text,
  conjunto_id text,
  nombre text,
  estado text,                              -- status configurado (ACTIVE, PAUSED…)
  estado_efectivo text,                     -- effective_status (IN_PROCESS, WITH_ISSUES…)
  presupuesto_diario numeric,
  presupuesto_total numeric,
  presupuesto_restante numeric,
  inicio timestamptz,
  fin timestamptz,
  utm_campaign text,                        -- de los parámetros de URL del anuncio
  utm_content text,
  config jsonb not null default '{}'::jsonb,   -- configuración completa tal como la da Meta
  problemas jsonb,                          -- issues_info / ad_review_feedback / learning_stage_info
  huella text,                              -- hash de la configuración (detecta cambios)
  actualizado_meta timestamptz,             -- updated_time de Meta
  primer_visto_at timestamptz not null default now(),
  visto_at timestamptz not null default now()
);
create index if not exists idx_meta_ads_objetos_nivel on meta_ads_objetos (nivel);
create index if not exists idx_meta_ads_objetos_campana on meta_ads_objetos (campana_id);
create index if not exists idx_meta_ads_objetos_utm on meta_ads_objetos (utm_campaign);

-- ── Historial: cada cambio de estado o de configuración detectado ───────────
create table if not exists meta_ads_cambios (
  id bigint generated always as identity primary key,
  objeto_id text not null,
  nivel text not null,
  nombre text,
  tipo text not null check (tipo in ('nuevo', 'estado', 'config')),
  antes jsonb,
  despues jsonb,
  detectado_at timestamptz not null default now()
);
create index if not exists idx_meta_ads_cambios_detectado on meta_ads_cambios (detectado_at desc);
create index if not exists idx_meta_ads_cambios_objeto on meta_ads_cambios (objeto_id, detectado_at desc);

-- ── Rendimiento diario por anuncio. ubicacion = 'total' (sin desglose) o
--    'plataforma:posicion' (facebook:feed, instagram:reels, audience_network:…)
create table if not exists meta_ads_rendimiento (
  fecha date not null,
  anuncio_id text not null,
  ubicacion text not null,
  campana_id text,
  conjunto_id text,
  gasto numeric not null default 0,
  impresiones int not null default 0,
  alcance int,
  frecuencia numeric,
  clics int not null default 0,
  clics_enlace int not null default 0,
  vistas_pagina int not null default 0,     -- landing_page_view
  inicios_pago int not null default 0,      -- initiate_checkout
  compras int not null default 0,           -- purchase (según Meta)
  valor_compras numeric not null default 0,
  reproducciones_3s int,
  metricas jsonb,                           -- fila completa de Meta (actions, video…)
  synced_at timestamptz not null default now(),
  primary key (fecha, anuncio_id, ubicacion)
);
create index if not exists idx_meta_ads_rendimiento_campana on meta_ads_rendimiento (campana_id, fecha);

-- ── Por hora de la cuenta (huso de la cuenta publicitaria) ──────────────────
create table if not exists meta_ads_horas (
  fecha date not null,
  hora smallint not null check (hora between 0 and 23),
  gasto numeric not null default 0,
  impresiones int not null default 0,
  clics int not null default 0,
  clics_enlace int not null default 0,
  synced_at timestamptz not null default now(),
  primary key (fecha, hora)
);

alter table meta_ads_sync enable row level security;
alter table meta_ads_cuenta enable row level security;
alter table meta_ads_objetos enable row level security;
alter table meta_ads_cambios enable row level security;
alter table meta_ads_rendimiento enable row level security;
alter table meta_ads_horas enable row level security;

-- ── Guardado atómico de una sincronización ──────────────────────────────────
-- p = { sync_id, desde, hasta, cuenta:{…}, objetos:[…], rendimiento:[…], horas:[…] }
-- (formato armado por lib/metaAds/sync.ts)
create or replace function meta_ads_guardar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb;
  prev meta_ads_objetos%rowtype;
  n_obj int := 0; n_cambios int := 0; n_rend int := 0; n_horas int := 0; n_costos int := 0;
  v_desde date := (p->>'desde')::date;
  v_hasta date := (p->>'hasta')::date;
  v_moneda text := p->'cuenta'->>'moneda';
begin
  -- Cuenta
  if p ? 'cuenta' and p->'cuenta'->>'id' is not null then
    insert into meta_ads_cuenta (id, nombre, moneda, zona_horaria, estado, motivo_deshabilitada, gastado_total, limite_gasto, saldo, datos, synced_at)
    values (p->'cuenta'->>'id', p->'cuenta'->>'nombre', v_moneda, p->'cuenta'->>'zona_horaria',
            (p->'cuenta'->>'estado')::int, (p->'cuenta'->>'motivo_deshabilitada')::int,
            (p->'cuenta'->>'gastado_total')::numeric, (p->'cuenta'->>'limite_gasto')::numeric, (p->'cuenta'->>'saldo')::numeric,
            coalesce(p->'cuenta'->'datos', '{}'::jsonb), now())
    on conflict (id) do update set
      nombre = excluded.nombre, moneda = excluded.moneda, zona_horaria = excluded.zona_horaria, estado = excluded.estado,
      motivo_deshabilitada = excluded.motivo_deshabilitada, gastado_total = excluded.gastado_total,
      limite_gasto = excluded.limite_gasto, saldo = excluded.saldo, datos = excluded.datos, synced_at = now();
  end if;

  -- Objetos + historial de cambios
  for o in select * from jsonb_array_elements(coalesce(p->'objetos', '[]'::jsonb)) loop
    select * into prev from meta_ads_objetos where id = o->>'id';
    if not found then
      insert into meta_ads_cambios (objeto_id, nivel, nombre, tipo, antes, despues)
      values (o->>'id', o->>'nivel', o->>'nombre', 'nuevo', null,
              jsonb_build_object('estado', o->>'estado', 'estado_efectivo', o->>'estado_efectivo'));
      n_cambios := n_cambios + 1;
    else
      if prev.estado is distinct from o->>'estado' or prev.estado_efectivo is distinct from o->>'estado_efectivo' then
        insert into meta_ads_cambios (objeto_id, nivel, nombre, tipo, antes, despues)
        values (o->>'id', o->>'nivel', o->>'nombre', 'estado',
                jsonb_build_object('estado', prev.estado, 'estado_efectivo', prev.estado_efectivo),
                jsonb_build_object('estado', o->>'estado', 'estado_efectivo', o->>'estado_efectivo'));
        n_cambios := n_cambios + 1;
      end if;
      if prev.huella is distinct from o->>'huella' then
        insert into meta_ads_cambios (objeto_id, nivel, nombre, tipo, antes, despues)
        values (o->>'id', o->>'nivel', o->>'nombre', 'config', prev.config, o->'config');
        n_cambios := n_cambios + 1;
      end if;
    end if;

    insert into meta_ads_objetos (id, nivel, cuenta_id, campana_id, conjunto_id, nombre, estado, estado_efectivo,
      presupuesto_diario, presupuesto_total, presupuesto_restante, inicio, fin, utm_campaign, utm_content,
      config, problemas, huella, actualizado_meta, visto_at)
    values (o->>'id', o->>'nivel', o->>'cuenta_id', o->>'campana_id', o->>'conjunto_id', o->>'nombre', o->>'estado', o->>'estado_efectivo',
      (o->>'presupuesto_diario')::numeric, (o->>'presupuesto_total')::numeric, (o->>'presupuesto_restante')::numeric,
      (o->>'inicio')::timestamptz, (o->>'fin')::timestamptz, o->>'utm_campaign', o->>'utm_content',
      coalesce(o->'config', '{}'::jsonb), o->'problemas', o->>'huella', (o->>'actualizado_meta')::timestamptz, now())
    on conflict (id) do update set
      nivel = excluded.nivel, cuenta_id = excluded.cuenta_id, campana_id = excluded.campana_id, conjunto_id = excluded.conjunto_id,
      nombre = excluded.nombre, estado = excluded.estado, estado_efectivo = excluded.estado_efectivo,
      presupuesto_diario = excluded.presupuesto_diario, presupuesto_total = excluded.presupuesto_total,
      presupuesto_restante = excluded.presupuesto_restante, inicio = excluded.inicio, fin = excluded.fin,
      utm_campaign = excluded.utm_campaign, utm_content = excluded.utm_content, config = excluded.config,
      problemas = excluded.problemas, huella = excluded.huella, actualizado_meta = excluded.actualizado_meta, visto_at = now();
    n_obj := n_obj + 1;
  end loop;

  -- Rendimiento: se reemplaza el rango sincronizado (Meta corrige días pasados)
  if v_desde is not null and v_hasta is not null and p ? 'rendimiento' then
    delete from meta_ads_rendimiento where fecha between v_desde and v_hasta;
    insert into meta_ads_rendimiento (fecha, anuncio_id, ubicacion, campana_id, conjunto_id, gasto, impresiones, alcance, frecuencia,
      clics, clics_enlace, vistas_pagina, inicios_pago, compras, valor_compras, reproducciones_3s, metricas)
    select (r->>'fecha')::date, r->>'anuncio_id', r->>'ubicacion', r->>'campana_id', r->>'conjunto_id',
      coalesce((r->>'gasto')::numeric, 0), coalesce((r->>'impresiones')::int, 0), (r->>'alcance')::int, (r->>'frecuencia')::numeric,
      coalesce((r->>'clics')::int, 0), coalesce((r->>'clics_enlace')::int, 0), coalesce((r->>'vistas_pagina')::int, 0),
      coalesce((r->>'inicios_pago')::int, 0), coalesce((r->>'compras')::int, 0), coalesce((r->>'valor_compras')::numeric, 0),
      (r->>'reproducciones_3s')::int, r->'metricas'
    from jsonb_array_elements(p->'rendimiento') r
    on conflict (fecha, anuncio_id, ubicacion) do update set
      gasto = excluded.gasto, impresiones = excluded.impresiones, alcance = excluded.alcance, frecuencia = excluded.frecuencia,
      clics = excluded.clics, clics_enlace = excluded.clics_enlace, vistas_pagina = excluded.vistas_pagina,
      inicios_pago = excluded.inicios_pago, compras = excluded.compras, valor_compras = excluded.valor_compras,
      reproducciones_3s = excluded.reproducciones_3s, metricas = excluded.metricas, synced_at = now();
    get diagnostics n_rend = row_count;

    -- Gasto diario por campaña (utm_campaign) → campaign_costs, que ya leen
    -- Adquisición, Presupuesto, Panel estratégico y el Asistente. Solo se
    -- reemplazan las filas automáticas; las cargadas a mano no se tocan.
    delete from campaign_costs where notes = 'auto:meta' and date between v_desde and v_hasta;
    insert into campaign_costs (date, utm_source, utm_campaign, amount, currency, notes, platform, impressions, clicks)
    select r.fecha, 'meta', coalesce(a.utm_campaign, 'meta_' || r.campana_id), sum(r.gasto), coalesce(v_moneda, 'UYU'), 'auto:meta', 'meta',
           sum(r.impresiones), sum(r.clics_enlace)
    from meta_ads_rendimiento r
    left join meta_ads_objetos a on a.id = r.anuncio_id
    where r.ubicacion = 'total' and r.fecha between v_desde and v_hasta
    group by r.fecha, coalesce(a.utm_campaign, 'meta_' || r.campana_id)
    having sum(r.gasto) > 0;
    get diagnostics n_costos = row_count;
  end if;

  -- Por hora
  if p ? 'horas' then
    insert into meta_ads_horas (fecha, hora, gasto, impresiones, clics, clics_enlace)
    select (h->>'fecha')::date, (h->>'hora')::smallint, coalesce((h->>'gasto')::numeric, 0), coalesce((h->>'impresiones')::int, 0),
           coalesce((h->>'clics')::int, 0), coalesce((h->>'clics_enlace')::int, 0)
    from jsonb_array_elements(p->'horas') h
    on conflict (fecha, hora) do update set gasto = excluded.gasto, impresiones = excluded.impresiones,
      clics = excluded.clics, clics_enlace = excluded.clics_enlace, synced_at = now();
    get diagnostics n_horas = row_count;
  end if;

  return jsonb_build_object('objetos', n_obj, 'cambios', n_cambios, 'rendimiento', n_rend, 'horas', n_horas, 'costos', n_costos);
end;
$$;

-- ── Datos del panel Meta Ads ────────────────────────────────────────────────
-- Cruza lo de Meta con lo propio: visitas que llegaron con utm de campañas de
-- Meta y ventas cobradas de esas visitas (visitantes_sesiones_base).
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
                      sum(vistas_pagina) as vistas_pagina, sum(compras) as compras_meta
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

revoke execute on function meta_ads_guardar(jsonb) from public, anon, authenticated;
revoke execute on function meta_ads_panel(int) from public, anon, authenticated;
