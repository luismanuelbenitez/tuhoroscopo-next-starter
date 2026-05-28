-- ================================================================
-- SEEDS BASE: mazo, tipo de tirada, posiciones y configuración
-- ================================================================

INSERT INTO tarot_mazos (id, nombre, nombre_corto, descripcion, anio_publicacion, dominio_publico, licencia, activo)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Rider-Waite-Smith', 'RWS',
  'El mazo de tarot más popular del mundo. Publicado en 1909 por Arthur Edward Waite con ilustraciones de Pamela Colman Smith. Sus imágenes son de dominio público.',
  1909, true, 'public_domain', true
);

INSERT INTO tarot_tipos_tirada (id, nombre, slug, descripcion, cantidad_cartas, activa, orden_display)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'Tirada Cósmica de 5 Cartas', 'cosmica_5',
  'Tirada premium de 5 posiciones. Explora situación actual, obstáculo, base inconsciente, consejo práctico y tendencia próxima.',
  5, true, 1
);

INSERT INTO tarot_posiciones_tirada (tipo_tirada_id, numero, nombre, descripcion, icono) VALUES
  ('b1000000-0000-0000-0000-000000000001', 1, 'Situación actual',    'Dónde estás parado hoy. La energía dominante de tu momento presente.',                              '🌟'),
  ('b1000000-0000-0000-0000-000000000001', 2, 'Obstáculo / desafío', 'Lo que se interpone en tu camino. El bloqueo o resistencia que debés trabajar.',                   '⚡'),
  ('b1000000-0000-0000-0000-000000000001', 3, 'Base inconsciente',   'La energía profunda que subyace a la situación. Lo que opera desde adentro sin que lo veas.',      '🌱'),
  ('b1000000-0000-0000-0000-000000000001', 4, 'Consejo práctico',    'La acción concreta que la tirada te sugiere. El paso que podés dar hoy.',                          '🔮'),
  ('b1000000-0000-0000-0000-000000000001', 5, 'Tendencia próxima',   'La energía que se acerca si continuás en este camino. El horizonte más probable.',                 '✨');

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo) VALUES
  ('precio_base_uyu',          '590',                                   'number',  'Precio en pesos uruguayos',                           false, true),
  ('precio_base_ars',          '4900',                                  'number',  'Precio en pesos argentinos',                          false, true),
  ('moneda_default',           'UYU',                                   'string',  'Moneda por defecto del módulo',                       false, true),
  ('ia_modelo',                'claude-sonnet-4-6',                     'string',  'Modelo de IA activo para generación de lecturas',     false, true),
  ('ia_max_tokens',            '4000',                                  'number',  'Máximo de tokens en la respuesta de la IA',           false, true),
  ('ia_temperatura',           '0.8',                                   'number',  'Temperatura de generación (0.0 a 1.0)',               false, true),
  ('mazo_default',             'a1000000-0000-0000-0000-000000000001',  'string',  'UUID del mazo activo por defecto',                    false, true),
  ('tipo_tirada_default',      'b1000000-0000-0000-0000-000000000001',  'string',  'UUID del tipo de tirada por defecto',                 false, true),
  ('max_reintentos_lectura',   '3',                                     'number',  'Reintentos antes de error crítico en generación IA',  false, true),
  ('max_reintentos_pdf',       '2',                                     'number',  'Reintentos de generación de PDF',                    false, true),
  ('max_reintentos_wa',        '3',                                     'number',  'Reintentos de envío por WhatsApp',                   false, true),
  ('wa_proveedor',             'twilio',                                'string',  'Proveedor de WhatsApp activo',                       false, true),
  ('storage_bucket_assets',    'tarot-assets',                          'string',  'Bucket de Storage para imágenes de cartas',          false, true),
  ('storage_bucket_pdfs',      'tarot-pdfs',                            'string',  'Bucket de Storage para PDFs generados',              false, true),
  ('pdf_url_expiracion_horas', '48',                                    'number',  'Horas de validez de URL firmada del PDF',            false, true),
  ('version_terminos',         'v1.0',                                  'string',  'Versión actual de los Términos y Condiciones',       false, true),
  ('mp_modo',                  'sandbox',                               'string',  'Modo Mercado Pago: sandbox o production',            false, true),
  ('pdf_plantilla_activa',     'v1',                                    'string',  'Versión de plantilla PDF activa',                    false, true);
