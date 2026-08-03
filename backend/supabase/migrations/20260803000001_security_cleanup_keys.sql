-- ============================================================================
-- security_cleanup_keys
-- Aplicada: 2026-08-03
--
-- 1. DROP fn_sql_sniper_sender (JWT hardcodeado, key rotada)
-- 2. DELETE SUPABASE_ANON_KEY de public.config (key legacy deshabilitada)
-- 3. Corrige RLS de public.config: solo service_role puede acceder
-- 4. Reemplaza fn_thc_sender_sniper_1min: elimina dependencia de SUPABASE_ANON_KEY,
--    usa SUPABASE_PUBLISHABLE_KEY (publishable key, no secreta) + WHATSAPP_INTERNAL_KEY
-- ============================================================================

-- 1. DROP fn_sql_sniper_sender
DROP FUNCTION IF EXISTS public.fn_sql_sniper_sender();

-- 2. Eliminar SUPABASE_ANON_KEY (JWT legacy deshabilitado)
DELETE FROM public.config WHERE nombre = 'SUPABASE_ANON_KEY';

-- 3. Corregir RLS de public.config
--    La policy anterior tenía roles={public} — cualquier usuario autenticado podía leer.
DROP POLICY IF EXISTS "Allow service role full access" ON public.config;

CREATE POLICY "service_role_only"
  ON public.config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.config FORCE ROW LEVEL SECURITY;

-- 4. fn_thc_sender_sniper_1min: usa SUPABASE_PUBLISHABLE_KEY (no secreta) para Bearer JWT
--    y WHATSAPP_INTERNAL_KEY para x-internal-key.
--    REQUIERE acción manual: agregar SUPABASE_PUBLISHABLE_KEY a public.config:
--      INSERT INTO public.config (nombre, valor) VALUES ('SUPABASE_PUBLISHABLE_KEY', '<nueva-publishable-key>');
CREATE OR REPLACE FUNCTION public.fn_thc_sender_sniper_1min()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit           CONSTANT integer := 20;
  v_count           integer := 0;
  v_errors          integer := 0;
  v_msg             record;
  v_lock            boolean;
  v_req_id          bigint;
  v_ids             bigint[] := '{}';
  v_ids_error       bigint[] := '{}';
  v_ts              timestamptz := now();
  v_internal_key    text;
  v_publishable_key text;
  v_debug_raw       text;
  v_debug           boolean := false;
  v_supabase_url    text;
BEGIN
  v_lock := pg_try_advisory_lock(999999);
  IF NOT v_lock THEN
    RETURN jsonb_build_object('ok', true, 'accion', 'skip_por_lock');
  END IF;

  SELECT valor INTO v_internal_key    FROM public.config WHERE nombre = 'WHATSAPP_INTERNAL_KEY';
  SELECT valor INTO v_publishable_key FROM public.config WHERE nombre = 'SUPABASE_PUBLISHABLE_KEY';
  SELECT valor INTO v_debug_raw       FROM public.config WHERE nombre = 'APP_DEBUG_MODE';
  SELECT valor INTO v_supabase_url    FROM public.config WHERE nombre = 'SUPABASE_URL';

  v_debug := coalesce(lower(trim(v_debug_raw)), 'false') = 'true';

  IF v_internal_key IS NULL OR trim(v_internal_key) = '' THEN
    PERFORM pg_advisory_unlock(999999);
    RAISE EXCEPTION 'Falta config: WHATSAPP_INTERNAL_KEY';
  END IF;

  IF v_supabase_url IS NULL OR trim(v_supabase_url) = '' THEN
    PERFORM pg_advisory_unlock(999999);
    RAISE EXCEPTION 'Falta config: SUPABASE_URL';
  END IF;

  IF v_publishable_key IS NULL OR trim(v_publishable_key) = '' THEN
    PERFORM pg_advisory_unlock(999999);
    RAISE EXCEPTION 'Falta config: SUPABASE_PUBLISHABLE_KEY (ef_whatsapp_sender tiene verify_jwt=true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mensajes_enviados
    WHERE estado = 'pendiente'
      AND (fecha_envio_programada IS NULL OR fecha_envio_programada <= now())
      AND (reintentar_despues IS NULL OR reintentar_despues <= now())
  ) THEN
    IF v_debug THEN
      INSERT INTO log_funciones (nombre_funcion, fecha_ejecucion, resultado, detalle, exito, creado_por)
      VALUES ('fn_thc_sender_sniper_1min', v_ts, 'ok',
              jsonb_build_object('accion', 'sin_mensajes_pendientes'), true, 'system');
    END IF;
    PERFORM pg_advisory_unlock(999999);
    RETURN jsonb_build_object('ok', true, 'procesados', 0, 'mensaje', 'no_hay_pendientes');
  END IF;

  FOR v_msg IN
    SELECT id FROM mensajes_enviados
    WHERE estado = 'pendiente'
      AND (fecha_envio_programada IS NULL OR fecha_envio_programada <= now())
      AND (reintentar_despues IS NULL OR reintentar_despues <= now())
    ORDER BY fecha_envio_programada ASC NULLS FIRST, id ASC
    LIMIT v_limit
  LOOP
    BEGIN
      SELECT net.http_post(
        url     := v_supabase_url || '/functions/v1/ef_whatsapp_sender',
        headers := jsonb_build_object(
          'Content-Type',   'application/json',
          'x-internal-key', v_internal_key,
          'Authorization',  'Bearer ' || v_publishable_key,
          'apikey',         v_publishable_key
        ),
        body    := jsonb_build_object('id_mensaje', v_msg.id)::text,
        timeout_milliseconds := 120000
      ) INTO v_req_id;

      v_ids   := v_ids || v_msg.id;
      v_count := v_count + 1;

      INSERT INTO log_funciones (nombre_funcion, fecha_ejecucion, resultado, detalle, exito, creado_por)
      VALUES ('fn_thc_sender_sniper_1min', v_ts, 'mensaje_enviado_a_sender',
              jsonb_build_object('id_mensaje', v_msg.id, 'request_id', v_req_id), true, 'system');

    EXCEPTION WHEN OTHERS THEN
      v_ids_error := v_ids_error || v_msg.id;
      v_errors    := v_errors + 1;

      INSERT INTO log_funciones (nombre_funcion, fecha_ejecucion, resultado, detalle, exito, creado_por)
      VALUES ('fn_thc_sender_sniper_1min', v_ts, 'error_llamada_sender',
              jsonb_build_object('id_mensaje', v_msg.id, 'error', sqlerrm), false, 'system');
    END;
  END LOOP;

  IF v_debug OR v_errors > 0 THEN
    INSERT INTO log_funciones (nombre_funcion, fecha_ejecucion, resultado, detalle, exito, creado_por)
    VALUES ('fn_thc_sender_sniper_1min', v_ts,
            CASE WHEN v_errors > 0 THEN 'error' ELSE 'ok' END,
            jsonb_build_object('disparados', v_count, 'errores', v_errors,
                               'ids', v_ids, 'ids_error', v_ids_error),
            v_errors = 0, 'system');
  END IF;

  PERFORM pg_advisory_unlock(999999);
  RETURN jsonb_build_object('ok', v_errors = 0, 'disparados', v_count, 'errores', v_errors);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_thc_sender_sniper_1min() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_thc_sender_sniper_1min() TO service_role;
