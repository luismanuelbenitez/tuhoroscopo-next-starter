-- Módulo de gobernanza de Google Ads, fase 2 (2026-11-14).
-- Cada cambio aplicado desde el botón "Aplicar" queda acá: qué se propuso,
-- qué se mandó a Google, qué devolvió (los recursos creados, para poder
-- deshacer) y si se deshizo. Solo lo escribe el servidor (clave secreta).
create table if not exists public.ads_gobernanza_acciones (
  id bigserial primary key,
  plataforma text not null default 'google',
  propuesta_id text not null,
  titulo text not null,
  items jsonb not null default '[]'::jsonb,
  operaciones jsonb not null default '[]'::jsonb,
  resultado jsonb,
  estado text not null default 'aplicada' check (estado in ('aplicada', 'deshecha', 'error')),
  error text,
  en_espera boolean not null default false,
  created_at timestamptz not null default now(),
  deshecha_at timestamptz,
  deshecha_resultado jsonb
);
create index if not exists ads_gobernanza_acciones_created_idx on public.ads_gobernanza_acciones (created_at desc);
alter table public.ads_gobernanza_acciones enable row level security;
comment on table public.ads_gobernanza_acciones is 'Cambios aplicados desde el módulo de gobernanza de Google Ads (nunca suben el gasto). Solo servidor.';
