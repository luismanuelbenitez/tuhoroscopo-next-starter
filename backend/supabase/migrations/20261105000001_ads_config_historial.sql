-- Histórico de configuración de campañas (2026-11-05). Una fila por VERSIÓN
-- de cada campaña (Meta o Google): la configuración completa mientras estuvo
-- vigente y sus resultados en ese período (plataforma + lo que midió la web).
-- La escriben las sincronizaciones de Meta y Google (solo leen las
-- plataformas): cuando la huella de la configuración cambia, se cierra la
-- versión vigente y se abre otra. Es insumo para el Estratega y análisis.

create table if not exists ads_config_historial (
  id bigserial primary key,
  plataforma text not null check (plataforma in ('meta', 'google')),
  campana_id text not null,
  campana_nombre text,
  utm_campaign text,
  version int not null,
  huella text not null,
  estado text,
  -- Configuración completa de la campaña en esta versión (campaña + conjuntos
  -- y anuncios en Meta; campaña, presupuesto, segmentación, grupos, palabras,
  -- anuncios y recursos en Google). Sin lo que cambia solo.
  config jsonb not null,
  -- Lo esencial en claro (objetivo, puja, presupuesto, público, ubicaciones…).
  resumen jsonb,
  -- Qué cambió contra la versión anterior: [{ruta, antes, despues}].
  cambios jsonb,
  -- Estado de calidad que la plataforma informa y cambia sola (nivel de
  -- calidad por palabra, fuerza del anuncio, recomendaciones, aprendizaje);
  -- se actualiza en cada lectura mientras la versión está vigente.
  diagnostico jsonb,
  vigente_desde timestamptz not null,
  vigente_hasta timestamptz,
  origen text not null default 'sync' check (origen in ('sync', 'inicial', 'reconstruida')),
  resultados jsonb,
  resultados_at timestamptz,
  -- Revisión escrita (Claude, Manuel o el Estratega).
  analisis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plataforma, campana_id, version)
);
create unique index if not exists ads_config_historial_vigente on ads_config_historial (plataforma, campana_id) where vigente_hasta is null;
create index if not exists ads_config_historial_desde on ads_config_historial (vigente_desde desc);
alter table ads_config_historial enable row level security;

-- Resultados de una versión durante su vigencia. El gasto de la plataforma es
-- por día completo (Montevideo); las visitas y ventas de la web, exactas.
create or replace function ads_historial_resultados(p_id bigint)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v ads_config_historial;
  hasta timestamptz;
  d1 date;
  d2 date;
  plat jsonb;
  web jsonb;
  tc numeric;
  v_costo numeric;
begin
  select * into v from ads_config_historial where id = p_id;
  if not found then return null; end if;
  hasta := coalesce(v.vigente_hasta, now());
  d1 := (v.vigente_desde at time zone 'America/Montevideo')::date;
  d2 := (hasta at time zone 'America/Montevideo')::date;

  if v.plataforma = 'meta' then
    select jsonb_build_object(
      'moneda', 'UYU', 'gasto', round(coalesce(sum(gasto), 0), 2), 'impresiones', coalesce(sum(impresiones), 0),
      'clics', coalesce(sum(clics), 0), 'clics_enlace', coalesce(sum(clics_enlace), 0), 'vistas_pagina', coalesce(sum(vistas_pagina), 0),
      'inicios_pago', coalesce(sum(inicios_pago), 0), 'compras_meta', coalesce(sum(compras), 0),
      'ctr_enlace_pct', round(100.0 * sum(clics_enlace) / nullif(sum(impresiones), 0), 2),
      'cpm', round(1000.0 * sum(gasto) / nullif(sum(impresiones), 0), 1),
      'costo_por_clic_enlace', round(sum(gasto) / nullif(sum(clics_enlace), 0), 1))
    into plat
    from meta_ads_rendimiento where campana_id = v.campana_id and ubicacion = 'total' and fecha between d1 and d2;
    plat := plat || jsonb_build_object('por_ubicacion', (
      select coalesce(jsonb_agg(x order by x.gasto desc), '[]'::jsonb) from (
        select ubicacion, round(sum(gasto), 2) as gasto, sum(impresiones) as impresiones, sum(clics_enlace) as clics_enlace,
               round(sum(gasto) / nullif(sum(clics_enlace), 0), 1) as costo_por_clic_enlace
        from meta_ads_rendimiento where campana_id = v.campana_id and ubicacion <> 'total' and fecha between d1 and d2
        group by ubicacion) x));
    v_costo := (plat->>'gasto')::numeric;
  else
    select jsonb_build_object(
      'moneda', 'USD', 'costo', round(coalesce(sum(costo), 0), 2), 'impresiones', coalesce(sum(impresiones), 0),
      'clics', coalesce(sum(clics), 0), 'conversiones_google', coalesce(sum(conversiones), 0),
      'ctr_pct', round(100.0 * sum(clics) / nullif(sum(impresiones), 0), 2),
      'cpc', round(sum(costo) / nullif(sum(clics), 0), 3),
      'cuota_impresiones_prom', round(avg(cuota_impresiones), 4),
      'perdida_por_ranking_prom', round(avg(perdida_por_ranking), 4),
      'perdida_por_presupuesto_prom', round(avg(perdida_por_presupuesto), 4))
    into plat
    from google_ads_rendimiento where campana_id = v.campana_id and fecha between d1 and d2;
    select nullif(valor::text, '')::numeric into tc from tarot_configuracion where clave = 'tipo_cambio_usd_uyu';
    plat := plat || jsonb_build_object('tipo_cambio', coalesce(tc, 40));
    v_costo := round((plat->>'costo')::numeric * coalesce(tc, 40), 2);
  end if;

  if v.utm_campaign is not null then
    select jsonb_build_object(
      'sesiones', count(*), 'personas', count(distinct visitor_id),
      'pct_se_van_5s', round(100.0 * count(*) filter (where seg <= 5) / nullif(count(*), 0)),
      'mediana_seg', (percentile_cont(0.5) within group (order by seg))::int,
      'vieron_producto', count(*) filter (where vio_producto),
      'checkout', count(*) filter (where checkout),
      'ventas', count(*) filter (where compro and not coalesce(cortesia, false)),
      'ingresos', coalesce(sum(orden_monto) filter (where compro and not coalesce(cortesia, false)), 0))
    into web
    from (
      select *, extract(epoch from last_seen_at - started_at) as seg
      from visitantes_sesiones_base(v.vigente_desde, hasta, false, null, null, null, null)
      where not es_interno and lower(utm_campaign) = lower(v.utm_campaign)
    ) b;
  end if;

  return jsonb_build_object(
    'desde', v.vigente_desde, 'hasta', hasta, 'vigente', v.vigente_hasta is null,
    'dias', round((extract(epoch from hasta - v.vigente_desde) / 86400.0)::numeric, 1),
    'plataforma', plat, 'web', web, 'costo_uyu', v_costo,
    'costo_por_sesion', round(v_costo / nullif((web->>'sesiones')::numeric, 0), 1),
    'costo_por_checkout', round(v_costo / nullif((web->>'checkout')::numeric, 0), 1),
    'costo_por_venta', round(v_costo / nullif((web->>'ventas')::numeric, 0), 1),
    'nota', 'Gasto de la plataforma por día completo (el día de un cambio cuenta en las dos versiones); visitas y ventas de la web exactas por hora.');
