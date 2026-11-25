-- Inteligencia comercial · fase 2 (2026-11-25): decisiones de la bandeja única
-- de recomendaciones y experimentos. Genérico por negocio y canal.
-- Las recomendaciones NO se guardan acá: se calculan en vivo desde sus
-- fuentes (motor de reglas de Google Ads, Estratega, Analista, Centro de
-- control). Acá queda solo lo que decide Manuel y los experimentos.

create table if not exists public.ic_experimentos (
  id               text primary key,                 -- "EXP-001"
  negocio_id       text not null references public.ic_negocios(id),
  canal            text not null,                    -- lib/inteligencia/canales.ts
  nombre           text not null,
  hipotesis        text not null,
  cambios          jsonb not null default '[]',      -- ["qué se cambia", …]
  estado           text not null default 'planificado'
                   check (estado in ('planificado','activo','cerrado','cancelado')),
  resultado        text check (resultado in ('exito','fracaso','sin_evidencia','mixto')),
  aplicado_desde   timestamptz,                      -- fecha efectiva real del cambio
  fin_previsto     date,
  volumen_minimo   jsonb,                            -- {"metrica":"clics","valor":45}
  kpis             jsonb not null default '[]',      -- [{clave,nombre,antes,esperado}]
  criterios        jsonb not null default '[]',      -- [{si,entonces}]
  linea_base       jsonb,                            -- foto congelada al aplicar
  faltantes        jsonb not null default '[]',      -- información que falta, explícita
  referencias      jsonb not null default '[]',      -- [{titulo,url}]
  conclusion       text,
  aprendizaje      text,
  alcance          jsonb not null default '[]',      -- qué no se toca mientras corre (canales y áreas)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ic_decisiones (
  clave            text primary key,                 -- "analista:<id>", "regla:google_ads:<id>", "centro:<id>"…
  negocio_id       text not null references public.ic_negocios(id),
  estado           text not null check (estado in ('aceptada','descartada','pospuesta','hecha','no_aplica')),
  titulo           text not null,                    -- copia del título al decidir
  canal            text,
  nota             text,
  posponer_hasta   date,
  experimento_id   text references public.ic_experimentos(id),
  fuentes          jsonb not null default '[]',      -- [{tipo:"analista"|"estratega", id}] unidas en esta decisión
  decidida_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ic_decisiones_negocio_idx on public.ic_decisiones (negocio_id, estado);

alter table public.ic_experimentos enable row level security;
alter table public.ic_decisiones enable row level security;

-- EXP-001: tanda C de Google Ads, cargada solo con datos verificables del plan
-- (artifact del 22/11, v3 del 24/11) y del historial de la cuenta. Todavía no
-- aplicada: la última versión de la campaña es la v17 (17/11).
insert into public.ic_experimentos (id, negocio_id, canal, nombre, hipotesis, cambios, estado, fin_previsto, volumen_minimo, kpis, criterios, faltantes, referencias, alcance)
values (
  'EXP-001', 'tu_oraculo_uy', 'google_ads',
  'Tanda C · Google Ads: cada búsqueda en su página',
  'Si dejamos de pagar clics de búsquedas que no compran y llevamos «tirada de tarot» (la búsqueda que más vende) a su propio grupo, anuncio y página, más clics terminan en venta y el costo por venta baja hacia el equilibrio (US$15 o menos).',
  '["Pausar la campaña mientras se hacen los cambios y reactivarla al final.",
    "Grupo nuevo «Tirada de tarot» con [tirada de tarot], \"tirada de tarot\" y \"tirada de tarot online\", y anuncio nuevo hacia /tarot/tirada-de-tarot.",
    "Pausar «tarot online» (exacta y frase) y las palabras de amor del grupo «Tarot online».",
    "Pausar el grupo «Lectura de cartas».",
    "Excluir de forma exacta: [tarot], [tarot online], [tirada de cartas], [lectura de cartas], [tarot del amor].",
    "Opcional, a decisión de Manuel: tope de costo por clic de US$0,60 a US$0,75.",
    "Cuando el anuncio nuevo esté aprobado, pausar las 3 palabras de «tirada» del grupo viejo."]'::jsonb,
  'planificado', '2026-11-30',
  '{"metrica":"clics","valor":45}'::jsonb,
  '[{"clave":"clics_dia","nombre":"Clics por día","antes":"~12","esperado":"~7–9"},
    {"clave":"gasto_dia_usd","nombre":"Gasto por día","antes":"~US$6,3","esperado":"US$4,5–6"},
    {"clave":"cpc_usd","nombre":"Costo por clic","antes":"~US$0,52","esperado":"US$0,55–0,70"},
    {"clave":"ventas_100_clics","nombre":"Ventas cada 100 clics","antes":"~2","esperado":"4–6"},
    {"clave":"costo_venta_usd","nombre":"Costo por venta","antes":"~US$28","esperado":"US$12–17 (meta ≤ US$15)"}]'::jsonb,
  '[{"si":"3 ventas o más","entonces":"La estructura funciona (≈ US$12 o menos por venta). Diciembre se arma igual, con más presupuesto diario."},
    {"si":"1 o 2 ventas","entonces":"Cerca del equilibrio. Se mantiene la estructura y en diciembre se prueba el siguiente ajuste, de a uno."},
    {"si":"0 ventas con 45 clics o más","entonces":"Comparar /tarot/tirada-de-tarot contra /tarot. Si la página dedicada retiene menos, el anuncio nuevo vuelve a /tarot."},
    {"si":"Menos de 4 clics por día","entonces":"Se cortó de más: reactivar «lectura de tarot online» y revisar el tope de costo por clic."}]'::jsonb,
  '["Todavía no está aplicada: falta la fecha efectiva. Se marca cuando la apliques (o cuando la sincronización de Google detecte la versión nueva).",
    "No se sabe si se va a aplicar el tope de costo por clic (paso opcional).",
    "Los valores «antes» son del plan del 24/11; la línea base exacta se congela el día que se aplique.",
    "La comparación por página (/tarot/tirada-de-tarot contra /tarot) todavía no se calcula en esta pantalla.",
    "Con el presupuesto que queda hasta el 30/11 el plan estima 45–55 clics: alcanza para ver si la gente se queda, no para un costo por venta confiable (1 venta mueve mucho el promedio)."]'::jsonb,
  '[{"titulo":"Plan de la tanda C (v3, 24/11)","url":"https://claude.ai/artifact/JeD8baj1RCSvQAFJJ6rXSz"}]'::jsonb,
  '["google_ads","pagina","checkout"]'::jsonb
)
on conflict (id) do nothing;
