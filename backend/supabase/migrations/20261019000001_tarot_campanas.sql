-- ============================================================================
-- Módulo Campañas — 2026-10-19. Primera campaña: "Feedback de experiencia".
--
-- Campaña → audiencia → disparador → canal → mensaje → envío → resultado → costo.
--
--   tarot_campanas              una fila por campaña (tipo, estado, reglas en
--                               jsonb editables desde el admin, costos).
--   tarot_campana_envios        UNA fila por campaña × orden (único): es la
--                               garantía de "como máximo un pedido por orden"
--                               y el registro de intentos/errores/costos.
--   tarot_feedback_respuestas   TODO feedback recibido (con o sin
--                               consentimiento). Nunca se borra ni se edita.
--   tarot_consentimientos_textos texto exacto de cada versión de consentimiento.
--   tarot_testimonios           (existente) solo recibe CANDIDATOS: respuestas
--                               con comentario y alguna autorización. Nunca se
--                               publican solas (publicado = false).
--
-- Una campaña nace en 'borrador' y en modo_envio 'simulado': no envía nada
-- hasta que alguien la activa explícitamente, y aun activa no llama a Meta
-- mientras modo_envio = 'simulado'. Ver docs/product/DECISIONS.md 2026-10-19.
-- ============================================================================

-- ── Campañas ────────────────────────────────────────────────────────────────
create table if not exists tarot_campanas (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  nombre                    text not null,
  tipo                      text not null
                            check (tipo in ('feedback_experiencia', 'reactivacion', 'abandono', 'lanzamiento', 'comunicacion')),
  descripcion               text,
  estado                    text not null default 'borrador'
                            check (estado in ('borrador', 'activa', 'pausada', 'finalizada')),
  canal                     text not null default 'whatsapp' check (canal in ('whatsapp', 'email')),
  -- 'simulado': procesa todo (candidatos, tokens, métricas) pero NUNCA llama
  -- al proveedor. 'real': envía de verdad. Default seguro: simulado.
  modo_envio                text not null default 'simulado' check (modo_envio in ('simulado', 'real')),
  -- Reglas editables (ver tarot_campana_feedback_candidatos para las claves)
  audiencia                 jsonb not null default '{}'::jsonb,
  disparador                jsonb not null default '{}'::jsonb,
  mensaje                   jsonb not null default '{}'::jsonb,
  -- Ventana horaria de envío (hora local de la zona). Fuera de ella los
  -- pendientes esperan, no se pierden.
  ventana_horaria           jsonb not null default '{"desde": 10, "hasta": 21, "zona": "America/Montevideo"}'::jsonb,
  limite_diario             integer not null default 50 check (limite_diario > 0),
  max_intentos              integer not null default 3 check (max_intentos between 1 and 10),
  -- Costos. Estimado = configurable por envío (Meta no devuelve el importe
  -- por mensaje); real = cargado desde la facturación del proveedor.
  costo_estimado_por_envio  numeric(12,4) check (costo_estimado_por_envio is null or costo_estimado_por_envio >= 0),
  costo_moneda              text not null default 'USD',
  costo_proveedor           text not null default 'meta_whatsapp',
  costo_real_total          numeric(12,4) check (costo_real_total is null or costo_real_total >= 0),
  costo_real_fuente         text,
  costo_real_actualizado_at timestamptz,
  -- Ciclo de vida
  activada_at               timestamptz,
  pausada_at                timestamptz,
  finalizada_at             timestamptz,
  ultima_ejecucion_at       timestamptz,
  ultima_ejecucion_resumen  jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  creado_por                text not null default 'system',
  actualizado_por           text,
  -- Toda campaña activa tiene costo estimado definido.
  constraint chk_tarot_campanas_activa_con_costo check (estado <> 'activa' or costo_estimado_por_envio is not null)
);

