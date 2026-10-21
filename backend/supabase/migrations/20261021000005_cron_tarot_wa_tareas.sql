-- Tareas periódicas de la bandeja de WhatsApp (2026-10-21): pg_cron invoca
-- cada 15 minutos ef_tarot_wa_tareas, que (1) copia al bucket privado la
-- media entrante que quedó pendiente (Meta la borra a los 7 días) y (2)
-- avisa por email los mensajes sin respuesta manual (alerta
-- wa_sin_responder). Mismo patrón que tarot_check_ordenes_trabadas (clave
-- interna leída de Vault). Solo PRODUCCIÓN — no aplicar en el sandbox.
-- Aplicar con db query --linked -f.
select cron.unschedule('tarot_wa_tareas')
where exists (select 1 from cron.job where jobname = 'tarot_wa_tareas');

select cron.schedule(
  'tarot_wa_tareas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://bckbpixlaxfxafhvlpbt.supabase.co/functions/v1/ef_tarot_wa_tareas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'tarot_internal_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
