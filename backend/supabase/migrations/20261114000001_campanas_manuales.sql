-- ============================================================================
-- Campañas manuales — 2026-11-14 (pedido de Manuel).
--
-- Además de la campaña automática de feedback (seleccion = 'automatica'),
-- una campaña puede ser MANUAL: Manuel elige a mano a quién se le manda y la
-- dispara con un botón. Dos tipos:
--   · feedback_experiencia  → pide opinión (/opinion/<token>)
--   · cupon_descuento       → regala un código para la próxima lectura
--                              (/beneficio/<token> → checkout con el código)
--
-- Flujo de un envío manual:
--   seleccionado (elegido, todavía no se manda nada)
--   → pendiente (al disparar) → enviando → enviado | error | descartado
--
-- Solo agrega columnas, estados y funciones: la campaña automática sigue
-- igual. Envíos de PRUEBA (a tu número) quedan marcados es_prueba y no
-- cuentan en las métricas.
-- ============================================================================

-- ── Campañas ────────────────────────────────────────────────────────────────
alter table tarot_campanas drop constraint if exists tarot_campanas_tipo_check;
alter table tarot_campanas add constraint tarot_campanas_tipo_check
  check (tipo in ('feedback_experiencia', 'cupon_descuento', 'reactivacion', 'abandono', 'lanzamiento', 'comunicacion'));

alter table tarot_campanas add column if not exists seleccion text not null default 'automatica';
alter table tarot_campanas drop constraint if exists tarot_campanas_seleccion_check;
alter table tarot_campanas add constraint tarot_campanas_seleccion_check check (seleccion in ('automatica', 'manual'));
alter table tarot_campanas add column if not exists codigo_descuento_id uuid references tarot_codigos_descuento(id) on delete set null;
alter table tarot_campanas add column if not exists disparada_at timestamptz;
alter table tarot_campanas add column if not exists disparada_por text;

-- ── Envíos ──────────────────────────────────────────────────────────────────
alter table tarot_campana_envios add column if not exists es_prueba boolean not null default false;
alter table tarot_campana_envios add column if not exists telefono text;
alter table tarot_campana_envios add column if not exists nombre text;

alter table tarot_campana_envios drop constraint if exists tarot_campana_envios_estado_check;
alter table tarot_campana_envios add constraint tarot_campana_envios_estado_check
  check (estado in ('seleccionado', 'pendiente', 'enviando', 'enviado', 'error', 'descartado'));

alter table tarot_campana_envios drop constraint if exists tarot_campana_envios_motivo_disparo_check;
alter table tarot_campana_envios add constraint tarot_campana_envios_motivo_disparo_check
  check (motivo_disparo in ('apertura', 'fallback_entrega', 'manual', 'prueba'));

-- Una fila por campaña × orden, y aparte, como mucho una de prueba.
alter table tarot_campana_envios drop constraint if exists uq_tarot_campana_envios_orden;
alter table tarot_campana_envios add constraint uq_tarot_campana_envios_orden unique (campana_id, orden_id, es_prueba);

-- Número de prueba de las campañas (el de Manuel). Los envíos de prueba solo
-- pueden ir a este número.
insert into tarot_configuracion (clave, valor, tipo_valor)
select 'campanas_telefono_prueba', '+59899863263', 'string'
where not exists (select 1 from tarot_configuracion where clave = 'campanas_telefono_prueba');

-- ── Métricas: sin los envíos de prueba ni los solo seleccionados ───────────
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
left join tarot_campana_envios e
  on e.campana_id = c.id and not e.es_prueba and e.estado <> 'seleccionado'
left join tarot_whatsapp_mensajes m on m.id = e.whatsapp_mensaje_id
left join tarot_feedback_respuestas r on r.envio_id = e.id
group by c.id;

