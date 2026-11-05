-- Google Ads API (2026-11-04): copia de SOLO LECTURA de la cuenta de anuncios
-- 315-139-7440 (vía la MCC 404-786-5231), sincronizada cada hora por
-- /api/cron/google-ads. REGLA MÁXIMA: nada de esto modifica la cuenta.
-- Montos en la moneda de la cuenta (USD), ya convertidos de micros.

create table if not exists google_ads_rendimiento (
  fecha date not null,
  campana_id text not null,
  impresiones int not null default 0,
  clics int not null default 0,
  costo numeric(12, 4) not null default 0,
  conversiones numeric(12, 2) not null default 0,
  valor_conversiones numeric(12, 2) not null default 0,
  cuota_impresiones numeric(6, 4),          -- search_impression_share
  perdida_por_presupuesto numeric(6, 4),    -- search_budget_lost_impression_share
  perdida_por_ranking numeric(6, 4),        -- search_rank_lost_impression_share
  synced_at timestamptz not null default now(),
  primary key (fecha, campana_id)
);

-- Fotos del momento: cuenta, campañas (con presupuesto y estado), palabras
-- clave y términos de búsqueda de los últimos 30 días.
create table if not exists google_ads_datos (
  clave text primary key,
  datos jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists google_ads_sync (
  id bigserial primary key,
  origen text not null default 'cron',
  iniciado_at timestamptz not null default now(),
  terminado_at timestamptz,
  ok boolean,
  error text,
  consultas int
);

alter table google_ads_rendimiento enable row level security;
alter table google_ads_datos enable row level security;
alter table google_ads_sync enable row level security;
