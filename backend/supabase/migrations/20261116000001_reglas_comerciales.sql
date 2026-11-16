-- Reglas comerciales (2026-11-16, pedido de Manuel): cada beneficio que se le
-- ofrece a una clienta queda documentado, es configurable desde el admin
-- (Admin → Ventas y cobros → Reglas comerciales) y muestra su evidencia
-- (códigos generados, usos, ventas). Los nombres de los códigos nunca llevan
-- el porcentaje (VOLVE20 → VIP): un número invita a pensar que hay más.
--
-- Tipos:
--   codigo_fijo     → un código compartido (ej. VIP en la pantalla de lectura vencida).
--   codigo_personal → un código por clienta, formato con {NOMBRE} (ej. CAMILAVIP).
-- La regla manda; el cupón en tarot_codigos_descuento es su ejecución
-- (se vincula por campania = tarot_reglas_comerciales.campania).

create table if not exists public.tarot_reglas_comerciales (
  clave                 text primary key,
  nombre                text not null,
  descripcion           text not null,
  tipo                  text not null check (tipo in ('codigo_fijo', 'codigo_personal')),
  activa                boolean not null default true,
  porcentaje            numeric(5,2) not null check (porcentaje > 0 and porcentaje < 100),
  codigo                text,
  formato_codigo        text,
  vigencia_horas        integer check (vigencia_horas is null or vigencia_horas > 0),
  vence_el              timestamptz,
  max_usos_por_cliente  integer not null default 1 check (max_usos_por_cliente > 0),
  campania              text not null,
  textos                jsonb not null default '{}'::jsonb,
  decidido_por          text not null default 'Manuel',
  decidido_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  actualizado_por       text,
  check (tipo <> 'codigo_fijo' or codigo is not null),
  check (tipo <> 'codigo_personal' or (formato_codigo is not null and formato_codigo like '%{NOMBRE}%'))
);

create table if not exists public.tarot_reglas_comerciales_historial (
  id          uuid primary key default gen_random_uuid(),
  clave       text not null references public.tarot_reglas_comerciales(clave) on delete cascade,
  fecha       timestamptz not null default now(),
  por         text not null,
  nota        text not null,
  cambios     jsonb not null default '{}'::jsonb
);
create index if not exists tarot_reglas_comerciales_historial_clave_idx
  on public.tarot_reglas_comerciales_historial (clave, fecha desc);

alter table public.tarot_reglas_comerciales enable row level security;
alter table public.tarot_reglas_comerciales_historial enable row level security;
revoke all on public.tarot_reglas_comerciales from anon, authenticated;
revoke all on public.tarot_reglas_comerciales_historial from anon, authenticated;

-- ── Reglas iniciales ─────────────────────────────────────────────────────────
insert into public.tarot_reglas_comerciales
  (clave, nombre, descripcion, tipo, activa, porcentaje, codigo, formato_codigo, vigencia_horas, vence_el, max_usos_por_cliente, campania, textos, decidido_por, decidido_at, actualizado_por)
