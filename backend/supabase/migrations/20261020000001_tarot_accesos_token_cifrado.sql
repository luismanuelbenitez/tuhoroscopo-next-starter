-- Handoff /tarot/gracias → /lectura (2026-10-20).
--
-- Copia CIFRADA del token público de /lectura, para que /tarot/gracias pueda
-- llevar a la persona directo a su lectura sin generar un token nuevo (que
-- invalidaría el link ya enviado por WhatsApp/email).
--
--   · AES-256-GCM, clave SOLO en Supabase Secrets (TAROT_ACCESO_CIFRADO_KEY),
--     con el orden_id como dato asociado (el cifrado no sirve para otra orden).
--   · La escribe _shared/tarot-accesos.ts → crearAccesoWeb() junto con el hash.
--   · La lee SOLO ef_tarot_acceso_gracias, que además exige: lectura
--     completada, acceso activo y vigente, y que el token descifrado coincida
--     con token_hash (si el acceso se regeneró por otra vía, no coincide y no
--     se entrega nada). Esa función solo se invoca desde
--     /api/tarot/acceso-lectura tras validar el handoff efímero del navegador
--     (cookie sellada, 6 h, atada a la orden). La referencia TAROT-… sola
--     nunca alcanza para obtener el link.
--   · Nunca se expone en APIs administrativas (las consultas existentes
--     seleccionan columnas explícitas).
-- Órdenes anteriores quedan con NULL: /gracias degrada a "Revisá tu WhatsApp".
alter table tarot_accesos_web add column if not exists token_cifrado text;

comment on column tarot_accesos_web.token_cifrado is
  'Token público de /lectura cifrado (AES-256-GCM, clave en Supabase Secrets, AAD = orden_id). Solo lo lee ef_tarot_acceso_gracias. NULL en accesos anteriores al 2026-10-20.';
