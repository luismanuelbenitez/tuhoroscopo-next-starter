-- ============================================================================
-- Reservas de códigos de descuento vencidas sin compra (2026-11-16, Manuel)
--
-- Bug: ef_tarot_validar_codigo reserva el código por 30 min y suma un uso al
-- tocar "Aplicar". Si la persona no compra, nadie liberaba la reserva: quedaba
-- "reservado" para siempre, contando en usos_actuales y en el límite por
-- cliente.
--
-- Arreglo quirúrgico, solo en la base: cada 10 min se marcan "expirado" las
-- reservas SIN orden asociada que vencieron hace más de 10 min, y se devuelve
-- el uso al cupón. Son reservas muertas: ef_tarot_crear_orden rechaza una
-- reserva vencida (CODIGO_DESCUENTO_EXPIRADO). Las que tienen orden (pago en
-- curso en Mercado Pago) no se tocan. El margen de 10 min evita cruzarse con
-- una orden que se esté creando justo al vencer. No se borra nada.
-- No toca edge functions, webhook ni checkout.
-- ============================================================================

create or replace function public.tarot_expirar_reservas_codigo()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  with vencidas as (
    update tarot_codigos_descuento_usos
       set estado_uso        = 'expirado',
           fecha_cancelacion = now(),
           updated_at        = now(),
           actualizado_por   = 'tarot_expirar_reservas_codigo',
           metadata          = coalesce(metadata, '{}'::jsonb)
                               || jsonb_build_object('motivo_liberacion', 'reserva_vencida_sin_compra')
     where estado_uso = 'reservado'
       and orden_id is null
       and fecha_expiracion < now() - interval '10 minutes'
    returning codigo_id
  ),
  por_codigo as (
    select codigo_id, count(*)::integer as n from vencidas group by codigo_id
  ),
  devueltos as (
    update tarot_codigos_descuento c
       set usos_actuales = greatest(0, c.usos_actuales - p.n),
           updated_at    = now()
      from por_codigo p
     where c.id = p.codigo_id
    returning p.n
  )
  select coalesce(sum(n), 0) into v_total from devueltos;

  return v_total;
end;
$$;

comment on function public.tarot_expirar_reservas_codigo() is
  'Expira reservas de códigos sin orden vencidas hace >10 min y devuelve el uso al cupón. pg_cron cada 10 min (2026-11-16).';

-- Programación (idempotente: mismo nombre = se actualiza).
select cron.schedule(
  'tarot_expirar_reservas_codigo',
  '*/10 * * * *',
  $$select public.tarot_expirar_reservas_codigo();$$
);
