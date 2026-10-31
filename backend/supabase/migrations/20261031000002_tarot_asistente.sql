-- Asistente CEO (2026-10-31): partes diarios guardados y el estado que Manuel
-- le da a cada hallazgo (listo / ignorar). Los chequeos en sí se calculan en
-- vivo desde la web (lib/asistente.ts). Solo agrega: no modifica tablas.
-- Aplicar con: npx supabase db query --workdir backend --linked -f supabase/migrations/20261031000002_tarot_asistente.sql

create table if not exists public.tarot_asistente_informes (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('diario', 'manual')),
  estado_general    text not null check (estado_general in ('bien', 'atencion', 'critico')),
  resumen           text not null,
  -- Foto completa del chequeo (áreas, métricas y hallazgos) al momento del parte.
  contenido         jsonb not null,
  email_enviado_at  timestamptz,
  email_error       text,
  created_at        timestamptz not null default now()
);
create index if not exists tarot_asistente_informes_created_idx on public.tarot_asistente_informes (created_at desc);

-- Un hallazgo se identifica por una clave estable (ej. "orden_trabada:<id>",
-- "tipo_cambio_sin_cargar"). "listo" lo oculta 24 h y "ignorado" 7 días; si
-- el problema sigue después, vuelve a aparecer.
create table if not exists public.tarot_asistente_hallazgos (
  clave        text primary key,
  estado       text not null check (estado in ('listo', 'ignorado')),
  oculto_hasta timestamptz not null,
  updated_at   timestamptz not null default now()
);

alter table public.tarot_asistente_informes enable row level security;
alter table public.tarot_asistente_hallazgos enable row level security;