-- ── Envíos (uno por campaña × orden) ────────────────────────────────────────
create table if not exists tarot_campana_envios (
  id                   uuid primary key default gen_random_uuid(),
  campana_id           uuid not null references tarot_campanas(id) on delete restrict,
  orden_id             uuid not null references tarot_ordenes(id) on delete restrict,
  cliente_id           uuid references tarot_clientes(id) on delete set null,
  estado               text not null default 'pendiente'
                       check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'descartado')),
  motivo_disparo       text check (motivo_disparo in ('apertura', 'fallback_entrega')),
  entregada_at         timestamptz,   -- entrega de la lectura (acceso web creado)
  abierta_at           timestamptz,   -- primera apertura de /lectura al encolar
  programado_para      timestamptz,
  intentos             integer not null default 0,
  ultimo_intento_at    timestamptz,
  ultimo_error         text,
  simulado             boolean not null default false,
  wa_message_id        text,
  whatsapp_mensaje_id  uuid references tarot_whatsapp_mensajes(id) on delete set null,
  enviado_at           timestamptz,
  -- Link de la mini web: solo el hash; el token crudo viaja únicamente en el mensaje.
  token_hash           text unique,
  token_expira_at      timestamptz,
  primera_visita_at    timestamptz,
  visitas              integer not null default 0,
  respondido_at        timestamptz,
  costo_estimado       numeric(12,4),
  costo_real           numeric(12,4),
  costo_moneda         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_tarot_campana_envios_orden unique (campana_id, orden_id)
);
create index if not exists idx_tarot_campana_envios_cola
  on tarot_campana_envios (campana_id, estado, programado_para);

-- ── Textos de consentimiento versionados ────────────────────────────────────
create table if not exists tarot_consentimientos_textos (
  version        text primary key,             -- ej. 'feedback_sitio_v1'
  tipo           text not null check (tipo in ('sitio', 'difusion')),
  texto          text not null,
  vigente_desde  timestamptz not null default now(),
  vigente        boolean not null default true
);
insert into tarot_consentimientos_textos (version, tipo, texto) values
  ('feedback_sitio_v1', 'sitio',
   'Autorizo a Tu Oráculo a publicar esta opinión como testimonio en su sitio web.'),
  ('feedback_difusion_v1', 'difusion',
   'Autorizo a Tu Oráculo a utilizar esta opinión en piezas de comunicación y campañas de difusión de la marca.')
on conflict (version) do nothing;

-- ── Testimonios: vínculo con el feedback y consentimiento de difusión ───────
alter table tarot_testimonios add column if not exists autoriza_difusion boolean not null default false;
alter table tarot_testimonios add column if not exists autoriza_difusion_at timestamptz;
alter table tarot_testimonios add column if not exists campana_id uuid references tarot_campanas(id) on delete set null;
alter table tarot_testimonios add column if not exists feedback_respuesta_id uuid;

-- ── Respuestas de feedback (todas) ──────────────────────────────────────────
create table if not exists tarot_feedback_respuestas (
  id                          uuid primary key default gen_random_uuid(),
  envio_id                    uuid not null unique references tarot_campana_envios(id) on delete restrict,
  campana_id                  uuid not null references tarot_campanas(id) on delete restrict,
  orden_id                    uuid references tarot_ordenes(id) on delete set null,
  cliente_id                  uuid references tarot_clientes(id) on delete set null,
  rating                      smallint not null check (rating between 1 and 5),
  comentario                  text check (comentario is null or char_length(comentario) <= 600),
  -- Identidad pública vigente al responder: SIEMPRE "Nombre + inicial".
  identidad_publica           text not null,
  consentimiento_sitio         boolean not null default false,
  consentimiento_sitio_at      timestamptz,
  consentimiento_sitio_version text references tarot_consentimientos_textos(version),
  consentimiento_difusion         boolean not null default false,
  consentimiento_difusion_at      timestamptz,
  consentimiento_difusion_version text references tarot_consentimientos_textos(version),
  testimonio_id               uuid references tarot_testimonios(id) on delete set null,
  user_agent                  text,
  created_at                  timestamptz not null default now()
);
create index if not exists idx_tarot_feedback_respuestas_campana on tarot_feedback_respuestas (campana_id, created_at desc);