values
  ('reactivacion_lectura_vencida',
   'Precio especial al volver (lectura vencida)',
   'Se muestra en la pantalla de una lectura cuyo acceso online de 30 días venció. Ofrece un precio especial para la próxima lectura con un código compartido que el checkout aplica solo. La pantalla no muestra el porcentaje: la clienta ve el precio final recién en el checkout.',
   'codigo_fijo', true, 10, 'VIP', null, null, '2027-04-30 23:59:59-03', 2,
   'reactivacion-lectura-expirada',
   jsonb_build_object(
     'eyebrow', 'Un regalo para vos',
     'titulo',  'Un precio especial para tu próxima lectura',
     'cuerpo',  'Tu acceso online venció. Si querés hacer una nueva lectura, tenés un precio especial que se aplica solo al pagar.',
     'boton',   'Quiero mi nueva lectura →',
     'pie',     'Código {CODIGO} · se aplica automáticamente'),
   'Manuel', '2026-11-16 10:30:00-03', 'claude'),
  ('segunda_lectura',
   'Segunda lectura (gesto puntual)',
   'Cuando una clienta escribe porque quiere hacer otra pregunta, se le puede ofrecer su próxima lectura con un precio especial mediante un código personal que vence a las 48 h. Es un gesto puntual, no una regla anunciada: nunca decir "por ser clienta" ni nada que suene a beneficio fijo.',
   'codigo_personal', true, 10, null, '{NOMBRE}VIP', 48, null, 2,
   'segunda_lectura',
   jsonb_build_object(
     'mensaje', 'Si querés una tirada enfocada en eso, te dejo tu próxima lectura con un precio especial (válido hasta el {VENCE}). Con este link ya tenés tus datos y el beneficio cargados: {LINK}'),
   'Manuel', '2026-11-16 10:30:00-03', 'claude')
on conflict (clave) do nothing;

insert into public.tarot_reglas_comerciales_historial (clave, fecha, por, nota, cambios)
select * from (values
  ('reactivacion_lectura_vencida', '2026-10-17 14:02:00-03'::timestamptz, 'Manuel',
   'Se crea la oferta de reactivación: VOLVE20, 20 % de descuento, mostrado en la pantalla de lectura vencida.',
   '{"codigo":"VOLVE20","porcentaje":20}'::jsonb),
  ('reactivacion_lectura_vencida', '2026-11-16 10:30:00-03'::timestamptz, 'Manuel',
   'VOLVE20 no trajo ninguna venta en un mes (0 usos). Se baja a 10 %, el código pasa a VIP (sin número: un porcentaje en el nombre invita a pensar que hay más) y la pantalla deja de mostrar el porcentaje.',
   '{"codigo":["VOLVE20","VIP"],"porcentaje":[20,10]}'::jsonb),
  ('segunda_lectura', '2026-11-16 10:00:00-03'::timestamptz, 'Manuel',
   'Primer caso: CAMILA490 ($490, 29 % de descuento) para Camila, orden a1d057ef. Fue una propuesta de Claude, demasiado generosa. Se respeta porque ya se le prometió; no se repite.',
   '{"codigo":"CAMILA490","precio":490}'::jsonb),
  ('segunda_lectura', '2026-11-16 10:30:00-03'::timestamptz, 'Manuel',
   'Regla: 10 % de descuento, código personal NOMBREVIP (sin número) por 48 h, presentado como gesto puntual y nunca "por ser clienta".',
   '{"porcentaje":10,"formato_codigo":"{NOMBRE}VIP","vigencia_horas":48}'::jsonb)
) v(clave, fecha, por, nota, cambios)
where not exists (select 1 from public.tarot_reglas_comerciales_historial h where h.clave = v.clave and h.fecha = v.fecha);

-- ── Cupón VIP (ejecución de la regla de reactivación) ────────────────────────
-- Sin tope global y 2 usos por clienta: hoy las reservas vencidas no liberan
-- el cupo (Pendientes, área técnica), así un pago fallido no bloquea el reintento.
insert into public.tarot_codigos_descuento
  (codigo, descripcion, tipo_descuento, valor_descuento, monedas_aplicables, fecha_inicio, fecha_fin,
   max_usos_total, max_usos_por_cliente, campania, canal, activo, creado_por, metadata)
select 'VIP', 'Regla comercial: precio especial al volver (lectura vencida)', 'porcentaje', 10,
       coalesce((select monedas_aplicables from public.tarot_codigos_descuento where codigo = 'VOLVE20'), array['UYU']),
       now(), '2027-04-30 23:59:59-03', null, 2, 'reactivacion-lectura-expirada', 'web', true, 'claude',
       '{"regla":"reactivacion_lectura_vencida"}'::jsonb
where not exists (select 1 from public.tarot_codigos_descuento where upper(codigo) = 'VIP');
