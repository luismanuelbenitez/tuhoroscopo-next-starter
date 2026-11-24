-- Inteligencia comercial, fase 1 (2026-11-24).
-- Un negocio gestionado por fila: producto, mercado, moneda y sus objetivos
-- económicos. Es la ÚNICA fuente de los objetivos (ganancia mensual deseada y
-- CAC objetivo); los costos siguen donde ya estaban (tarot_costos y los
-- valores de referencia de tarot_configuracion), no se duplican acá.
-- Pensado para sumar Moonsage Tarot (EE. UU., USD) como otra fila.
-- Solo lo lee y escribe el servidor (clave secreta).
create table if not exists public.ic_negocios (
  id text primary key,
  nombre text not null,
  producto text not null,
  mercado text not null,
  moneda text not null,
  zona_horaria text not null default 'America/Montevideo',
  -- Clave de tarot_configuracion con el precio de venta vigente (no se copia el precio).
  clave_precio text,
  ganancia_mensual_objetivo numeric check (ganancia_mensual_objetivo is null or ganancia_mensual_objetivo >= 0),
  -- Cuánto se quiere pagar por cliente nuevo (moneda del negocio). Null = sin definir.
  cac_objetivo numeric check (cac_objetivo is null or cac_objetivo > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ic_negocios enable row level security;
comment on table public.ic_negocios is 'Inteligencia comercial: negocios gestionados y sus objetivos económicos (fuente única). Solo servidor.';

insert into public.ic_negocios (id, nombre, producto, mercado, moneda, zona_horaria, clave_precio, ganancia_mensual_objetivo, cac_objetivo)
values ('tu_oraculo_uy', 'Tu Oráculo', 'Tarot web (lectura de 5 cartas)', 'UY', 'UYU', 'America/Montevideo', 'precio_base_uyu', 10000, null)
on conflict (id) do nothing;