alter table tarot_testimonios drop constraint if exists tarot_testimonios_feedback_respuesta_id_fkey;
alter table tarot_testimonios
  add constraint tarot_testimonios_feedback_respuesta_id_fkey
  foreign key (feedback_respuesta_id) references tarot_feedback_respuestas(id) on delete set null;
create unique index if not exists uq_tarot_testimonios_feedback
  on tarot_testimonios (feedback_respuesta_id) where feedback_respuesta_id is not null;

alter table tarot_campanas enable row level security;
alter table tarot_campana_envios enable row level security;
alter table tarot_feedback_respuestas enable row level security;
alter table tarot_consentimientos_textos enable row level security;
-- Sin policies: acceso solo con service_role (Next server-side y Edge Functions).

-- updated_at
create or replace function tarot_campanas_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_tarot_campanas_touch on tarot_campanas;
create trigger trg_tarot_campanas_touch before update on tarot_campanas
  for each row execute function tarot_campanas_touch();
drop trigger if exists trg_tarot_campana_envios_touch on tarot_campana_envios;
create trigger trg_tarot_campana_envios_touch before update on tarot_campana_envios
  for each row execute function tarot_campanas_touch();

-- ── Candidatos de "Feedback de experiencia" ─────────────────────────────────
-- Devuelve las órdenes elegibles TODAVÍA NO encoladas en la campaña, con su
-- momento programado y si ya venció:
--   · abrió /lectura (first_opened_at) dentro de las primeras
--     horas_fallback_entrega desde la entrega → apertura + horas_desde_apertura
--   · si no → entrega + horas_fallback_entrega
-- Nunca ambas: la fila de tarot_campana_envios es única por campaña × orden.
--
-- audiencia (jsonb, todas opcionales):
--   tipos_orden ["venta","cortesia"] · incluir_cobro_manual false ·
--   incluir_entregas_simuladas false · excluir_telefonos_prueba true ·
--   excluir_qa true · solo_ordenes_qa false · excluir_con_reclamo true ·
--   entregadas_desde (timestamptz) · dias_entre_envios_por_cliente 30
-- disparador: horas_desde_apertura 24 · horas_fallback_entrega 48 ·
--   max_dias_desde_entrega 30
create or replace function tarot_campana_feedback_candidatos(p_campana_id uuid, p_ahora timestamptz default now())
returns table (
  orden_id uuid, cliente_id uuid, telefono text,
  entregada_at timestamptz, abierta_at timestamptz,
  motivo text, programado_para timestamptz, vencido boolean
)
language sql stable
as $$
  with c as (select * from tarot_campanas where id = p_campana_id),
  cfg as (
    select
      coalesce(c.audiencia->'tipos_orden', '["venta","cortesia"]'::jsonb)                 as tipos,
      coalesce((c.audiencia->>'incluir_cobro_manual')::boolean, false)                   as inc_manual,
      coalesce((c.audiencia->>'incluir_entregas_simuladas')::boolean, false)             as inc_sim,
      coalesce((c.audiencia->>'excluir_telefonos_prueba')::boolean, true)                as excl_prueba,
      coalesce((c.audiencia->>'excluir_qa')::boolean, true)                              as excl_qa,
      coalesce((c.audiencia->>'solo_ordenes_qa')::boolean, false)                        as solo_qa,
      coalesce((c.audiencia->>'excluir_con_reclamo')::boolean, true)                     as excl_reclamo,
      nullif(c.audiencia->>'entregadas_desde', '')::timestamptz                          as desde,
      coalesce((c.audiencia->>'dias_entre_envios_por_cliente')::int, 30)                 as dias_cliente,
      coalesce((c.disparador->>'horas_desde_apertura')::double precision, 24)            as h_ap,
      coalesce((c.disparador->>'horas_fallback_entrega')::double precision, 48)          as h_fb,
      coalesce((c.disparador->>'max_dias_desde_entrega')::int, 30)                       as max_dias
    from c
  ),
  prueba as (
    select array(
      select regexp_replace(x, '\D', '', 'g')
      from unnest(string_to_array(coalesce(
        (select valor from tarot_configuracion where clave = 'whatsapp_numeros_autorizados_prueba'), ''), ',')) x
      where btrim(x) <> ''
    ) as nums
  ),
  base as (
    select
      o.id as orden_id, o.cliente_id, o.telefono_snapshot as telefono,
      a.created_at as entregada_at, a.first_opened_at as abierta_at,
      (
        o.nombre_snapshot ilike 'qa %' or o.nombre_snapshot ilike 'qa'
        or coalesce(o.pregunta_usuario, '') ilike '%[qa%'
        or coalesce(o.utm_source, '') = 'qa'
        or exists (
          select 1 from tarot_codigos_descuento_usos u
          join tarot_codigos_descuento d on d.id = u.codigo_id
          where u.orden_id = o.id and coalesce(d.campania, '') ilike 'qa%'
        )
      ) as es_qa
    from tarot_ordenes o
    join tarot_accesos_web a on a.orden_id = o.id
    cross join cfg
    where o.estado = any (case when cfg.inc_sim then array['entregado', 'entregado_simulado'] else array['entregado'] end)
      and cfg.tipos ? o.tipo_orden
      and o.telefono_snapshot is not null
      and exists (select 1 from tarot_lecturas l where l.orden_id = o.id and l.estado = 'completada')
      and (cfg.inc_manual or not exists (select 1 from tarot_pagos p where p.orden_id = o.id and p.cobro_manual))
      and (not cfg.excl_reclamo or not coalesce(o.has_complaint, false))
      and (cfg.desde is null or a.created_at >= cfg.desde)
      and a.created_at >= p_ahora - make_interval(days => cfg.max_dias)
      and not exists (select 1 from tarot_campana_envios e where e.campana_id = p_campana_id and e.orden_id = o.id)
  ),
  calc as (
    select b.*,
      case when b.abierta_at is not null and b.abierta_at <= b.entregada_at + make_interval(secs => cfg.h_fb * 3600)
           then 'apertura' else 'fallback_entrega' end as motivo,
      case when b.abierta_at is not null and b.abierta_at <= b.entregada_at + make_interval(secs => cfg.h_fb * 3600)
           then b.abierta_at + make_interval(secs => cfg.h_ap * 3600)
           else b.entregada_at + make_interval(secs => cfg.h_fb * 3600) end as programado_para
    from base b cross join cfg
  )
  select k.orden_id, k.cliente_id, k.telefono, k.entregada_at, k.abierta_at,
         k.motivo, k.programado_para, k.programado_para <= p_ahora as vencido
  from calc k cross join cfg cross join prueba
  where (case when cfg.solo_qa then k.es_qa else (not cfg.excl_qa or not k.es_qa) end)
    and (cfg.solo_qa or not cfg.excl_prueba
         or not (regexp_replace(k.telefono, '\D', '', 'g') = any (prueba.nums)))
    and not exists (
      select 1 from tarot_campana_envios e2
      join tarot_ordenes o2 on o2.id = e2.orden_id
      where e2.campana_id = p_campana_id and e2.estado = 'enviado'
        and o2.telefono_snapshot = k.telefono
        and e2.enviado_at > p_ahora - make_interval(days => cfg.dias_cliente)
    );
