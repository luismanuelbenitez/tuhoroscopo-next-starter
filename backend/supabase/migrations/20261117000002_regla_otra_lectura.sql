-- 2026-11-17 · Botón "¿Querés hacer otra lectura?" con precio especial (Manuel).
--
-- Decisiones de Manuel: próxima lectura a $590 (precio normal $690), código
-- ya cargado desde el botón, válido 2 semanas desde la entrega de la lectura,
-- el checkout muestra el precio especial desde que entra (opción A).
--
-- 1) Las reglas comerciales pueden tener un precio especial fijo en pesos
--    (además del porcentaje). Si está, manda: el cupón pasa a "precio_fijo".
-- 2) Regla "otra_lectura" (código fijo LECTURAVIP) + su cupón.
-- No toca la regla del VIP (lectura vencida): ese cambio va aparte, al publicar.

alter table public.tarot_reglas_comerciales
  add column if not exists precio_fijo_uyu numeric
  check (precio_fijo_uyu is null or precio_fijo_uyu > 0);

comment on column public.tarot_reglas_comerciales.precio_fijo_uyu is
  'Precio especial fijo en pesos uruguayos. Si no es null manda sobre el porcentaje y el cupón queda tipo precio_fijo.';

insert into public.tarot_reglas_comerciales
  (clave, nombre, descripcion, tipo, activa, porcentaje, codigo, formato_codigo, precio_fijo_uyu,
   vigencia_horas, vence_el, max_usos_por_cliente, campania, textos, decidido_por, decidido_at, actualizado_por)
values (
  'otra_lectura',
  'Otra lectura a precio especial (botón de la lectura)',
  'Al final de cada lectura, el botón "¿Querés hacer otra lectura?" ofrece la próxima a precio especial durante 2 semanas desde la entrega. El código va cargado desde el botón y el checkout muestra el precio especial desde que entra. Pasado el plazo, el botón vuelve a precio normal. La clienta no ve porcentajes y nunca se dice "por ser clienta".',
  'codigo_fijo', true, 14.49, 'LECTURAVIP', null, 590,
  336, null, 2, 'otra-lectura',
  jsonb_build_object(
    'eyebrow', 'Algo especial para vos',
    'titulo',  'Tu próxima lectura, a precio especial',
    'cuerpo',  'Cada pregunta abre una nueva mirada.',
    'boton',   'Hacer mi próxima lectura',
    'pie',     'Tu precio especial ya viene cargado al pagar.'
  ),
  'Manuel', now(), 'claude'
)
on conflict (clave) do nothing;

insert into public.tarot_reglas_comerciales_historial (clave, por, nota, cambios)
select 'otra_lectura', 'Manuel',
  'Regla creada (17/11): próxima lectura a $590 desde el botón de la lectura, 2 semanas desde la entrega, máx. 2 usos por clienta. "Precio de lectura vencida full price": el VIP se apaga aparte.',
  jsonb_build_object('precio_fijo_uyu', jsonb_build_array(null, 590), 'vigencia_horas', jsonb_build_array(null, 336))
where not exists (select 1 from public.tarot_reglas_comerciales_historial where clave = 'otra_lectura');

insert into public.tarot_codigos_descuento
  (codigo, descripcion, tipo_descuento, valor_descuento, precio_fijo_uyu, monedas_aplicables,
   fecha_inicio, fecha_fin, max_usos_total, max_usos_por_cliente, campania, canal, activo, creado_por, metadata)
select 'LECTURAVIP', 'Regla comercial: Otra lectura a precio especial (botón de la lectura)', 'precio_fijo', null, 590, array['UYU'],
  now(), null, null, 2, 'otra-lectura', 'web', true, 'regla_comercial', jsonb_build_object('regla', 'otra_lectura')
where not exists (select 1 from public.tarot_codigos_descuento where codigo = 'LECTURAVIP');
