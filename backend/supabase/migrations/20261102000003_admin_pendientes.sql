-- Pendientes del negocio (2026-11-02)
--
-- Lista de tareas para retomar "en algún momento": anuncios, redes, web,
-- legal, finanzas, técnico. La alimentan Manuel (a mano), la conversión de
-- avisos de Meta Ads / Normativa (origen + origen_ref, sin duplicar) y la usan
-- el Asistente CEO (vencidos y prioridad alta) y el Analista (contexto).
-- Migración aditiva: tabla nueva, no toca datos existentes.

create table if not exists admin_pendientes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 3 and 160),
  detalle text,
  area text not null default 'otros'
    check (area in ('anuncios', 'redes', 'web', 'ventas', 'producto', 'legal', 'finanzas', 'tecnico', 'otros')),
  responsable text not null default 'manuel'
    check (responsable in ('manuel', 'claude', 'contador', 'abogado', 'otro')),
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'abierto'
    check (estado in ('abierto', 'en_curso', 'esperando', 'resuelto', 'descartado')),
  vence date,
  enlace text,
  origen text not null default 'manual' check (origen in ('manual', 'meta_ads', 'normativa', 'asistente')),
  origen_ref text unique,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resuelto_at timestamptz
);
create index if not exists idx_admin_pendientes_estado on admin_pendientes (estado, prioridad, vence);
alter table admin_pendientes enable row level security;

-- Carga inicial: pendientes al 2026-11-02 (los legales viven en Normativa).
insert into admin_pendientes (titulo, detalle, area, responsable, prioridad, vence, enlace, origen_ref) values
('Revisar si el anuncio V6 volvió a mostrarse', 'Dejó de entregar el 1/11 a las 12:17, tras editar el conjunto (se sacó Audience Network). Si sigue en cero: duplicar el conjunto optimizando a visitas a la página, sin tocar V6.', 'anuncios', 'claude', 'alta', '2026-11-03', '/admin/tarot/meta-ads', 'seed:v6_revisar'),
('Decidir qué hacer cuando termine la campaña V6', 'Termina el 8/11. Recomendado: optimizar a visitas a la página o inicio de pago, más peso a Reels, sin video in-stream ni columna derecha.', 'anuncios', 'manuel', 'media', '2026-11-08', '/admin/tarot/meta-ads', 'seed:v6_fin'),
('Subir el Reel "Una pregunta para el Tarot: amor" a Facebook', 'Publicación orgánica. Archivo: anuncios-meta/tuoraculo_pregunta_amor_v2.mp4.', 'redes', 'manuel', 'media', '2026-11-04', null, 'seed:reel_amor'),
('Subir el Reel de trabajo a Facebook', 'Publicación orgánica. Archivo: anuncios-meta/tuoraculo_pregunta_trabajo_v2.mp4.', 'redes', 'manuel', 'media', '2026-11-06', null, 'seed:reel_trabajo'),
('Revisar la campaña de Google Ads', 'Términos de búsqueda, palabras negativas y costo por clic. Ya trajo una venta (2/11).', 'anuncios', 'claude', 'media', '2026-11-10', '/admin/tarot/campanas-ads', 'seed:gads_revision'),
('Medir las compras en Google Ads', 'Conectar la conversión de compra para que Google aprenda qué búsquedas venden. Falta el ID y la etiqueta de conversión.', 'anuncios', 'manuel', 'alta', null, null, 'seed:gads_conversion'),
('Crear el Instagram nuevo de Tu Oráculo', 'Instagram bloquea la creación desde la computadora. Probar desde el celular con datos móviles y un email nuevo, o desde Meta Business Suite → Cuentas vinculadas. Usuario neutral (no ".tarot").', 'redes', 'manuel', 'media', null, null, 'seed:instagram_nuevo'),
('Guardar los códigos de recuperación de Facebook', 'Autenticación en dos pasos → Métodos adicionales → Códigos de recuperación. Guardarlos fuera del celular.', 'tecnico', 'manuel', 'alta', null, null, 'seed:fb_codigos'),
('Activar la verificación en dos pasos en Gmail', 'myaccount.google.com → Seguridad → Verificación en 2 pasos. Es la llave para recuperar Facebook.', 'tecnico', 'manuel', 'alta', null, null, 'seed:gmail_2fa'),
('Aviso en Meta Ads cuando la cuenta quede frenada por un pago', 'Mejorar el diagnóstico del panel para detectar cobros fallidos.', 'tecnico', 'claude', 'baja', null, '/admin/tarot/meta-ads', 'seed:meta_aviso_pago'),
('Cargar RESEND_API_KEY en Vercel', 'Para que el parte diario del Asistente CEO llegue por email.', 'tecnico', 'manuel', 'media', null, '/admin/tarot/asistente', 'seed:resend'),
('Informe del Analista con una semana de datos', 'Correr el Analista de conversión y completar "Contexto del negocio".', 'ventas', 'manuel', 'media', '2026-11-04', '/admin/tarot/analista', 'seed:analista_semana'),
('Bloque "Así te llega tu lectura" en trabajo y decisiones', 'Llevar a /tarot/trabajo-y-dinero y /tarot/decisiones lo que ya tiene /tarot/amor. Esperando OK.', 'web', 'claude', 'baja', null, null, 'seed:asi_te_llega'),
('Enlaces a Instagram y Facebook en el pie de la web', 'Cuando exista el Instagram nuevo: pie y datos estructurados para Google.', 'web', 'claude', 'baja', null, null, 'seed:enlaces_redes'),
('Borrar los videos viejos "POV" (v1)', 'Quedaron descartados; están en anuncios-meta.', 'otros', 'claude', 'baja', null, null, 'seed:borrar_pov'),
('Pasar Supabase a Pro', 'Cuando empiecen las ventas regulares (respaldos automáticos). Mientras tanto, respaldo manual semanal.', 'tecnico', 'manuel', 'media', null, '/admin/tarot/presupuesto', 'seed:supabase_pro'),
('Arreglo del aviso de pago duplicado de Mercado Pago', 'Fix atómico propuesto para la carrera del webhook; sin aplicar.', 'tecnico', 'claude', 'baja', null, null, 'seed:webhook_mp'),
('Expansión a México', 'Idea: primero que Uruguay venda, después LATAM (México preferido, cobro con dLocal). España postergada.', 'producto', 'manuel', 'baja', null, null, 'seed:mexico')
on conflict (origen_ref) do nothing;