$$;

-- ── Visita a la mini web (idempotente para primera_visita_at) ───────────────
create or replace function tarot_feedback_visita(p_token_hash text)
returns jsonb
language plpgsql
as $$
declare
  e tarot_campana_envios%rowtype;
  primera boolean;
begin
  select * into e from tarot_campana_envios where token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  if e.token_expira_at is not null and e.token_expira_at < now() then
    return jsonb_build_object('estado', 'expirado');
  end if;
  primera := e.primera_visita_at is null;
  update tarot_campana_envios
     set visitas = visitas + 1,
         primera_visita_at = coalesce(primera_visita_at, now())
   where id = e.id;
  if primera then
    insert into funnel_events (order_id, event_name, product_id, product_name, path, metadata)
    values (e.orden_id, 'feedback_view', 'tarot_campanas', 'Campaña de feedback', '/opinion',
            jsonb_build_object('campana_id', e.campana_id, 'envio_id', e.id));
  end if;
  return jsonb_build_object('estado', case when e.respondido_at is not null then 'respondido' else 'ok' end,
                            'envio_id', e.id, 'orden_id', e.orden_id, 'campana_id', e.campana_id);
end;
$$;

-- ── Registro de una respuesta (atómico e idempotente) ───────────────────────
-- Toda respuesta es feedback. Solo si hay comentario Y alguna autorización
-- se crea un CANDIDATO en tarot_testimonios (publicado = false): publicar es
-- siempre una decisión del admin.
create or replace function tarot_feedback_registrar(
  p_token_hash text, p_rating integer, p_comentario text,
  p_sitio boolean, p_difusion boolean, p_identidad text,
  p_version_sitio text, p_version_difusion text, p_user_agent text
) returns jsonb
language plpgsql
as $$
declare
  e tarot_campana_envios%rowtype;
  r_id uuid;
  t_id uuid;
  coment text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('estado', 'rating_invalido');
  end if;
  select * into e from tarot_campana_envios where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  if e.token_expira_at is not null and e.token_expira_at < now() then
    return jsonb_build_object('estado', 'expirado');
  end if;
  select id into r_id from tarot_feedback_respuestas where envio_id = e.id;
  if r_id is not null then
    return jsonb_build_object('estado', 'ya_respondida', 'respuesta_id', r_id);
  end if;

  insert into tarot_feedback_respuestas (
    envio_id, campana_id, orden_id, cliente_id, rating, comentario, identidad_publica,
    consentimiento_sitio, consentimiento_sitio_at, consentimiento_sitio_version,
    consentimiento_difusion, consentimiento_difusion_at, consentimiento_difusion_version,
    user_agent
  ) values (
    e.id, e.campana_id, e.orden_id, e.cliente_id, p_rating, left(coment, 600), p_identidad,
    coalesce(p_sitio, false), case when p_sitio then now() end, p_version_sitio,
    coalesce(p_difusion, false), case when p_difusion then now() end, p_version_difusion,
    left(p_user_agent, 300)
  ) returning id into r_id;

  if coment is not null and (coalesce(p_sitio, false) or coalesce(p_difusion, false)) then
    insert into tarot_testimonios (
      orden_id, cliente_id, opinion, puntuacion, nombre, ciudad,
      autoriza_publicacion, autoriza_publicacion_at, autoriza_difusion, autoriza_difusion_at,
      publicado, canal, estado_encuesta, respondida_at, campana_id, feedback_respuesta_id
    ) values (
      e.orden_id, e.cliente_id, left(coment, 600), p_rating, p_identidad, null,
      coalesce(p_sitio, false), case when p_sitio then now() end,
      coalesce(p_difusion, false), case when p_difusion then now() end,
      false, 'whatsapp', 'respondida', now(), e.campana_id, r_id
    )
    on conflict do nothing
    returning id into t_id;
    if t_id is not null then
      update tarot_feedback_respuestas set testimonio_id = t_id where id = r_id;
    end if;
  end if;

  update tarot_campana_envios set respondido_at = now() where id = e.id;

  insert into funnel_events (order_id, event_name, product_id, product_name, path, metadata)
  values (e.orden_id, 'feedback_submitted', 'tarot_campanas', 'Campaña de feedback', '/opinion',
          jsonb_build_object('campana_id', e.campana_id, 'rating', p_rating, 'con_comentario', coment is not null));
  if coalesce(p_sitio, false) or coalesce(p_difusion, false) then
    insert into funnel_events (order_id, event_name, product_id, product_name, path, metadata)
    values (e.orden_id, 'testimonial_authorized', 'tarot_campanas', 'Campaña de feedback', '/opinion',
            jsonb_build_object('campana_id', e.campana_id, 'sitio', coalesce(p_sitio, false),
                               'difusion', coalesce(p_difusion, false), 'candidato', t_id is not null));
  end if;

  return jsonb_build_object('estado', 'registrada', 'respuesta_id', r_id, 'testimonio_id', t_id);
