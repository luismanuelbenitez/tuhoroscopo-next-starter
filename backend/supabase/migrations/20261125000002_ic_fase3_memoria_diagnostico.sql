-- Inteligencia comercial · fase 3 (2026-11-25): memoria única y diagnóstico IA a pedido.
--
-- Memoria única: se reutiliza la memoria del Analista (tarot_analista_aprendizajes),
-- que ya lee y actualiza en cada informe, en vez de crear otra. Se amplía para
-- que también guarde lo que sale de experimentos y decisiones:
--   - confianza alta / media / baja = hecho comprobado / señal / hipótesis;
--   - resultado: si lo que se probó funcionó o no (los fracasos se guardan);
--   - canal y ref (p. ej. "EXP-001") para saber de dónde salió;
--   - negocio_id para varios negocios en el futuro.
alter table public.tarot_analista_aprendizajes
  add column if not exists negocio_id text not null default 'tu_oraculo_uy' references public.ic_negocios(id),
  add column if not exists canal      text,
  add column if not exists resultado  text check (resultado in ('funciono','no_funciono')),
  add column if not exists ref        text;
comment on table public.tarot_analista_aprendizajes is
  'Memoria única del negocio (Analista, Inteligencia comercial y Estratega). confianza alta/media/baja = hecho/señal/hipótesis; activo=false conserva lo refutado con su motivo.';

-- Diagnóstico ejecutivo con IA, solo a pedido (botón). Guarda el texto, el
-- costo y lo que se le pasó, para poder auditarlo.
create table if not exists public.ic_diagnosticos (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references public.ic_negocios(id),
  estado         text not null default 'generando' check (estado in ('generando','listo','error')),
  modelo         text not null,
  texto          text,
  paquete        jsonb,
  tokens_entrada integer,
  tokens_salida  integer,
  costo_usd      numeric(10,4),
  duracion_ms    integer,
  error          text,
  created_at     timestamptz not null default now()
);
create index if not exists ic_diagnosticos_negocio_idx on public.ic_diagnosticos (negocio_id, created_at desc);
alter table public.ic_diagnosticos enable row level security;
