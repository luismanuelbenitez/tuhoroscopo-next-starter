-- WhatsApp de Tarot: a quién se envía y tope diario de seguridad (2026-10-18).
--   whatsapp_destinos      'todos' = cualquier número; 'lista' = solo
--                          whatsapp_numeros_autorizados_prueba (también con
--                          MP en producción). Con MP en sandbox + WA en
--                          production sigue aplicando la lista (modo controlado).
--   whatsapp_limite_diario máximo de WhatsApp REALES por día (hora de
--                          Montevideo). Al alcanzarlo, la orden queda en
--                          error_whatsapp (reenviable desde el admin), se
--                          alerta y se usa el fallback por email. Los reenvíos
--                          autorizados por un admin no cuentan contra el tope.
insert into tarot_configuracion (clave, valor, descripcion, tipo_valor, es_secreto, activo)
values
  ('whatsapp_destinos', 'todos',
   'A quién se envía WhatsApp real: "todos" (cualquier número) o "lista" (solo whatsapp_numeros_autorizados_prueba). Editable desde /admin/tarot/config.',
   'string', false, true),
  ('whatsapp_limite_diario', '50',
   'Máximo de WhatsApp reales por día (hora de Montevideo). Al alcanzarlo, la orden queda en error_whatsapp, se alerta y se usa el fallback por email. Editable desde /admin/tarot/config.',
   'number', false, true)
on conflict (clave) do nothing;