end;
$$;

-- ── Métricas por campaña ────────────────────────────────────────────────────
create or replace view tarot_campanas_metricas with (security_invoker = true) as
select
  c.id as campana_id,
  count(e.id)                                                         as encolados,
  count(e.id) filter (where e.estado = 'pendiente')                   as pendientes,
  count(e.id) filter (where e.estado = 'enviado')                     as enviados,
  count(e.id) filter (where e.estado = 'enviado' and e.simulado)      as simulados,
  count(e.id) filter (where m.estado in ('entregado', 'leido'))       as entregados,
  count(e.id) filter (where m.estado = 'leido')                       as leidos,
  count(e.id) filter (where e.estado = 'error')                       as errores,
  count(e.id) filter (where e.estado = 'descartado')                  as descartados,
  count(e.id) filter (where e.primera_visita_at is not null)          as visitas,
  count(r.id)                                                         as respuestas,
  round(avg(r.rating)::numeric, 2)                                    as rating_promedio,
  count(r.id) filter (where r.rating = 1) as rating_1,
  count(r.id) filter (where r.rating = 2) as rating_2,
  count(r.id) filter (where r.rating = 3) as rating_3,
  count(r.id) filter (where r.rating = 4) as rating_4,
  count(r.id) filter (where r.rating = 5) as rating_5,
  count(r.id) filter (where r.comentario is not null)                 as con_comentario,
  count(r.id) filter (where r.consentimiento_sitio)                   as autoriza_sitio,
  count(r.id) filter (where r.consentimiento_difusion)                as autoriza_difusion,
  count(r.id) filter (where r.testimonio_id is not null)              as candidatos_testimonio,
  coalesce(sum(e.costo_estimado), 0)                                  as costo_estimado_total,
  coalesce(sum(e.costo_real), 0)                                      as costo_real_envios,
  min(e.enviado_at)                                                   as primer_envio_at
