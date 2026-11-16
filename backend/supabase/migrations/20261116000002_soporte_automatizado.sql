-- Soporte Automatizado · etapa 1 (2026-11-16, luz verde de Manuel).
--
-- Cuando una clienta escribe por WhatsApp, el sistema arma el contexto (su
-- orden, su lectura, la conversación), el cerebro (IA) entiende qué quiere y
-- propone una respuesta, y los controles (sin IA) la revisan. En la etapa 1
-- NO SE ENVÍA NADA: queda como borrador en Admin → Clientes → Soporte
-- automatizado para que Manuel la apruebe, la edite o la tome él.
--
-- Principio: la IA entiende y redacta; el sistema calcula, arma links, crea
-- códigos (según Reglas comerciales) y controla. Por dentro es genérico: el
-- tarot solo aporta "su lectura" como contexto.

-- ── Cerebro: configuración versionada (cada cambio = versión nueva) ─────────
create table if not exists public.soporte_config (
  version                 integer primary key,
  activo                  boolean not null default true,
  modo_prueba             boolean not null default false,
  telefono_prueba         text not null default '59899863263',
  modelo                  text not null default 'claude-sonnet-5-5',
  identidad               text not null,
  reglas                  jsonb not null default '[]'::jsonb,
  frases_prohibidas       jsonb not null default '[]'::jsonb,
  intenciones             jsonb not null default '{}'::jsonb,
  politica                jsonb not null default '{}'::jsonb,
  confianza_minima        numeric(3,2) not null default 0.6,
  max_mensajes_ia         integer not null default 6,
  largo_maximo            integer not null default 900,
  nota                    text not null,
  creado_por              text not null default 'Manuel',
  created_at              timestamptz not null default now()
);

-- ── Casos: uno por mensaje (o tanda de mensajes) de la clienta ──────────────
create table if not exists public.soporte_casos (
  id                  uuid primary key default gen_random_uuid(),
  conversacion_id     uuid not null references public.tarot_whatsapp_conversaciones(id) on delete cascade,
  mensaje_id          uuid not null unique references public.tarot_whatsapp_mensajes(id) on delete cascade,
  cliente_id          uuid,
  orden_id            uuid,
  telefono            text,
  nombre              text,
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'aprobado', 'editado', 'descartado', 'humano', 'error')),
  intencion           text,
  confianza           numeric(3,2),
  riesgo              text check (riesgo is null or riesgo in ('bajo', 'medio', 'alto')),
  resumen             text,
  razon               text,
  accion              text check (accion is null or accion in ('ninguna', 'link_checkout', 'descuento', 'reenviar_lectura', 'humano')),
  pregunta_sugerida   text,
  respuesta_ia        text,
  respuesta_final     text,
  controles           jsonb not null default '[]'::jsonb,
  contexto            jsonb not null default '{}'::jsonb,
  config_version      integer,
  modelo              text,
  tokens_entrada      integer,
  tokens_salida       integer,
  costo_usd           numeric(10,5),
  duracion_ms         integer,
  error               text,
  codigo_creado       text,
  link                text,
  origen              text not null default 'cron' check (origen in ('cron', 'manual')),
  resuelto_por        text,
  resuelto_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists soporte_casos_estado_idx on public.soporte_casos (estado, created_at desc);
create index if not exists soporte_casos_conv_idx on public.soporte_casos (conversacion_id, created_at desc);

