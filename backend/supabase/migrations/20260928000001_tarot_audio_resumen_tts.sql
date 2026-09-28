-- Narración en audio (OpenAI TTS) del "Resumen" de la lectura.
-- Apagado por defecto (tts_activo = false): no cambia nada en producción
-- hasta que se active desde /admin/tarot/config, después de probar con el
-- panel de prueba de voz. Ver docs/product/DECISIONS.md.

ALTER TABLE tarot_lecturas
  ADD COLUMN IF NOT EXISTS audio_resumen_storage_path text,
  ADD COLUMN IF NOT EXISTS audio_resumen_estado text NOT NULL DEFAULT 'no_generado',
  ADD COLUMN IF NOT EXISTS audio_resumen_voz text,
  ADD COLUMN IF NOT EXISTS audio_resumen_error text,
  ADD COLUMN IF NOT EXISTS audio_resumen_generado_at timestamptz;

COMMENT ON COLUMN tarot_lecturas.audio_resumen_estado IS
  'no_generado | generando | listo | error — estado del audio narrado del resumen (TTS OpenAI, opcional, nunca bloquea la entrega).';

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tts_activo',
  'false',
  'boolean',
  'Activa la generación automática de audio narrado (TTS OpenAI) del Resumen para lecturas nuevas. false = no se genera nada (comportamiento actual).',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tts_modelo',
  'gpt-4o-mini-tts',
  'string',
  'Modelo de OpenAI para generar el audio narrado del Resumen.',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tts_voz',
  'nova',
  'string',
  'Voz de OpenAI TTS. Opciones válidas: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse.',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tts_instrucciones',
  'Habla en español rioplatense (Uruguay), tono cálido, cercano y sereno, como una segunda opinión de confianza. Ritmo pausado, sin sonar robótico.',
  'string',
  'Instrucciones de tono/acento para el modelo de TTS (parámetro "instructions" de OpenAI).',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tts_velocidad',
  '1.0',
  'number',
  'Velocidad de habla del TTS (parámetro "speed" de OpenAI). Rango 0.25–4.0, 1.0 = normal.',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;