from tarot_campanas c
left join tarot_campana_envios e on e.campana_id = c.id
left join tarot_whatsapp_mensajes m on m.id = e.whatsapp_mensaje_id
left join tarot_feedback_respuestas r on r.envio_id = e.id
group by c.id;

-- ── Primera campaña (BORRADOR, modo simulado, sin costo definido) ───────────
insert into tarot_campanas (slug, nombre, tipo, descripcion, estado, modo_envio, canal, audiencia, disparador, mensaje, creado_por)
values (
  'feedback-experiencia',
  'Feedback de experiencia',
  'feedback_experiencia',
  'Invitación a valorar la experiencia 24 h después de la primera apertura de /lectura (o 48 h después de la entrega si no la abrió).',
  'borrador', 'simulado', 'whatsapp',
  '{"tipos_orden": ["venta", "cortesia"], "incluir_cobro_manual": false, "incluir_entregas_simuladas": false,
    "excluir_telefonos_prueba": true, "excluir_qa": true, "solo_ordenes_qa": false, "excluir_con_reclamo": true,
    "entregadas_desde": null, "dias_entre_envios_por_cliente": 30}'::jsonb,
  '{"horas_desde_apertura": 24, "horas_fallback_entrega": 48, "max_dias_desde_entrega": 30, "dias_validez_link": 30}'::jsonb,
  '{"template_nombre": "tu_oraculo_feedback_v1", "template_idioma": "es", "url_base": "https://tuoraculo.uy/opinion/"}'::jsonb,
  'migracion'
)
on conflict (slug) do nothing;
