-- Motor de campañas: pg_cron cada 15 minutos → ef_tarot_campanas_runner.
-- (2026-10-19) Mismo patrón net.http_post que los demás jobs, pero la clave
-- interna se lee de Vault (secret 'tarot_internal_key', creado aparte con
-- vault.create_secret — nunca en el repo ni en texto plano en cron.job).
-- Con todas las campañas en borrador/pausadas el runner no hace nada.
select cron.unschedule('tarot_campanas_runner')
where exists (select 1 from cron.job where jobname = 'tarot_campanas_runner');

select cron.schedule(
  'tarot_campanas_runner',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://bckbpixlaxfxafhvlpbt.supabase.co/functions/v1/ef_tarot_campanas_runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'tarot_internal_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
