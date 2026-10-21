-- ID de la cuenta de WhatsApp Business (WABA) de Tu Oráculo (2026-10-21).
-- Lo necesita la plantilla de reapertura (message_templates). En Graph v26
-- ya no se puede leer desde el número (campo whatsapp_business_account
-- eliminado) y el token no lista target_ids; el valor sale de entry[0].id de
-- los webhooks de Meta (idéntico en todos). No es un secreto.
insert into tarot_configuracion (clave, valor) values ('whatsapp_waba_id', '592174597247148')
on conflict (clave) do update set valor = excluded.valor;
