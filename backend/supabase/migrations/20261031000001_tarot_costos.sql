-- Presupuesto (2026-10-31): costos fijos y gastos puntuales del negocio,
-- cargados a mano desde /admin/tarot/presupuesto. La publicidad sigue en
-- campaign_costs y los costos por venta (IA, audio, Mercado Pago, WhatsApp)
-- se calculan solos. Solo agrega: no modifica tablas existentes.
-- Aplicar con: npx supabase db query --workdir backend --linked -f supabase/migrations/20261031000001_tarot_costos.sql

create table if not exists public.tarot_costos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  categoria   text not null default 'otros'
              check (categoria in ('infraestructura', 'herramientas', 'dominio', 'licencias', 'operativo', 'otros')),
  tipo        text not null check (tipo in ('fijo', 'puntual')),
  monto       numeric(12, 2) not null check (monto >= 0),
  moneda      text not null default 'USD' check (moneda in ('USD', 'UYU')),
  frecuencia  text check (frecuencia in ('mensual', 'anual')),
  -- fijo: desde cuándo corre; puntual: fecha del gasto.
  fecha_desde date not null default current_date,
  fecha_hasta date,
  activo      boolean not null default true,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tarot_costos_frecuencia_segun_tipo check (
    (tipo = 'fijo' and frecuencia is not null) or (tipo = 'puntual' and frecuencia is null)
  )
);

-- Solo el backend (service role) la usa; sin políticas = sin acceso público.
alter table public.tarot_costos enable row level security;

-- Costos iniciales que pasó Manuel (editables desde la página).
insert into public.tarot_costos (nombre, categoria, tipo, monto, moneda, frecuencia, fecha_desde, activo, notas)
select * from (values
  ('Vercel Pro',            'infraestructura', 'fijo', 20.00, 'USD', 'mensual', date '2026-10-01', true,  'Hosting de la web'),
  ('Supabase Pro',          'infraestructura', 'fijo', 25.00, 'USD', 'mensual', date '2026-11-01', false, 'Base de datos. Activar cuando se pase a Pro (hoy en plan Free)'),
  ('Dominio tuoraculo.uy',  'dominio',         'fijo', 50.00, 'USD', 'anual',   date '2026-10-01', true,  'Monto aproximado: confirmar con la factura'),
  ('Microsoft 365 E1',      'licencias',       'fijo', 10.00, 'USD', 'mensual', date '2026-10-01', true,  '1 licencia (tenant y correo). US$ 10 con compromiso anual; US$ 12 si se paga mes a mes'),
  ('Resend (email)',        'herramientas',    'fijo',  0.00, 'USD', 'mensual', date '2026-10-01', true,  'Plan gratis hasta 3.000 emails por mes')
) as v(nombre, categoria, tipo, monto, moneda, frecuencia, fecha_desde, activo, notas)
where not exists (select 1 from public.tarot_costos);

-- Costo por mensaje de plantilla de WhatsApp (categoría Marketing, Uruguay =
-- "Rest of Latin America"). Valor de referencia de la tarifa de Meta desde el
-- 2026-10-01; editable desde Presupuesto.
insert into public.tarot_configuracion (clave, valor, tipo_valor, descripcion)
select 'whatsapp_costo_por_mensaje_usd', '0.074', 'number',
       'Costo en USD de cada mensaje de plantilla de WhatsApp (Marketing, Uruguay). Se usa en Panel y Presupuesto. Revisar la tarifa de Meta periódicamente.'
where not exists (select 1 from public.tarot_configuracion where clave = 'whatsapp_costo_por_mensaje_usd');
