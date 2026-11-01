-- Memoria del Analista de conversión (2026-11-01). Solo agrega tablas.
-- Aplicar con: npx supabase db query --workdir backend --linked -f supabase/migrations/20261101000003_tarot_analista_memoria.sql

-- Seguimiento de recomendaciones: una fila por recomendación de cada informe.
-- Manuel marca el estado; al marcarla "hecha" se anota en la bitácora
-- (bitacora_id) y el próximo informe la evalúa (evaluacion_*).
create table if not exists public.tarot_analista_recomendaciones (
  id                    uuid primary key default gen_random_uuid(),
  informe_id            uuid not null references public.tarot_analista_informes(id) on delete cascade,
  indice                integer not null,
  prioridad             integer,
  accion                text not null,
  donde                 text,
  impacto               text,
  esfuerzo              text,
  como_medir            text,
  estado                text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha', 'descartada')),
  nota                  text,
  estado_at             timestamptz,
  bitacora_id           uuid references public.tarot_analista_bitacora(id) on delete set null,
  evaluacion_veredicto  text check (evaluacion_veredicto in ('funciono', 'no_funciono', 'sin_datos_aun', 'no_aplica')),
  evaluacion_texto      text,
  evaluado_informe_id   uuid references public.tarot_analista_informes(id) on delete set null,
  evaluado_at           timestamptz,
  created_at            timestamptz not null default now(),
  unique (informe_id, indice)
);
create index if not exists tarot_analista_recs_estado_idx on public.tarot_analista_recomendaciones (estado, created_at desc);

-- "Lo que ya sabemos": aprendizajes duraderos. Los propone la IA en cada
-- informe (entran solos) o los escribe Manuel; se pueden editar, descartar
-- o borrar. Los descartados quedan con su motivo (historial).
create table if not exists public.tarot_analista_aprendizajes (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null check (length(texto) between 3 and 600),
  area          text not null default 'otro' check (area in ('trafico', 'pagina', 'checkout', 'pago', 'postcompra', 'oferta', 'medicion', 'otro')),
  confianza     text not null default 'media' check (confianza in ('alta', 'media', 'baja')),
  evidencia     text,
  origen        text not null default 'ia' check (origen in ('ia', 'manual')),
  activo        boolean not null default true,
  motivo_baja   text,
  informe_id    uuid references public.tarot_analista_informes(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tarot_analista_aprendizajes_activo_idx on public.tarot_analista_aprendizajes (activo, updated_at desc);

alter table public.tarot_analista_recomendaciones enable row level security;
alter table public.tarot_analista_aprendizajes enable row level security;