-- ── Ejemplos: respuestas aprobadas que enseñan el estilo de Manuel ──────────
create table if not exists public.soporte_ejemplos (
  id                uuid primary key default gen_random_uuid(),
  caso_id           uuid references public.soporte_casos(id) on delete set null,
  intencion         text not null,
  situacion         text not null,
  mensaje_cliente   text not null,
  respuesta         text not null,
  activo            boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.soporte_config enable row level security;
alter table public.soporte_casos enable row level security;
alter table public.soporte_ejemplos enable row level security;
revoke all on public.soporte_config, public.soporte_casos, public.soporte_ejemplos from anon, authenticated;

-- ── Versión 1 del cerebro ────────────────────────────────────────────────────
insert into public.soporte_config (version, identidad, reglas, frases_prohibidas, intenciones, politica, nota, creado_por)
select 1,
$$Sos quien atiende el WhatsApp de Tu Oráculo, un servicio uruguayo de lecturas de tarot online (tirada de 5 cartas del mazo Rider-Waite-Smith, entregada por WhatsApp y email con PDF y audio). Escribís en español rioplatense (vos), cálido, cercano y breve, como una persona del equipo: nunca te presentás como IA ni como bot. Tu trabajo es entender qué necesita la clienta y responder apoyándote en SU lectura cuando corresponda. Cuando la clienta quiere preguntar algo nuevo, le explicás con cariño por qué su lectura habla de lo que habla y le mostrás el siguiente paso: una lectura nueva con su pregunta en el centro.$$,
'[
  "No des certezas ni predicciones cerradas (\"va a volver\", \"es seguro\", \"te ama\"). El tarot orienta, no asegura.",
  "No hables por otra persona: nunca digas qué siente, piensa o hará alguien que no es la clienta. Podés hablar de lo que muestran las cartas de ELLA.",
  "Apoyate en una carta concreta de su lectura (por su nombre y lo que dice), nunca inventes cartas, posiciones ni interpretaciones que no están en la lectura.",
  "Nada de consejos de salud, legales ni financieros. Si aparecen, sugerí con calidez hablar con un profesional y marcá riesgo alto.",
  "No regales lecturas ni prometas nada gratis. No inventes precios, descuentos ni links: si corresponde ofrecer algo, elegí la acción y el sistema agrega el link y el beneficio.",
  "No escribas montos, porcentajes ni URLs en tu respuesta.",
  "Si hay angustia fuerte, crisis, violencia, autolesión, enojo, reclamo o pedido de reembolso: no lo resuelvas vos, elegí la acción humano.",
  "Respuestas cortas: 2 a 5 frases. Un emoji como máximo.",
  "Si la clienta pregunta por otra persona y su lectura no tenía esa pregunta, explicá que su lectura fue sobre su momento general y por eso habla más de ella; conectalo con una carta suya y sugerí una lectura nueva con esa pregunta (ej. tocar \"Escribir mi pregunta\")."
]'::jsonb,
'["por ser clienta", "como ya sos clienta", "como sos clienta", "soy una ia", "soy un bot", "inteligencia artificial", "gratis", "te garantizo", "seguro que va a volver", "va a volver"]'::jsonb,
'{
  "duda_lectura":    {"nombre": "Duda sobre su lectura",          "modo": "borrador", "descripcion": "Pregunta qué significa una carta o una parte de su lectura."},
  "otra_pregunta":   {"nombre": "Quiere hacer otra pregunta",      "modo": "borrador", "descripcion": "Quiere saber algo nuevo (otra persona, otro tema). Posible segunda lectura."},
  "problema_tecnico":{"nombre": "Problema con el link o el PDF",   "modo": "borrador", "descripcion": "No puede abrir la lectura, el PDF o el audio, o no le llegó."},
  "saludo":          {"nombre": "Saludo o agradecimiento",         "modo": "borrador", "descripcion": "Saluda, agradece o pregunta si puede consultar algo."},
  "reclamo":         {"nombre": "Reclamo o reembolso",             "modo": "humano",   "descripcion": "Está disconforme, pide devolución o se queja."},
  "sensible":        {"nombre": "Tema sensible",                   "modo": "humano",   "descripcion": "Angustia fuerte, crisis, salud, violencia o temas legales."},
  "otro":            {"nombre": "Otro / no está claro",            "modo": "borrador", "descripcion": "Cualquier otra cosa."},
  "spam":            {"nombre": "Spam o fuera de tema",            "modo": "humano",   "descripcion": "Publicidad, mensajes sin relación o números equivocados."}
}'::jsonb,
'{"regla_descuento": "segunda_lectura", "ofrecer_descuento_en": ["otra_pregunta"], "max_descuento_cada_dias": 30, "texto_link": "Si querés, la podés pedir acá con tus datos ya cargados: {LINK}"}'::jsonb,
'Versión inicial (16/11/2026): armada a partir del caso de Camila, con las reglas y la política acordadas con Manuel.',
'Manuel'
where not exists (select 1 from public.soporte_config);

-- ── Ejemplo n.º 1 (caso Camila, con nombres cambiados) ──────────────────────
insert into public.soporte_ejemplos (intencion, situacion, mensaje_cliente, respuesta)
select 'otra_pregunta',
  'Compró una lectura de amor sin escribir una pregunta propia. Su lectura habla de ella: retiro (El Ermitaño), herida pasada (Cinco de Espadas) y esperar que el otro dé el primer paso (Seis de Bastos invertido). Dos horas después pregunta por un chico concreto.',
  'Quiero saber qué siente Martín por mí',
  '¡Gracias por contarme, Laura! 💫
Tu lectura de hoy fue sobre tu momento en el amor en general, por eso habla más de vos que de él. Por ejemplo, el Seis de Bastos invertido sugiere que quizás estás esperando que el otro dé el primer paso antes de mostrarte, y eso puede tener mucho que ver con lo que te pasa con Martín.'
where not exists (select 1 from public.soporte_ejemplos);

-- CAMILA490 (16/11) se creó antes de este módulo: se le agrega el teléfono
-- para que la política "1 descuento cada 30 días" la reconozca.
update public.tarot_codigos_descuento set metadata = metadata || '{"telefono": "59899527295"}'::jsonb
where codigo = 'CAMILA490' and not (metadata ? 'telefono');
