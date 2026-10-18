-- Órdenes de cortesía / gratuitas (2026-10-18).
--
-- Un código de descuento puede habilitar EXPLÍCITAMENTE una orden gratuita.
-- No alcanza con que el descuento llegue a 100%: tiene que tener
-- habilita_orden_gratuita = true (y entonces SÍ o SÍ es porcentaje 100).
-- Esa orden no pasa por Mercado Pago: no hay preferencia, ni payment_id, ni
-- fila en tarot_pagos, ni registro de facturación. Entra al mismo pipeline
-- de generación/entrega que una compra cobrada (ver
-- ef_tarot_crear_orden → ejecutarPipelinePostCobro con esCortesia).
--
-- tarot_ordenes.tipo_orden describe la NATURALEZA COMERCIAL de la orden
-- ('venta' = se cobró o se va a cobrar; 'cortesia' = sin cargo). Es
-- independiente de tarot_ordenes.estado, que describe el AVANCE del
-- pipeline: una cortesía recorre los mismos estados (pago_confirmado →
-- generando_lectura → … → entregado) porque toda la cadena de entrega se
-- engancha en ellos. Métricas comerciales (ventas, ingresos, CAC,
-- compradores, Purchase) excluyen tipo_orden = 'cortesia'.

alter table tarot_codigos_descuento
  add column if not exists habilita_orden_gratuita boolean not null default false;

comment on column tarot_codigos_descuento.habilita_orden_gratuita is
  'Si es true, el código genera una orden de cortesía ($0) sin pasar por Mercado Pago. Solo válido con porcentaje 100.';

alter table tarot_codigos_descuento
  drop constraint if exists chk_orden_gratuita_porcentaje_100;
alter table tarot_codigos_descuento
  add constraint chk_orden_gratuita_porcentaje_100
  check (not habilita_orden_gratuita or (tipo_descuento = 'porcentaje' and valor_descuento = 100));

alter table tarot_ordenes
  add column if not exists tipo_orden text not null default 'venta';

comment on column tarot_ordenes.tipo_orden is
  'venta = compra normal (Mercado Pago o cobro manual); cortesia = orden gratuita habilitada por un código con habilita_orden_gratuita. No computa como venta ni revenue.';

alter table tarot_ordenes
  drop constraint if exists chk_tarot_ordenes_tipo_orden;
alter table tarot_ordenes
  add constraint chk_tarot_ordenes_tipo_orden
  check (tipo_orden in ('venta', 'cortesia'));

-- Una cortesía es siempre $0: nunca puede quedar con importe.
alter table tarot_ordenes
  drop constraint if exists chk_tarot_ordenes_cortesia_importe_cero;
alter table tarot_ordenes
  add constraint chk_tarot_ordenes_cortesia_importe_cero
  check (tipo_orden <> 'cortesia' or precio_cobrado = 0);

create index if not exists idx_tarot_ordenes_cortesia
  on tarot_ordenes (created_at desc)
  where tipo_orden = 'cortesia';