end;
$$;

-- Registra la configuración leída de una plataforma. p_campanas:
-- [{campana_id, nombre, utm_campaign, estado, huella, config, resumen, cambios, diagnostico}]
-- Si la huella cambió, cierra la versión vigente y abre otra. Siempre
-- actualiza nombre / estado / diagnóstico de la vigente y recalcula los
-- resultados de las vigentes y de las cerradas en los últimos 3 días.
create or replace function ads_historial_guardar(p_plataforma text, p_campanas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  actual ads_config_historial;
  ahora timestamptz := now();
  nuevas int := 0;
  habia boolean;
  r record;
begin
  for c in select * from jsonb_array_elements(coalesce(p_campanas, '[]'::jsonb)) loop
    select * into actual from ads_config_historial
      where plataforma = p_plataforma and campana_id = c->>'campana_id' and vigente_hasta is null
      for update;
    habia := found;
    if not habia or actual.huella is distinct from c->>'huella' then
      if habia then
        update ads_config_historial set vigente_hasta = ahora, updated_at = ahora where id = actual.id;
      end if;
      insert into ads_config_historial (plataforma, campana_id, campana_nombre, utm_campaign, version, huella, estado, config, resumen, cambios, diagnostico, vigente_desde, origen)
      values (p_plataforma, c->>'campana_id', c->>'nombre', nullif(c->>'utm_campaign', ''),
              coalesce((select max(version) from ads_config_historial where plataforma = p_plataforma and campana_id = c->>'campana_id'), 0) + 1,
              c->>'huella', c->>'estado', c->'config', c->'resumen', case when habia then c->'cambios' else null end, c->'diagnostico',
              case when habia then ahora else coalesce(nullif(c->>'desde', '')::timestamptz, ahora) end,
              case when habia then 'sync' else 'inicial' end);
      nuevas := nuevas + 1;
    else
      update ads_config_historial
        set campana_nombre = c->>'nombre', estado = c->>'estado', diagnostico = coalesce(c->'diagnostico', diagnostico),
            utm_campaign = coalesce(nullif(c->>'utm_campaign', ''), utm_campaign), updated_at = ahora
        where id = actual.id;
    end if;
  end loop;

  for r in select id from ads_config_historial
           where plataforma = p_plataforma and (vigente_hasta is null or vigente_hasta > ahora - interval '3 days') loop
    update ads_config_historial set resultados = ads_historial_resultados(r.id), resultados_at = ahora where id = r.id;
  end loop;
  return jsonb_build_object('nuevas_versiones', nuevas);
end;
$$;

revoke execute on function ads_historial_resultados(bigint) from public, anon, authenticated;
revoke execute on function ads_historial_guardar(text, jsonb) from public, anon, authenticated;
