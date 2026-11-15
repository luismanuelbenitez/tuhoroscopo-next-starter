-- Palabras del mercado (2026-11-15). Cuánta gente busca cada frase por mes
-- (Planificador de palabras clave de Google), por mercado: Uruguay en español
-- y EE. UU. en inglés. Se llena sola con la API (cuando Google habilite el
-- acceso Basic) o subiendo el archivo que descarga el Planificador.
-- Solo datos públicos de Google: no toca la cuenta de anuncios.

create table if not exists public.google_ads_mercado (
  id bigserial primary key,
  mercado text not null check (mercado in ('uy', 'us')),
  texto text not null,
  texto_norm text not null,
  mensual integer,                 -- promedio de búsquedas por mes (si viene en rango: el punto medio)
  mensual_min integer,
  mensual_max integer,
  competencia text,                -- LOW / MEDIUM / HIGH (o el texto del archivo)
  indice_competencia integer,      -- 0–100
  cpc_bajo numeric,                -- puja para la parte superior de la página (rango bajo), moneda de la cuenta
  cpc_alto numeric,
  meses jsonb not null default '[]'::jsonb,  -- [{mes:'2026-10', busquedas:n}] últimos 12
  fuente text not null check (fuente in ('api', 'archivo')),
  actualizado_at timestamptz not null default now(),
  unique (mercado, texto_norm)
);

create table if not exists public.google_ads_mercado_consultas (
  id bigserial primary key,
  mercado text not null,
  fuente text not null,
  filas integer not null default 0,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

alter table public.google_ads_mercado enable row level security;
alter table public.google_ads_mercado_consultas enable row level security;
revoke all on public.google_ads_mercado, public.google_ads_mercado_consultas from anon, authenticated;
