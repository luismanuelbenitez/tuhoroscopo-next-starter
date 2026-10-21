-- Alerta "Orden trabada" (2026-10-21): pg_cron invoca cada 15 minutos
-- ef_tarot_check_ordenes_trabadas, que avisa (una vez por orden) cuando una
-- orden pagada o de cortesía lleva más de TTC_ALERTAS_TIMEOUT_MINUTOS sin
-- avanzar en un estado intermedio. Mismo patrón que tarot_campanas_runner
-- (clave interna leída de Vault). Aplicar con db query --linked -f.
select cron.unschedule('tarot_check_ordenes_trabadas')
where exists (select 1 from cron.job where jobname = 'tarot_check_ordenes_trabadas');

select cron.schedule(
  'tarot_check_ordenes_trabadas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://bckbpixlaxfxafhvlpbt.supabase.co/functions/v1/ef_tarot_check_ordenes_trabadas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'tarot_internal_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Descripción visible en el admin: ya no está "pendiente".
update tarot_alertas_config
set descripcion = 'Una orden pagada o de cortesía lleva más de 30 min sin avanzar (revisión cada 15 min)'
where tipo = 'orden_trabada';
