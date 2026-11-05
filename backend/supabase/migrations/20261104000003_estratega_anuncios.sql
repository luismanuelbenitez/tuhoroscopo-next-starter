-- Estratega de anuncios (2026-11-04, Manuel). Una IA (Claude) que lee primero
-- "lo que sabe" (documentos editables desde el admin) y después consulta los
-- datos del negocio con funciones de SOLO LECTURA. Chat + informe semanal en
-- el admin (sin email). Lo que propone queda como propuesta hasta que Manuel
-- la acepta (recién ahí pasa a Pendientes y a "Decisiones tomadas").
-- Nada de esto toca Meta, Google ni clientes. Solo el service role accede.

create table if not exists estratega_documentos (
  clave text primary key,
  titulo text not null,
  descripcion text,
  contenido text not null default '',
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_por text not null default 'claude'
);

create table if not exists estratega_conversaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists estratega_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references estratega_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  texto text not null default '',
  consultas jsonb not null default '[]'::jsonb,
  estado text not null default 'listo' check (estado in ('generando', 'listo', 'error')),
  modelo text,
  tokens_entrada int,
  tokens_salida int,
  costo_usd numeric(10, 4),
  duracion_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists estratega_mensajes_conv on estratega_mensajes (conversacion_id, created_at);

create table if not exists estratega_informes (
  id uuid primary key default gen_random_uuid(),
  semana date not null,
  origen text not null default 'manual' check (origen in ('manual', 'cron')),
  estado text not null default 'generando' check (estado in ('generando', 'listo', 'error')),
  texto text,
  consultas jsonb not null default '[]'::jsonb,
  modelo text,
  tokens_entrada int,
  tokens_salida int,
  costo_usd numeric(10, 4),
  duracion_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists estratega_informes_fecha on estratega_informes (created_at desc);

create table if not exists estratega_propuestas (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid references estratega_mensajes(id) on delete set null,
  informe_id uuid references estratega_informes(id) on delete set null,
  titulo text not null,
  detalle text not null,
  area text not null default 'anuncios',
  prioridad text not null default 'media',
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aceptada', 'descartada')),
  pendiente_id uuid,
  created_at timestamptz not null default now(),
  resuelta_at timestamptz
);

alter table estratega_documentos enable row level security;
alter table estratega_conversaciones enable row level security;
alter table estratega_mensajes enable row level security;
alter table estratega_informes enable row level security;
alter table estratega_propuestas enable row level security;

-- Embudo agrupado. p_agrupar: fuente | campana | anuncio | ubicacion | dispositivo | dia | landing | ciudad.
-- Sin datos personales: solo conteos.
create or replace function estratega_embudo(p_desde timestamptz, p_hasta timestamptz, p_agrupar text default 'fuente')
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with b as (
    select *, extract(epoch from last_seen_at - started_at) as seg
    from visitantes_sesiones_base(p_desde, p_hasta, false, null, null, null, null)
    where not es_interno
  ),
  g as (
    select case p_agrupar
             when 'campana' then coalesce(utm_campaign, '(sin campaña)')
             when 'anuncio' then coalesce(utm_content, '(sin anuncio)')
             when 'ubicacion' then coalesce(utm_source, '(sin dato)')
             when 'dispositivo' then coalesce(device_type, '?') || coalesce(' · ' || in_app, '')
             when 'dia' then to_char(started_at at time zone 'America/Montevideo', 'YYYY-MM-DD')
             when 'landing' then coalesce(first_path, '?')
             when 'ciudad' then coalesce(city, '?')
             else coalesce(fuente, '?')
           end as grupo, *
    from b
  )
  select coalesce(jsonb_agg(x order by x.sesiones desc), '[]'::jsonb) from (
    select grupo,
           count(*) as sesiones,
           count(distinct visitor_id) as personas,
           round(100.0 * count(*) filter (where seg <= 5) / count(*)) as pct_se_van_5s,
           percentile_cont(0.5) within group (order by seg)::int as mediana_seg,
           count(*) filter (where vio_producto) as vieron_producto,
           count(*) filter (where checkout) as checkout,
           count(*) filter (where compro and not coalesce(cortesia, false)) as ventas,
           coalesce(sum(orden_monto) filter (where compro and not coalesce(cortesia, false)), 0) as ingresos
    from g group by grupo
  ) x;
$$;

-- Últimas sesiones con su comportamiento (sin nombre, teléfono ni IP).
create or replace function estratega_sesiones(p_desde timestamptz, p_hasta timestamptz, p_fuente text default null, p_campana text default null, p_solo_checkout boolean default false, p_limite int default 60)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x.inicio desc), '[]'::jsonb) from (
    select to_char(b.started_at at time zone 'America/Montevideo', 'YYYY-MM-DD HH24:MI') as inicio,
           b.fuente, b.utm_source as ubicacion, b.utm_campaign as campana, b.utm_content as anuncio,
           b.device_type as dispositivo, b.in_app, b.city as ciudad, b.es_recurrente as recurrente,
           extract(epoch from b.last_seen_at - b.started_at)::int as segundos, b.page_views as paginas,
           (select max(e.value) from funnel_events e where e.session_id = b.sesion and e.event_name = 'scroll_depth') as scroll_max,
           b.checkout, (b.compro and not coalesce(b.cortesia, false)) as compro,
           (select string_agg(distinct coalesce(e.event_name || ':' || (e.metadata->>'detalle'), e.event_name), ',')
              from funnel_events e where e.session_id = b.sesion
               and e.event_name not in ('page_view', 'scroll_depth', 'time_on_page', 'page_exit', 'landing_viewed', 'product_viewed')) as acciones
    from visitantes_sesiones_base(p_desde, p_hasta, false, null, null, null, null) b
    where not b.es_interno
      and (p_fuente is null or b.fuente = p_fuente)
      and (p_campana is null or b.utm_campaign = p_campana)
      and (not p_solo_checkout or b.checkout)
    order by b.started_at desc
    limit least(greatest(p_limite, 1), 200)
  ) x;
$$;

revoke execute on function estratega_embudo(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function estratega_sesiones(timestamptz, timestamptz, text, text, boolean, int) from public, anon, authenticated;
