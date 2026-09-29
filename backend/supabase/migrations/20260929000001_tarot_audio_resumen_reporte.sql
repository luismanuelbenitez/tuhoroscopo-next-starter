-- Nutre el reporte de audio del resumen (TTS) en el detalle de orden del
-- admin, mismo nivel de detalle que ya existe para "Lectura IA": modelo
-- usado, caracteres del texto enviado (equivalente real a "tokens" — el
-- endpoint de OpenAI TTS no devuelve conteo de tokens en la respuesta,
-- a diferencia de chat completions) e intentos.

ALTER TABLE tarot_lecturas
  ADD COLUMN IF NOT EXISTS audio_resumen_modelo text,
  ADD COLUMN IF NOT EXISTS audio_resumen_caracteres integer,
  ADD COLUMN IF NOT EXISTS audio_resumen_intentos integer NOT NULL DEFAULT 0;

-- Costo estimado del audio: cargado manualmente por el usuario (mismo
-- patrón que tipo_cambio_usd_uyu) — OpenAI no expone un precio por
-- caracter/token verificable desde la respuesta de la API, así que en vez
-- de inventar un número, el admin carga acá la tasa real que ve en su
-- dashboard de OpenAI (USD por cada 1000 caracteres). Vacío por defecto:
-- el reporte muestra "No disponible" hasta que se cargue, nunca un costo
-- no verificado.
INSERT INTO tarot_configuracion (clave, valor, tipo_valor, descripcion, es_secreto, activo)
VALUES (
  'tts_costo_por_1000_caracteres_usd',
  '',
  'number',
  'Costo estimado en USD por cada 1000 caracteres de audio TTS generado. Cargar manualmente viendo el dashboard de OpenAI — no se calcula solo. Vacío = el reporte de costo muestra "No disponible".',
  false,
  true
)
ON CONFLICT (clave) DO NOTHING;