-- ── Audiencia para elegir a mano ────────────────────────────────────────────
-- Una fila por teléfono con al menos una lectura entregada: su última orden
-- entregada (a la que se asocia el envío), cuántas compras y cortesías tuvo,
-- marcas (prueba / QA / reclamo) y si ya recibió algo de campañas.
create or replace function tarot_campana_audiencia_manual(p_campana_id uuid)
returns table (
  telefono text, nombre text, cliente_id uuid, orden_id uuid,
  ultima_entrega_at timestamptz, tema text, tipo_orden text,
  ventas integer, cortesias integer,
  es_prueba boolean, es_qa boolean, con_reclamo boolean,
  estado_en_campana text, ultima_campana_at timestamptz
)
language sql stable
as $$
  with prueba as (
    select array(
      select regexp_replace(x, '\D', '', 'g')
      from unnest(string_to_array(coalesce(
        (select valor from tarot_configuracion where clave = 'whatsapp_numeros_autorizados_prueba'), ''), ',')) x
      where btrim(x) <> ''
    ) || array(
      select regexp_replace(coalesce((select valor from tarot_configuracion where clave = 'campanas_telefono_prueba'), ''), '\D', '', 'g')
    ) as nums
  ),
  ordenes as (
    select o.*, regexp_replace(o.telefono_snapshot, '\D', '', 'g') as tel_dig,
      (o.nombre_snapshot ilike 'qa %' or o.nombre_snapshot ilike 'qa'
        or coalesce(o.pregunta_usuario, '') ilike '%[qa%' or coalesce(o.utm_source, '') = 'qa') as es_qa_o
    from tarot_ordenes o
    where o.estado = 'entregado' and o.telefono_snapshot is not null
  ),
  ultima as (
    select distinct on (tel_dig) tel_dig, id, cliente_id, nombre_snapshot, tema, tipo_orden, created_at
    from ordenes order by tel_dig, created_at desc
  ),
  agg as (
    select tel_dig,
      count(*) filter (where tipo_orden = 'venta')::int    as ventas,
      count(*) filter (where tipo_orden = 'cortesia')::int as cortesias,
      bool_or(es_qa_o) as es_qa,
      bool_or(coalesce(has_complaint, false)) as con_reclamo
    from ordenes group by tel_dig
  )
  select
    '+' || u.tel_dig, u.nombre_snapshot, u.cliente_id, u.id,
    coalesce((select a.created_at from tarot_accesos_web a where a.orden_id = u.id order by a.created_at desc limit 1), u.created_at),
    u.tema, u.tipo_orden, g.ventas, g.cortesias,
    u.tel_dig = any (prueba.nums), g.es_qa, g.con_reclamo,
    (select e.estado from tarot_campana_envios e
      where e.campana_id = p_campana_id and not e.es_prueba
        and regexp_replace(coalesce(e.telefono, ''), '\D', '', 'g') = u.tel_dig
      order by e.created_at desc limit 1),
    (select max(e.enviado_at) from tarot_campana_envios e
      join tarot_ordenes o3 on o3.id = e.orden_id
      where e.estado = 'enviado' and not e.simulado and not e.es_prueba
        and regexp_replace(coalesce(e.telefono, o3.telefono_snapshot), '\D', '', 'g') = u.tel_dig)
  from ultima u join agg g using (tel_dig) cross join prueba
  order by 5 desc;
$$;

-- ── Clic en el link de un cupón (/beneficio/<token>) ────────────────────────
-- Igual que tarot_feedback_visita pero para campañas de cupón: registra la
-- visita (idempotente para la primera) y devuelve el código a aplicar.
create or replace function tarot_campana_visita(p_token_hash text)
returns jsonb
language plpgsql
as $$
declare
  e tarot_campana_envios%rowtype;
  c tarot_campanas%rowtype;
  cod text;
  primera boolean;
begin
  select * into e from tarot_campana_envios where token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  select * into c from tarot_campanas where id = e.campana_id;
  select codigo into cod from tarot_codigos_descuento where id = c.codigo_descuento_id;
  if e.token_expira_at is not null and e.token_expira_at < now() then
    return jsonb_build_object('estado', 'expirado', 'slug', c.slug);
  end if;
  primera := e.primera_visita_at is null;
  update tarot_campana_envios
     set visitas = visitas + 1, primera_visita_at = coalesce(primera_visita_at, now())
   where id = e.id;
  if primera then
    insert into funnel_events (order_id, event_name, product_id, product_name, path, metadata)
    values (e.orden_id, 'campaign_click', 'tarot_campanas', 'Campaña de cupón', '/beneficio',
            jsonb_build_object('campana_id', e.campana_id, 'envio_id', e.id, 'prueba', e.es_prueba));
  end if;
  return jsonb_build_object('estado', 'ok', 'codigo', cod, 'slug', c.slug, 'tipo', c.tipo);
end;
$$;

revoke all on function tarot_campana_audiencia_manual(uuid) from public, anon, authenticated;
revoke all on function tarot_campana_visita(text) from public, anon, authenticated;
