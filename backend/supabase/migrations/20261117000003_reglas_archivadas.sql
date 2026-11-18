-- 2026-11-17 · Reglas comerciales: crear y "eliminar" (Manuel).
--
-- En la práctica una regla nunca se borra: se ARCHIVA. Queda apagada, sale de
-- la vista principal del admin y sigue visible en "Archivadas" con todo su
-- historial y su evidencia. Se puede restaurar (vuelve apagada).
-- Solo agrega columnas: el código publicado las ignora.

alter table public.tarot_reglas_comerciales
  add column if not exists archivada_at timestamptz,
  add column if not exists archivada_por text;

comment on column public.tarot_reglas_comerciales.archivada_at is
  'Si no es null la regla está archivada ("eliminada" en el admin): apagada y fuera de la vista principal. Nunca se borra.';

-- Cupones de reglas: solo pesos uruguayos (Manuel 17/11: "pesos argentinos no debemos dar mucha bola").
update public.tarot_codigos_descuento
   set monedas_aplicables = array['UYU'], updated_at = now(), actualizado_por = 'regla_comercial'
 where creado_por = 'regla_comercial' and monedas_aplicables is distinct from array['UYU'];
