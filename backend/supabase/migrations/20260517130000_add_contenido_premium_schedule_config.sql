-- ============================================================================
-- Migración: configuración horaria del contenido premium
-- ============================================================================
-- Agrega claves a la tabla config para centralizar los horarios de generación
-- y envío del contenido premium diario y dominical.
--
-- ZONA HORARIA:
--   Uruguay = UTC-3 (sin DST desde 2015, siempre UTC-3)
--   Los horarios en config se expresan en UTC.
--
-- TABLA config:
--   - nombre: clave única (UNIQUE constraint en config_nombre_key)
--   - valor:  string; para horarios usa formato HH:MM en UTC
--
-- ON CONFLICT (nombre) DO UPDATE:
--   Idempotente. Si la clave ya existe, actualiza el valor.
--   Seguro de re-aplicar.
-- ============================================================================

INSERT INTO public.config (nombre, valor)
VALUES
  -- Hora UTC en que se genera el contenido premium diario.
  -- 06:00 Uruguay = 09:00 UTC
  ('contenido_premium_hora_generacion',           '09:00'),

  -- Hora UTC a la que se programa el envío del contenido premium diario.
  -- 08:30 Uruguay = 11:30 UTC
  -- El generador usa este valor en fecha_envio_programada.
  -- El encolador solo encola cuando fecha_envio_programada <= now().
  -- El sender no envía antes de fecha_envio_programada.
  ('contenido_premium_hora_programada',           '11:30'),

  -- Hora UTC en que se genera el contenido premium de domingo.
  -- 06:00 Uruguay = 09:00 UTC
  ('contenido_premium_domingo_hora_generacion',   '09:00'),

  -- Hora UTC a la que se programa el envío del contenido premium de domingo.
  -- 10:00 Uruguay = 13:00 UTC
  ('contenido_premium_domingo_hora_programada',   '13:00'),

  -- Zona horaria del negocio (informativo, no se usa en cálculos de código).
  -- Uruguay no tiene DST desde 2015. Siempre UTC-3.
  ('timezone_contenido',                          'America/Montevideo')

ON CONFLICT (nombre) DO UPDATE
  SET valor = EXCLUDED.valor;
