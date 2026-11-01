-- Analista de conversión (2026-11-01): informes a demanda escritos por IA
-- sobre cómo navega y compra la gente. Solo agrega tablas: no modifica nada.
-- Se leen y escriben desde la web con la clave de servicio (RLS sin políticas).
-- Aplicar con: npx supabase db query --workdir backend --linked -f supabase/migrations/20261101000002_tarot_analista.sql

-- Configuración (una sola fila, id = 1).
create table if not exists public.tarot_analista_config (
  id                 smallint primary key default 1 check (id = 1),
  modelo             text not null default 'claude-opus-5-5',
  esfuerzo           text not null default 'high' check (esfuerzo in ('medium', 'high', 'xhigh')),
  -- Fuentes de datos activas, ej. {"trafico": true, "formulario": true, ...}.
  fuentes            jsonb not null default '{}'::jsonb,
  -- Lo que el analista tiene que saber del negocio (texto libre de Manuel).
  contexto_negocio   text not null default '',
  -- Por debajo de este número de visitas no se afirman conclusiones.
  minimo_visitas     integer not null default 100 check (minimo_visitas between 10 and 10000),
  -- Tope de gasto mensual en informes (USD); null = sin tope.
  tope_mensual_usd   numeric(8,2),
  updated_at         timestamptz not null default now()
);
insert into public.tarot_analista_config (id) values (1) on conflict (id) do nothing;

-- Informes generados.
create table if not exists public.tarot_analista_informes (
  id               uuid primary key default gen_random_uuid(),
  estado           text not null default 'generando' check (estado in ('generando', 'listo', 'error')),
  foco             text not null,
  periodo_desde    timestamptz not null,
  periodo_hasta    timestamptz not null,
  modelo           text not null,
  esfuerzo         text not null,
  -- Informe estructurado (resumen, hallazgos, recomendaciones…).
  contenido        jsonb,
  -- Paquete exacto que recibió la IA (sin datos personales), para auditar.
  datos_enviados   jsonb,
  tokens_entrada   integer,
  tokens_salida    integer,
  costo_usd        numeric(10,4),
  duracion_ms      integer,
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists tarot_analista_informes_created_idx on public.tarot_analista_informes (created_at desc);

-- Bitácora de cambios: qué se cambió y cuándo (campaña, web, precio…), para
-- que el analista no confunda el efecto de un cambio con casualidad.
create table if not exists public.tarot_analista_bitacora (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  categoria    text not null check (categoria in ('publicidad', 'web', 'precio', 'producto', 'otro')),
  descripcion  text not null check (length(descripcion) between 3 and 500),
  created_at   timestamptz not null default now()
);
create index if not exists tarot_analista_bitacora_fecha_idx on public.tarot_analista_bitacora (fecha desc);

-- Exportaciones CSV del Administrador de anuncios de Meta, ya leídas a filas.
create table if not exists public.tarot_analista_meta_csv (
  id               uuid primary key default gen_random_uuid(),
  nombre_archivo   text not null,
  desglose         text not null check (desglose in ('general', 'edad_sexo', 'ubicacion', 'region', 'hora', 'otro')),
  periodo_desde    date,
  periodo_hasta    date,
  columnas         jsonb not null,
  filas            jsonb not null,
  notas            text,
  created_at       timestamptz not null default now()
);

alter table public.tarot_analista_config enable row level security;
alter table public.tarot_analista_informes enable row level security;
alter table public.tarot_analista_bitacora enable row level security;
alter table public.tarot_analista_meta_csv enable row level security;

-- Primeras entradas de la bitácora: los cambios de esta semana.
insert into public.tarot_analista_bitacora (fecha, categoria, descripcion)
select * from (values
  ('2026-10-28'::date, 'publicidad', 'Arranca la campaña de Meta "TO | Tarot | Ventas | UY | Test 01" (video V6, optimiza por Compra, ubicaciones Advantage+).'),
  ('2026-10-31'::date, 'web', 'Empieza la medición de scroll y tiempo en página.'),
  ('2026-11-01'::date, 'publicidad', 'Meta: se excluye Audience Network (Aplicaciones y sitios web), sin gasto limitado en excluidas; público fijo mujeres 25–55; identidad con la página de Facebook (Instagram bloqueado).'),
  ('2026-11-01'::date, 'web', 'Empieza la medición del formulario del checkout y de las secciones de /tarot.')
) as v(fecha, categoria, descripcion)
where not exists (select 1 from public.tarot_analista_bitacora);
