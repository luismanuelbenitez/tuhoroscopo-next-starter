

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."calcular_proximo_vencimiento"("current_date_iso" "text") RETURNS TABLE("next_expiration_date" "date")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    vencimiento_actual date;
    base_calculo date;
BEGIN
    -- 1. Convertir el ISO text a 'date'.
    -- Si el texto es nulo o inválido, to_date devuelve NULL.
    vencimiento_actual := to_date(current_date_iso, 'YYYY-MM-DD');

    -- 2. Lógica de Renovación Tardía:
    -- Seleccionar la fecha MAYOR (GREATEST) entre HOY (current_date)
    -- y el vencimiento actual.
    -- Si 'vencimiento_actual' es NULO (porque el input era nulo o inválido),
    -- GREATEST() devuelve 'current_date', lo cual es correcto.
    base_calculo := GREATEST(current_date, vencimiento_actual);

    -- 3. Sumar un mes a la base y retornar
    RETURN QUERY SELECT (base_calculo + interval '1 month')::date;
END;
$$;


ALTER FUNCTION "public"."calcular_proximo_vencimiento"("current_date_iso" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_cobro_premium"("p_external_reference" "text", "p_payment_id" "text", "p_amount" numeric, "p_currency" "text", "p_preapproval_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 🔹 1. Actualizar registro de pago existente
  UPDATE pagos
  SET
    status = 'approved',
    fecha_pago = now(),
    amount = p_amount,
    currency = p_currency,
    mp_payment_id = p_payment_id,
    preapproval_id = p_preapproval_id
  WHERE preference_id = p_preapproval_id
     OR provider_payment_id = p_payment_id;

  -- 🔹 2. Actualizar suscriptor vinculado
  UPDATE suscriptores
  SET
    premium_pendiente_confirmacion = false,
    premium_activo = true,
    estado_suscripcion = 'activa',
    fecha_inicio_premium = now(),
    fecha_vencimiento_premium = now() + interval '1 month'
  WHERE id = CAST(p_external_reference AS INT);

  -- 🔹 3. Registrar en log_funciones
  INSERT INTO log_funciones (nombre_funcion, fecha_ejecucion, resultado, exito, detalle, creado_por)
  VALUES (
    'confirmar_cobro_premium',
    now(),
    'OK',
    true,
    jsonb_build_object(
      'external_reference', p_external_reference,
      'payment_id', p_payment_id,
      'amount', p_amount,
      'currency', p_currency
    ),
    'edge'
  );
END;
$$;


ALTER FUNCTION "public"."confirmar_cobro_premium"("p_external_reference" "text", "p_payment_id" "text", "p_amount" numeric, "p_currency" "text", "p_preapproval_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_expirar_suscripciones_por_ttl"("p_ttl_hours" integer DEFAULT 24) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$declare
  -- ============================================================================
  -- ⚙️ CONFIGURACIÓN DINÁMICA
  -- ----------------------------------------------------------------------------
  -- APP_DEBUG_MODE:
  --   Se lee desde tabla public.config.
  --
  -- Reglas:
  --   - true  -> deja logs también cuando no hubo trabajo real
  --   - false -> solo log cuando hubo expiraciones o error
  -- ============================================================================
  v_debug_raw text;
  v_debug boolean := false;

  -- --------------------------------------------------------------------------
  -- Cantidad total de suscripciones pendientes al inicio de la corrida.
  -- Esto nos sirve para entender el universo evaluado.
  -- --------------------------------------------------------------------------
  v_total_pendientes integer := 0;

  -- --------------------------------------------------------------------------
  -- Cantidad de suscripciones pendientes que YA estaban vencidas por TTL
  -- al momento de comenzar la corrida.
  -- --------------------------------------------------------------------------
  v_total_vencidas_ttl integer := 0;

  -- --------------------------------------------------------------------------
  -- Cantidad de filas efectivamente actualizadas por el UPDATE.
  -- Esta es la métrica operativa más importante.
  -- --------------------------------------------------------------------------
  v_rows_updated integer := 0;

  -- --------------------------------------------------------------------------
  -- Cantidad de suscripciones pendientes que siguen vigentes luego de evaluar
  -- el TTL.
  -- --------------------------------------------------------------------------
  v_total_pendientes_no_vencidas integer := 0;

  -- --------------------------------------------------------------------------
  -- Marca temporal de inicio de la corrida.
  -- --------------------------------------------------------------------------
  v_run_started_at timestamptz := now();

  -- --------------------------------------------------------------------------
  -- Marca temporal de fin de corrida.
  -- La calculamos una sola vez para consistencia de log.
  -- --------------------------------------------------------------------------
  v_run_finished_at timestamptz;

begin
  -- ============================================================================
  -- 0) CARGAR APP_DEBUG_MODE DESDE public.config
  -- ----------------------------------------------------------------------------
  -- Si no existe la clave, asumimos false por defecto.
  -- ============================================================================
  select valor
    into v_debug_raw
  from public.config
  where nombre = 'APP_DEBUG_MODE';

  v_debug := coalesce(lower(trim(v_debug_raw)), 'false') = 'true';

  -- ============================================================================
  -- 1) CONTAR TOTAL DE SUSCRIPCIONES PENDIENTES
  -- ----------------------------------------------------------------------------
  -- Responde:
  --   "¿Cuántas suscripciones pendientes existían al inicio de la corrida?"
  -- ============================================================================
  select count(*)
    into v_total_pendientes
  from public.suscripciones
  where estado = 'pendiente';

  -- ============================================================================
  -- 2) CONTAR SUSCRIPCIONES PENDIENTES VENCIDAS POR TTL
  -- ----------------------------------------------------------------------------
  -- Responde:
  --   "¿Cuántas de esas pendientes ya superaron el TTL?"
  -- ============================================================================
  select count(*)
    into v_total_vencidas_ttl
  from public.suscripciones
  where estado = 'pendiente'
    and coalesce(fecha_creacion, created_at)
        < now() - make_interval(hours => p_ttl_hours);

  -- ============================================================================
  -- 3) CALCULAR PENDIENTES QUE SIGUEN VIGENTES
  -- ----------------------------------------------------------------------------
  -- Foto lógica del universo al inicio de la corrida:
  --   pendientes totales - pendientes vencidas por TTL
  -- ============================================================================
  v_total_pendientes_no_vencidas := v_total_pendientes - v_total_vencidas_ttl;

  -- ============================================================================
  -- 4) EXPIRAR SUSCRIPCIONES VENCIDAS POR TTL
  -- ----------------------------------------------------------------------------
  -- Se actualizan solamente las:
  --   - estado = 'pendiente'
  --   - cuya fecha base quedó por fuera del TTL
  --
  -- Efectos:
  --   - estado   -> expirada_ttl
  --   - reason   -> legible para operación
  --   - updated_at actualizado
  -- ============================================================================
  update public.suscripciones
  set
    estado = 'expirada_ttl',
    reason = 'Expirada automáticamente por TTL',
    updated_at = now()
  where estado = 'pendiente'
    and coalesce(fecha_creacion, created_at)
        < now() - make_interval(hours => p_ttl_hours);

  -- ============================================================================
  -- 5) OBTENER CANTIDAD EFECTIVAMENTE ACTUALIZADA
  -- ----------------------------------------------------------------------------
  -- No asumimos que coincida siempre con v_total_vencidas_ttl.
  -- ============================================================================
  get diagnostics v_rows_updated = row_count;

  -- ============================================================================
  -- 6) CAPTURAR FIN DE CORRIDA
  -- ============================================================================
  v_run_finished_at := now();

  -- ============================================================================
  -- 7) LOG CONDICIONAL SEGÚN APP_DEBUG_MODE
  -- ----------------------------------------------------------------------------
  -- Reglas:
  --
  -- a) APP_DEBUG_MODE = false
  --    - Solo log si hubo expiraciones reales (v_rows_updated > 0)
  --
  -- b) APP_DEBUG_MODE = true
  --    - Log siempre, incluso si no hubo nada para expirar
  --
  -- Resultado semántico:
  --   - TTL_EXPIRADAS_OK               -> hubo expiraciones reales
  --   - TTL_SIN_CAMBIOS_SIN_PENDIENTES -> no había pendientes
  --   - TTL_SIN_CAMBIOS_SIN_VENCIDAS   -> había pendientes, pero ninguna vencida
  -- ============================================================================
  if v_rows_updated > 0 or v_debug then
    insert into public.log_funciones (
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito,
      creado_por
    )
    values (
      'fn_expirar_suscripciones_por_ttl',
      v_run_finished_at,
      case
        when v_rows_updated > 0 then 'TTL_EXPIRADAS_OK'
        when v_total_pendientes = 0 then 'TTL_SIN_CAMBIOS_SIN_PENDIENTES'
        else 'TTL_SIN_CAMBIOS_SIN_VENCIDAS'
      end,
      jsonb_build_object(
        'mensaje',
        case
          when v_rows_updated > 0 then
            format(
              'Se detectaron %s suscripciones pendientes. %s superaban el TTL de %s horas. %s fueron pasadas a expirada_ttl. %s permanecen pendientes dentro de vigencia.',
              v_total_pendientes,
              v_total_vencidas_ttl,
              p_ttl_hours,
              v_rows_updated,
              v_total_pendientes_no_vencidas
            )
          when v_total_pendientes = 0 then
            format(
              'No había suscripciones pendientes para evaluar con TTL de %s horas.',
              p_ttl_hours
            )
          else
            format(
              'Se detectaron %s suscripciones pendientes. Ninguna superaba el TTL de %s horas. No se realizaron cambios.',
              v_total_pendientes,
              p_ttl_hours
            )
        end,
        'debug_mode', v_debug,
        'ttl_hours', p_ttl_hours,
        'run_started_at', v_run_started_at,
        'run_finished_at', v_run_finished_at,
        'total_pendientes_detectadas', v_total_pendientes,
        'total_pendientes_vencidas_ttl', v_total_vencidas_ttl,
        'total_actualizadas_expirada_ttl', v_rows_updated,
        'total_pendientes_no_vencidas', v_total_pendientes_no_vencidas
      ),
      true,
      'system'
    );
  end if;

  -- ============================================================================
  -- 8) DEVOLVER CANTIDAD ACTUALIZADA
  -- ----------------------------------------------------------------------------
  -- El contrato de la función se mantiene igual:
  --   devuelve cuántas filas fueron actualizadas.
  -- ============================================================================
  return v_rows_updated;

exception
  when others then
    -- ============================================================================
    -- 9) LOG DE ERROR
    -- ----------------------------------------------------------------------------
    -- Los errores SIEMPRE se registran, independientemente de APP_DEBUG_MODE.
    -- ============================================================================
    insert into public.log_funciones (
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito,
      creado_por
    )
    values (
      'fn_expirar_suscripciones_por_ttl',
      now(),
      'ERROR_EXPIRANDO_SUSCRIPCIONES_TTL',
      jsonb_build_object(
        'mensaje', 'Error ejecutando expiración automática de suscripciones por TTL',
        'debug_mode', v_debug,
        'ttl_hours', p_ttl_hours,
        'run_started_at', v_run_started_at,
        'run_failed_at', now(),
        'total_pendientes_detectadas_hasta_error', v_total_pendientes,
        'total_pendientes_vencidas_ttl_hasta_error', v_total_vencidas_ttl,
        'total_actualizadas_hasta_error', v_rows_updated,
        'error', sqlerrm
      ),
      false,
      'system'
    );

    raise;
end;$$;


ALTER FUNCTION "public"."fn_expirar_suscripciones_por_ttl"("p_ttl_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_guardar_contenido_gratis"("signo_arg" "text", "tipo_contenido_arg" "text", "contenido_arg" "text", "generado_por_arg" "text", "generado_arg" boolean, "fecha_creacion_arg" "date", "id_mensaje_enviado_arg" integer, "ciclo_semana_arg" "text", "emocion_dominante_arg" "text") RETURNS TABLE("id_contenido_gratis" integer, "signo" "text", "tipo_contenido" "text", "contenido" "text", "generado_por" "text", "generado" boolean, "fecha_creacion" "date", "id_mensaje_enviado" integer, "ciclo_semana" "text", "emocion_dominante" "text")
    LANGUAGE "sql" STABLE
    AS $$
  insert into public.contenido_gratis (
    signo,
    tipo_contenido,
    contenido,
    generado_por,
    generado,
    fecha_creacion,
    id_mensaje_enviado,
    ciclo_semana,
    emocion_dominante
  )
  values (
    signo_arg,
    tipo_contenido_arg,
    contenido_arg,
    generado_por_arg,
    generado_arg,
    fecha_creacion_arg,
    id_mensaje_enviado_arg,
    ciclo_semana_arg,
    emocion_dominante_arg
  )
  returning
    id_contenido_gratis,
    signo,
    tipo_contenido,
    contenido,
    generado_por,
    generado,
    fecha_creacion,
    id_mensaje_enviado,
    ciclo_semana,
    emocion_dominante;
$$;


ALTER FUNCTION "public"."fn_guardar_contenido_gratis"("signo_arg" "text", "tipo_contenido_arg" "text", "contenido_arg" "text", "generado_por_arg" "text", "generado_arg" boolean, "fecha_creacion_arg" "date", "id_mensaje_enviado_arg" integer, "ciclo_semana_arg" "text", "emocion_dominante_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_productos_auditoria"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_claims jsonb;
  v_actor text;
begin
  -- ==========================================================================
  -- Intentamos leer claims del JWT de Supabase.
  -- Si no existe JWT, queda null.
  -- ==========================================================================

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;

  -- ==========================================================================
  -- Definimos actor automático.
  -- Puede ser:
  --   - email del usuario autenticado
  --   - sub del JWT
  --   - auth.uid()
  --   - null si nada existe
  -- ==========================================================================

  v_actor := coalesce(
    nullif(v_claims ->> 'email', ''),
    nullif(v_claims ->> 'sub', ''),
    auth.uid()::text
  );

  -- ==========================================================================
  -- INSERT
  -- ==========================================================================

  if tg_op = 'INSERT' then

    new.creado_en := coalesce(new.creado_en, now());

    new.actualizado_en := coalesce(
      new.actualizado_en,
      new.creado_en,
      now()
    );

    new.creado_por := coalesce(
      nullif(btrim(new.creado_por), ''),
      v_actor,
      'system'
    );

    new.actualizado_por := coalesce(
      nullif(btrim(new.actualizado_por), ''),
      new.creado_por,
      v_actor,
      'system'
    );

    return new;

  end if;

  -- ==========================================================================
  -- UPDATE
  -- ==========================================================================

  if tg_op = 'UPDATE' then

    -- ------------------------------------------------------------------------
    -- Los datos de creación no deben cambiar nunca en un UPDATE.
    -- ------------------------------------------------------------------------

    new.creado_en := old.creado_en;
    new.creado_por := old.creado_por;

    -- ------------------------------------------------------------------------
    -- El timestamp de actualización sí debe cambiar siempre.
    -- ------------------------------------------------------------------------

    new.actualizado_en := now();

    -- ------------------------------------------------------------------------
    -- Si en el UPDATE se envió explícitamente actualizado_por,
    -- respetamos ese valor.
    --
    -- Si no se envió nada nuevo, intentamos detectar actor.
    -- Si no hay actor, conservamos el anterior.
    -- Si todo falla, usamos 'system'.
    -- ------------------------------------------------------------------------

    if nullif(btrim(new.actualizado_por), '') is distinct from nullif(btrim(old.actualizado_por), '') then

      new.actualizado_por := coalesce(
        nullif(btrim(new.actualizado_por), ''),
        v_actor,
        old.actualizado_por,
        'system'
      );

    else

      new.actualizado_por := coalesce(
        v_actor,
        nullif(btrim(old.actualizado_por), ''),
        'system'
      );

    end if;

    return new;

  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_productos_auditoria"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_set_actualizado_en"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_set_actualizado_en"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."fn_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sql_sniper_sender"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  -- --------------------------------------------------------------------------
  -- CONFIGURACIÓN
  -- --------------------------------------------------------------------------
  v_url text := 'https://bckbpixlaxfxafhvlpbt.supabase.co/functions/v1/ef_whatsapp_sender';
  v_auth_header text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJja2JwaXhsYXhmeGFmaHZscGJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTI0MzY1NSwiZXhwIjoyMDY0ODE5NjU1fQ.Tkpli_2GGVajWIoHiwseVG4Poa3_0NWGiHVp0Jxk8LU';
  -- Si tu sender usa x-internal-key en vez de Authorization,
  -- cambiamos esa parte abajo en el net.http_post.

  v_request_id bigint;
  v_ids bigint[] := '{}';
  v_id bigint;
  v_total integer := 0;
  v_detalle jsonb := '{}'::jsonb;
  v_lock_ok boolean;

begin
  -- --------------------------------------------------------------------------
  -- BLOQUEO DE CONCURRENCIA
  -- --------------------------------------------------------------------------
  -- Evita que dos corridas del sniper hagan lo mismo al mismo tiempo.
  -- Si ya hay una corrida en progreso, esta ejecución sale sin hacer nada.
  -- No lo logueamos porque sería ruido operativo.
  -- --------------------------------------------------------------------------
  v_lock_ok := pg_try_advisory_lock(938001);

  if not v_lock_ok then
    return jsonb_build_object(
      'ok', true,
      'accion', 'skip_por_lock',
      'procesados', 0
    );
  end if;

  begin
    -- ------------------------------------------------------------------------
    -- BUSCAR MENSAJES ELEGIBLES
    -- ------------------------------------------------------------------------
    -- Tomamos todos los mensajes que:
    --   1) están pendientes
    --   2) ya llegó su hora de envío
    --
    -- El ORDER BY ayuda a procesar primero lo más antiguo.
    -- Podés agregar LIMIT si querés batch fijo, por ejemplo 100.
    -- ------------------------------------------------------------------------
    select coalesce(array_agg(me.id order by me.fecha_envio_programada asc, me.id asc), '{}')
      into v_ids
    from public.mensajes_enviados me
    where me.estado = 'pendiente'
      and me.fecha_envio_programada <= now();

    -- ------------------------------------------------------------------------
    -- SI NO HAY NADA PARA HACER, SALIR SIN LOG
    -- ------------------------------------------------------------------------
    if coalesce(array_length(v_ids, 1), 0) = 0 then
      perform pg_advisory_unlock(938001);

      return jsonb_build_object(
        'ok', true,
        'accion', 'sin_trabajo',
        'procesados', 0
      );
    end if;

    -- ------------------------------------------------------------------------
    -- LOOP: DISPARAR EL SENDER UNO POR UNO
    -- ------------------------------------------------------------------------
    foreach v_id in array v_ids
    loop
      begin
        -- --------------------------------------------------------------------
        -- LLAMADA A LA EDGE FUNCTION SENDER
        -- --------------------------------------------------------------------
        -- IMPORTANTE:
        -- Ajustá este body si tu sender espera otro nombre de campo.
        -- Acá asumimos: { "id_mensaje": <id>, "origen": "sql_sniper" }
        -- --------------------------------------------------------------------
        select net.http_post(
          url := v_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', v_auth_header
          ),
          body := jsonb_build_object(
            'id_mensaje', v_id,
            'origen', 'sql_sniper',
            'forzar_reintento', false
          ),
          timeout_milliseconds := 30000
        )
        into v_request_id;

        v_total := v_total + 1;

        -- --------------------------------------------------------------------
        -- ACUMULAR DETALLE DE CADA DESPACHO
        -- --------------------------------------------------------------------
        v_detalle :=
          v_detalle ||
          jsonb_build_object(
            'msg_' || v_id::text,
            jsonb_build_object(
              'id_mensaje', v_id,
              'request_id', v_request_id,
              'dispatched_at', now()
            )
          );

      exception
        when others then
          -- ------------------------------------------------------------------
          -- ERROR POR MENSAJE INDIVIDUAL
          -- ------------------------------------------------------------------
          -- Logueamos el error y seguimos con los demás mensajes.
          -- Así no se cae toda la corrida por un único caso.
          -- ------------------------------------------------------------------
          insert into public.log_funciones (
            nombre_funcion,
            fecha_ejecucion,
            resultado,
            detalle,
            exito,
            creado_por
          )
          values (
            'fn_sql_sniper_sender',
            now(),
            'sql_sniper_error_por_mensaje',
            jsonb_build_object(
              'id_mensaje', v_id,
              'error', sqlerrm,
              'origen', 'sql_sniper'
            ),
            false,
            'pg_cron'
          );
      end;
    end loop;

    -- ------------------------------------------------------------------------
    -- LOG FINAL SOLO SI HUBO TRABAJO
    -- ------------------------------------------------------------------------
    insert into public.log_funciones (
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito,
      creado_por
    )
    values (
      'fn_sql_sniper_sender',
      now(),
      'sql_sniper_dispatch_ok',
      jsonb_build_object(
        'procesados', v_total,
        'ids', v_ids,
        'detalle_dispatch', v_detalle,
        'origen', 'sql_sniper'
      ),
      true,
      'pg_cron'
    );

    perform pg_advisory_unlock(938001);

    return jsonb_build_object(
      'ok', true,
      'accion', 'dispatch_realizado',
      'procesados', v_total,
      'ids', v_ids
    );

  exception
    when others then
      -- ----------------------------------------------------------------------
      -- ERROR GENERAL DE LA CORRIDA
      -- ----------------------------------------------------------------------
      insert into public.log_funciones (
        nombre_funcion,
        fecha_ejecucion,
        resultado,
        detalle,
        exito,
        creado_por
      )
      values (
        'fn_sql_sniper_sender',
        now(),
        'sql_sniper_error_general',
        jsonb_build_object(
          'error', sqlerrm,
          'origen', 'sql_sniper'
        ),
        false,
        'pg_cron'
      );

      perform pg_advisory_unlock(938001);

      raise;
  end;
end;
$$;


ALTER FUNCTION "public"."fn_sql_sniper_sender"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_thc_sender_sniper_1min"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$declare
  -- ============================================================================
  -- ⚙️ CONFIGURACIÓN GENERAL
  -- ----------------------------------------------------------------------------
  -- v_limit:
  --   cantidad máxima de mensajes a intentar disparar por ejecución.
  --
  -- Recomendación actual:
  --   dejarlo en 20 para no generar ráfagas demasiado grandes.
  -- ============================================================================
  v_limit constant integer := 20;

  -- ============================================================================
  -- 📊 VARIABLES DE CONTROL
  -- ----------------------------------------------------------------------------
  -- v_count:
  --   cantidad de mensajes cuyo sender fue disparado correctamente.
  --
  -- v_errors:
  --   cantidad de errores al intentar llamar al sender.
  --
  -- v_msg:
  --   iterador del loop principal.
  --
  -- v_lock:
  --   advisory lock para evitar solapamiento entre corridas.
  --
  -- v_req_id:
  --   request_id que devuelve net.http_post.
  -- ============================================================================
  v_count integer := 0;
  v_errors integer := 0;
  v_msg record;
  v_lock boolean;
  v_req_id bigint;

  -- ============================================================================
  -- 🧾 ARRAYS PARA LOG DETALLADO
  -- ----------------------------------------------------------------------------
  -- v_ids:
  --   ids enviados al sender correctamente.
  --
  -- v_ids_error:
  --   ids que fallaron al disparar el sender.
  -- ============================================================================
  v_ids bigint[] := '{}';
  v_ids_error bigint[] := '{}';

  -- ============================================================================
  -- 🕓 TIMESTAMP CONSISTENTE DE EJECUCIÓN
  -- ----------------------------------------------------------------------------
  -- Usamos un único timestamp para todos los logs de esta corrida.
  -- ============================================================================
  v_ts timestamptz := now();

  -- ============================================================================
  -- 🔐 CONFIG DINÁMICA DESDE TABLA config
  -- ----------------------------------------------------------------------------
  -- v_internal_key:
  --   clave interna que exige ef_whatsapp_sender.
  --
  -- v_jwt:
  --   JWT válido para verify_jwt del sender.
  --
  -- v_debug_raw:
  --   valor textual leído de config.
  --
  -- v_debug:
  --   booleano real usado por esta función.
  -- ============================================================================
  v_internal_key text;
  v_jwt text;
  v_debug_raw text;
  v_debug boolean := false;

begin
  -- ============================================================================
  -- 🔒 1) LOCK GLOBAL ANTI-SOLAPAMIENTO
  -- ----------------------------------------------------------------------------
  -- Objetivo:
  --   evitar que dos ejecuciones de esta función corran al mismo tiempo.
  --
  -- Comportamiento:
  --   - si logra el lock -> continúa
  --   - si NO logra el lock:
  --       * con APP_DEBUG_MODE = true  -> deja log skip_por_lock
  --       * con APP_DEBUG_MODE = false -> no deja log
  --
  -- Nota:
  --   todavía no leímos APP_DEBUG_MODE desde config, así que primero hacemos
  --   el lock y luego cargamos config. Si no hay lock, no tiene sentido seguir.
  -- ============================================================================
  v_lock := pg_try_advisory_lock(999999);

  if not v_lock then
    -- --------------------------------------------------------------------------
    -- Sin lock:
    -- por regla base "sin novedades no hay novedades", devolvemos limpio.
    --
    -- OJO:
    -- acá no podemos decidir por APP_DEBUG_MODE porque todavía no cargamos config.
    -- Si quisieras que skip_por_lock también dependa de APP_DEBUG_MODE, habría que
    -- sacar esa lectura a otra capa o duplicar config en otra tabla/cache.
    --
    -- Mi recomendación:
    -- dejar SIN LOG este caso.
    -- --------------------------------------------------------------------------
    return jsonb_build_object(
      'ok', true,
      'accion', 'skip_por_lock'
    );
  end if;

  -- ============================================================================
  -- 🔐 2) CARGAR CONFIGURACIÓN DESDE TABLA config
  -- ----------------------------------------------------------------------------
  -- Leemos:
  --   - WHATSAPP_INTERNAL_KEY
  --   - SUPABASE_ANON_KEY
  --   - APP_DEBUG_MODE
  --
  -- Si faltan claves críticas, abortamos con error.
  -- ============================================================================
  select valor into v_internal_key
  from public.config
  where nombre = 'WHATSAPP_INTERNAL_KEY';

  select valor into v_jwt
  from public.config
  where nombre = 'SUPABASE_ANON_KEY';

  select valor into v_debug_raw
  from public.config
  where nombre = 'APP_DEBUG_MODE';

  -- --------------------------------------------------------------------------
  -- Normalización de APP_DEBUG_MODE
  -- Aceptamos true / TRUE / True / espacios.
  -- Si no existe, queda false.
  -- --------------------------------------------------------------------------
  v_debug := coalesce(lower(trim(v_debug_raw)), 'false') = 'true';

  -- --------------------------------------------------------------------------
  -- Validaciones mínimas de seguridad
  -- --------------------------------------------------------------------------
  if v_internal_key is null or trim(v_internal_key) = '' then
    raise exception 'Falta config: WHATSAPP_INTERNAL_KEY';
  end if;

  if v_jwt is null or trim(v_jwt) = '' then
    raise exception 'Falta config: SUPABASE_ANON_KEY';
  end if;

  -- ============================================================================
  -- 🔍 3) VALIDACIÓN PREVIA: ¿HAY MENSAJES LISTOS PARA PROCESAR?
  -- ----------------------------------------------------------------------------
  -- Reglas:
  --   - estado = 'pendiente'
  --   - fecha_envio_programada IS NULL
  --       o
  --     fecha_envio_programada <= now()
  --   - reintentar_despues IS NULL
  --       o
  --     reintentar_despues <= now()
  --
  -- Importante:
  --   fecha_envio_programada se toma desde la COLUMNA REAL de la tabla,
  --   no desde metadata.
  --
  -- Política de logs:
  --   - si APP_DEBUG_MODE = true  -> log "sin_mensajes_pendientes"
  --   - si APP_DEBUG_MODE = false -> no log
  -- ============================================================================
  if not exists (
    select 1
    from mensajes_enviados
    where estado = 'pendiente'
      and (
        fecha_envio_programada is null
        or fecha_envio_programada <= now()
      )
      and (
        reintentar_despues is null
        or reintentar_despues <= now()
      )
  ) then

    if v_debug then
      insert into log_funciones (
        nombre_funcion,
        fecha_ejecucion,
        resultado,
        detalle,
        exito,
        creado_por
      ) values (
        'fn_thc_sender_sniper_1min',
        v_ts,
        'sin_mensajes_pendientes',
        '{}'::jsonb,
        true,
        'system'
      );
    end if;

    perform pg_advisory_unlock(999999);

    return jsonb_build_object(
      'ok', true,
      'procesados', 0,
      'mensaje', 'no_hay_pendientes'
    );
  end if;

  -- ============================================================================
  -- 🔄 4) LOOP PRINCIPAL
  -- ----------------------------------------------------------------------------
  -- Seleccionamos mensajes listos para procesar.
  --
  -- Orden:
  --   1) fecha_envio_programada asc nulls first
  --   2) id asc
  --
  -- ¿Por qué?
  --   - los operativos sin fecha salen primero
  --   - luego los programados más antiguos
  --   - id resuelve empates
  -- ============================================================================
  for v_msg in
    select id
    from mensajes_enviados
    where estado = 'pendiente'
      and (
        fecha_envio_programada is null
        or fecha_envio_programada <= now()
      )
      and (
        reintentar_despues is null
        or reintentar_despues <= now()
      )
    order by fecha_envio_programada asc nulls first, id asc
    limit v_limit
  loop

    begin
      -- ==========================================================================
      -- 🚀 5) DISPARAR ef_whatsapp_sender
      -- --------------------------------------------------------------------------
      -- Esta función NO envía WhatsApp directamente.
      -- Solo le pasa al sender:
      --
      --   { "id_mensaje": <id> }
      --
      -- El sender se encarga de:
      --   - reclamar el mensaje
      --   - validar template
      --   - validar variables
      --   - enviar por WhatsApp
      --   - actualizar estado
      --   - registrar errores técnicos propios
      -- ==========================================================================
      select net.http_post(
        url := 'https://bckbpixlaxfxafhvlpbt.supabase.co/functions/v1/ef_whatsapp_sender',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',

          -- Seguridad interna entre funciones
          'x-internal-key', v_internal_key,

          -- JWT válido para verify_jwt
          'Authorization', 'Bearer ' || v_jwt,
          'apikey', v_jwt
        ),
        body := jsonb_build_object(
          'id_mensaje', v_msg.id
        ),
        timeout_milliseconds := 120000
      )
      into v_req_id;

      -- ==========================================================================
      -- 📊 6) CONTABILIZAR DISPARO EXITOSO
      -- --------------------------------------------------------------------------
      -- OJO:
      -- esto significa que el sender fue invocado.
      -- NO significa que WhatsApp ya aceptó el mensaje.
      -- ==========================================================================
      v_count := v_count + 1;
      v_ids := array_append(v_ids, v_msg.id);

      -- ==========================================================================
      -- 🧾 7) LOG DE DISPARO
      -- --------------------------------------------------------------------------
      -- Este log SIEMPRE se guarda cuando efectivamente hubo trabajo.
      -- ==========================================================================
      insert into log_funciones (
        nombre_funcion,
        fecha_ejecucion,
        resultado,
        detalle,
        exito,
        creado_por
      ) values (
        'fn_thc_sender_sniper_1min',
        v_ts,
        'mensaje_enviado_a_sender',
        jsonb_build_object(
          'id_mensaje', v_msg.id,
          'request_id', v_req_id
        ),
        true,
        'system'
      );

    exception
      when others then
        -- ==========================================================================
        -- ❌ 8) ERROR AL DISPARAR EL SENDER
        -- --------------------------------------------------------------------------
        -- Este error NO es el error final de WhatsApp.
        -- Es un error al intentar invocar la Edge Function sender.
        -- ==========================================================================
        v_errors := v_errors + 1;
        v_ids_error := array_append(v_ids_error, v_msg.id);

        insert into log_funciones (
          nombre_funcion,
          fecha_ejecucion,
          resultado,
          detalle,
          exito,
          creado_por
        ) values (
          'fn_thc_sender_sniper_1min',
          v_ts,
          'error_llamada_sender',
          jsonb_build_object(
            'id_mensaje', v_msg.id,
            'error', sqlerrm
          ),
          false,
          'system'
        );
    end;

  end loop;

  -- ============================================================================
  -- 🧾 9) LOG FINAL DE EJECUCIÓN
  -- ----------------------------------------------------------------------------
  -- Regla:
  --   - si hubo trabajo o errores -> SIEMPRE log final
  --   - si no hubo nada -> ya salimos antes
  -- ============================================================================
  if v_count > 0 or v_errors > 0 then
    insert into log_funciones (
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito,
      creado_por
    ) values (
      'fn_thc_sender_sniper_1min',
      v_ts,
      case
        when v_errors = 0 then 'ejecucion_ok'
        else 'ejecucion_con_errores'
      end,
      jsonb_build_object(
        'procesados', v_count,
        'errores', v_errors,
        'ids_ok', v_ids,
        'ids_error', v_ids_error,
        'limit', v_limit,
        'debug_mode', v_debug
      ),
      (v_errors = 0),
      'system'
    );
  end if;

  -- ============================================================================
  -- 🔓 10) LIBERAR LOCK
  -- ============================================================================
  perform pg_advisory_unlock(999999);

  -- ============================================================================
  -- 📤 11) RESPUESTA FINAL
  -- ============================================================================
  return jsonb_build_object(
    'ok', true,
    'procesados', v_count,
    'errores', v_errors,
    'debug_mode', v_debug
  );

exception
  when others then
    -- ============================================================================
    -- 💥 12) ERROR GLOBAL
    -- ----------------------------------------------------------------------------
    -- Este sí se loguea siempre, porque es error real.
    -- ============================================================================
    insert into log_funciones (
      nombre_funcion,
      fecha_ejecucion,
      resultado,
      detalle,
      exito,
      creado_por
    ) values (
      'fn_thc_sender_sniper_1min',
      now(),
      'error_general',
      jsonb_build_object(
        'error', sqlerrm
      ),
      false,
      'system'
    );

    perform pg_advisory_unlock(999999);

    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm
    );
end;$$;


ALTER FUNCTION "public"."fn_thc_sender_sniper_1min"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_random_emocion_predominante"() RETURNS TABLE("emocion" "text")
    LANGUAGE "plpgsql"
    AS $$
begin
  return query
  select nombre as emocion from emocion_dominante
  order by random()
  limit 1;
end;
$$;


ALTER FUNCTION "public"."get_random_emocion_predominante"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_random_frase_motivadora"() RETURNS TABLE("frase" "text")
    LANGUAGE "sql"
    AS $$
  select contenido as frase
  from contenido_gratis
  where tipo_contenido = 'frase_inspiradora'
  order by random()
  limit 1;
$$;


ALTER FUNCTION "public"."get_random_frase_motivadora"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pg_advisory_lock"("key" bigint) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  select pg_advisory_lock(key);
$$;


ALTER FUNCTION "public"."pg_advisory_lock"("key" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pg_advisory_unlock"("key" bigint) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  select pg_advisory_unlock(key);
$$;


ALTER FUNCTION "public"."pg_advisory_unlock"("key" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sp_cp_pendientes_hoy_diario"("p_limit" integer, "p_offset" integer) RETURNS TABLE("id" integer, "id_suscriptor" integer, "fecha_envio_programada" timestamp with time zone, "tipo" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select
    c.id,
    c.id_suscriptor,
    c.fecha_envio_programada,
    c.tipo
  from contenido_premium c
  where c.tipo = 'diario'
    and coalesce(c.estado_envio, 'pendiente') = 'pendiente'
    and (c.fecha_envio_programada at time zone 'UTC' at time zone 'America/Montevideo')::date
        = (timezone('America/Montevideo', now()))::date
  order by c.fecha_envio_programada asc
  limit coalesce(p_limit, 25)
  offset coalesce(p_offset, 0);
$$;


ALTER FUNCTION "public"."sp_cp_pendientes_hoy_diario"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."thc_build_cuerpo"("contenido" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  nl text := chr(10);

  saludo text := nullif(trim(contenido->>'saludo_inicial'), '');
  horoscopo text := nullif(trim(contenido->>'horoscopo'), '');
  preferido text := nullif(trim(contenido->>'contenido_preferido'), '');
  frase text := nullif(trim(contenido->>'frase_inspiradora'), '');
  numero text := nullif(trim(contenido->>'numero'), '');
  color text := nullif(trim(contenido->>'color'), '');
  pausa text := nullif(trim(contenido->>'pausa'), '');
  pie text := nullif(trim(contenido->>'pie_de_pagina'), '');

  out text := '';
begin
  if saludo is not null then out := out || saludo; end if;
  if horoscopo is not null then out := out || nl || nl || horoscopo; end if;

  if preferido is not null then
    out := out || nl || nl || '*Tu foco hoy* ✅' || nl || preferido;
  end if;

  if frase is not null then
    out := out || nl || nl || '*Frase del día*' || nl || frase;
  end if;

  if numero is not null then
    out := out || nl || nl || '*Número:*' || nl || numero;
  end if;

  if color is not null then
    out := out || nl || nl || '*Color:*' || nl || color;
  end if;

  if pausa is not null then
    out := out || nl || nl || '*Pausa (1 min)* 🌿' || nl || pausa;
  end if;

  if pie is not null then
    out := out || nl || nl || pie;
  end if;

  out := regexp_replace(out, E'\\n{3,}', E'\\n\\n', 'g');
  return trim(out);
end;
$$;


ALTER FUNCTION "public"."thc_build_cuerpo"("contenido" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."thc_trg_contenido_premium_set_cuerpo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  cont jsonb;
  cuerpo text;
begin
  cont := coalesce(new.contenido::jsonb, '{}'::jsonb);

  -- si no hay contenido, no hacemos nada
  if cont = '{}'::jsonb then
    return new;
  end if;

  -- si ya existe cuerpo y no está vacío, no lo tocamos
  if (cont ? 'cuerpo') and nullif(trim(cont->>'cuerpo'), '') is not null then
    return new;
  end if;

  cuerpo := public.thc_build_cuerpo(cont);
  cont := jsonb_set(cont, '{cuerpo}', to_jsonb(cuerpo), true);

  new.contenido := cont;
  return new;
end;
$$;


ALTER FUNCTION "public"."thc_trg_contenido_premium_set_cuerpo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."thc_trg_outbox_set_cuerpo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  meta jsonb;
  cont jsonb;
  cuerpo text;
begin
  meta := coalesce(new.metadata::jsonb, '{}'::jsonb);
  cont := coalesce(meta->'contenido', '{}'::jsonb);

  if cont = '{}'::jsonb then
    return new;
  end if;

  if (cont ? 'cuerpo') and nullif(trim(cont->>'cuerpo'), '') is not null then
    return new;
  end if;

  cuerpo := public.thc_build_cuerpo(cont);
  meta := jsonb_set(meta, '{contenido,cuerpo}', to_jsonb(cuerpo), true);

  new.metadata := meta;
  return new;
end;
$$;


ALTER FUNCTION "public"."thc_trg_outbox_set_cuerpo"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "email" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cat_estado_pago_mp" (
    "code" "text" NOT NULL,
    "descripcion" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cat_estado_pago_mp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."codigos_descuento" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "descripcion" "text",
    "tipo_descuento" "text" NOT NULL,
    "valor_descuento" numeric(12,2),
    "moneda" "text" DEFAULT 'UYU'::"text" NOT NULL,
    "precio_recurrente_normal" numeric(12,2),
    "precio_primera_cuota" numeric(12,2),
    "cantidad_ciclos_descuento" integer DEFAULT 1,
    "fecha_inicio" timestamp with time zone,
    "fecha_fin" timestamp with time zone,
    "max_usos_total" integer,
    "usos_actuales" integer DEFAULT 0 NOT NULL,
    "max_usos_por_usuario" integer DEFAULT 1,
    "solo_nuevos_usuarios" boolean DEFAULT false NOT NULL,
    "solo_usuarios_existentes" boolean DEFAULT false NOT NULL,
    "aplica_a_producto" "text",
    "aplica_a_plan" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creado_por" "text" DEFAULT 'system'::"text" NOT NULL,
    "actualizado_por" "text",
    CONSTRAINT "chk_codigos_descuento_ciclos" CHECK ((("cantidad_ciclos_descuento" IS NULL) OR ("cantidad_ciclos_descuento" > 0))),
    CONSTRAINT "chk_codigos_descuento_fechas" CHECK ((("fecha_fin" IS NULL) OR ("fecha_inicio" IS NULL) OR ("fecha_fin" > "fecha_inicio"))),
    CONSTRAINT "chk_codigos_descuento_max_usos_por_usuario" CHECK ((("max_usos_por_usuario" IS NULL) OR ("max_usos_por_usuario" > 0))),
    CONSTRAINT "chk_codigos_descuento_max_usos_total" CHECK ((("max_usos_total" IS NULL) OR ("max_usos_total" > 0))),
    CONSTRAINT "chk_codigos_descuento_precio_normal_no_negativo" CHECK ((("precio_recurrente_normal" IS NULL) OR ("precio_recurrente_normal" >= (0)::numeric))),
    CONSTRAINT "chk_codigos_descuento_precio_primera_no_negativo" CHECK ((("precio_primera_cuota" IS NULL) OR ("precio_primera_cuota" >= (0)::numeric))),
    CONSTRAINT "chk_codigos_descuento_tipo" CHECK (("tipo_descuento" = ANY (ARRAY['porcentaje'::"text", 'monto_fijo'::"text", 'primera_cuota'::"text", 'dias_gratis'::"text", 'meses_gratis'::"text"]))),
    CONSTRAINT "chk_codigos_descuento_usos_actuales" CHECK (("usos_actuales" >= 0)),
    CONSTRAINT "chk_codigos_descuento_valor_no_negativo" CHECK ((("valor_descuento" IS NULL) OR ("valor_descuento" >= (0)::numeric)))
);


ALTER TABLE "public"."codigos_descuento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."codigos_descuento_usos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "id_suscriptor" integer,
    "email" "text",
    "whatsapp" "text",
    "preapproval_id" "text",
    "payment_id" "text",
    "external_reference" "text",
    "estado_uso" "text" DEFAULT 'reservado'::"text" NOT NULL,
    "moneda" "text" DEFAULT 'UYU'::"text" NOT NULL,
    "precio_original" numeric(12,2),
    "precio_aplicado" numeric(12,2),
    "valor_descuento_aplicado" numeric(12,2),
    "precio_primera_cuota" numeric(12,2),
    "precio_recurrente_normal" numeric(12,2),
    "cantidad_ciclos_descuento" integer,
    "dias_gratis_aplicados" integer,
    "meses_gratis_aplicados" integer,
    "fecha_reserva" timestamp with time zone DEFAULT "now"(),
    "fecha_aplicacion" timestamp with time zone,
    "fecha_cancelacion" timestamp with time zone,
    "fecha_expiracion" timestamp with time zone,
    "ultimo_error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creado_por" "text" DEFAULT 'system'::"text" NOT NULL,
    "actualizado_por" "text",
    CONSTRAINT "chk_codigos_descuento_usos_dias_gratis" CHECK ((("dias_gratis_aplicados" IS NULL) OR ("dias_gratis_aplicados" >= 0))),
    CONSTRAINT "chk_codigos_descuento_usos_estado" CHECK (("estado_uso" = ANY (ARRAY['reservado'::"text", 'aplicado'::"text", 'cancelado'::"text", 'expirado'::"text", 'fallido'::"text"]))),
    CONSTRAINT "chk_codigos_descuento_usos_meses_gratis" CHECK ((("meses_gratis_aplicados" IS NULL) OR ("meses_gratis_aplicados" >= 0))),
    CONSTRAINT "chk_codigos_descuento_usos_precio_aplicado" CHECK ((("precio_aplicado" IS NULL) OR ("precio_aplicado" >= (0)::numeric))),
    CONSTRAINT "chk_codigos_descuento_usos_precio_original" CHECK ((("precio_original" IS NULL) OR ("precio_original" >= (0)::numeric))),
    CONSTRAINT "chk_codigos_descuento_usos_valor_descuento" CHECK ((("valor_descuento_aplicado" IS NULL) OR ("valor_descuento_aplicado" >= (0)::numeric)))
);


ALTER TABLE "public"."codigos_descuento_usos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre" "text" NOT NULL,
    "valor" "text" NOT NULL
);


ALTER TABLE "public"."config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."config_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."config_id_seq" OWNED BY "public"."config"."id";



CREATE TABLE IF NOT EXISTS "public"."configuracion" (
    "id" integer NOT NULL,
    "whatsapp_token_app" "text",
    "whatsapp_phone_number_id" "text",
    "whatsapp_business_id" "text",
    "nombre_plantilla" "text",
    "url_webhook_premium" "text",
    "url_webhook_gratis" "text",
    "link_pago_premium" "text",
    "precio_actual" numeric(10,2),
    "version_flujo" "text",
    "admin_contacto" "text"
);


ALTER TABLE "public"."configuracion" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."configuracion_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."configuracion_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."configuracion_id_seq" OWNED BY "public"."configuracion"."id";



CREATE TABLE IF NOT EXISTS "public"."contenido_gratis" (
    "id" integer NOT NULL,
    "signo" "text",
    "contenido" "jsonb",
    "generado_por" "text",
    "generado" boolean,
    "fecha_creacion" timestamp with time zone,
    "ciclo_semana" "text",
    "emocion_dominante" "text",
    "fecha_envio_programada" "date",
    "fecha_envio_real" "date"
);


ALTER TABLE "public"."contenido_gratis" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contenido_gratis_id_contenido_gratis_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contenido_gratis_id_contenido_gratis_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contenido_gratis_id_contenido_gratis_seq" OWNED BY "public"."contenido_gratis"."id";



CREATE TABLE IF NOT EXISTS "public"."contenido_premium" (
    "id" integer NOT NULL,
    "id_suscriptor" integer NOT NULL,
    "contenido" "jsonb",
    "fecha_creacion" timestamp with time zone,
    "generado" boolean DEFAULT true,
    "generado_por" "text",
    "resultado" "text",
    "ciclo_semana" "text",
    "emocion_dominante" "text",
    "fecha_envio_programada" timestamp with time zone,
    "fecha_envio_real" timestamp with time zone,
    "tipo" "text",
    "estado_envio" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "mensaje_id_whatsapp" "text",
    "ultimo_error" "text",
    "canal" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "reintentar_despues" timestamp with time zone,
    "enviado_por" "text",
    "color" "text",
    "contenido_preferido" "text",
    "numero" smallint,
    "origen_generacion" "text",
    "meta_generacion" "jsonb"
);


ALTER TABLE "public"."contenido_premium" OWNER TO "postgres";


COMMENT ON TABLE "public"."contenido_premium" IS 'contenido_premium';



COMMENT ON COLUMN "public"."contenido_premium"."tipo" IS 'aquí se incluye el tipo de contenido, ejemplo, diario, domingo, etc.';



ALTER TABLE "public"."contenido_premium" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contenido_premium_id_contenido_premium_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."desafios_cosmicos" (
    "id" integer NOT NULL,
    "texto_desafio" "text" NOT NULL,
    "categoria" character varying(50),
    "emocion_dominante" character varying(30),
    "estado" character varying(20) DEFAULT 'activo'::character varying,
    "fecha_creacion" timestamp without time zone DEFAULT "now"(),
    "fecha_inicio" "date",
    "fecha_fin" "date"
);


ALTER TABLE "public"."desafios_cosmicos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."desafios_cosmicos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."desafios_cosmicos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."desafios_cosmicos_id_seq" OWNED BY "public"."desafios_cosmicos"."id";



CREATE TABLE IF NOT EXISTS "public"."emocion_dominante" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "grupo" "text"
);


ALTER TABLE "public"."emocion_dominante" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."emocion_dominante_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."emocion_dominante_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."emocion_dominante_id_seq" OWNED BY "public"."emocion_dominante"."id";



CREATE TABLE IF NOT EXISTS "public"."log_funciones_old" (
    "id" integer NOT NULL,
    "nombre_funcion" "text" NOT NULL,
    "fecha_ejecucion" timestamp without time zone DEFAULT "now"(),
    "resultado" "text",
    "detalle" "jsonb",
    "exito" boolean,
    "creado_por" "text" DEFAULT 'system'::"text"
);


ALTER TABLE "public"."log_funciones_old" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."log_funciones_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."log_funciones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."log_funciones_id_seq" OWNED BY "public"."log_funciones_old"."id";



CREATE TABLE IF NOT EXISTS "public"."log_funciones" (
    "id" integer DEFAULT "nextval"('"public"."log_funciones_id_seq"'::"regclass") NOT NULL,
    "nombre_funcion" "text" NOT NULL,
    "fecha_ejecucion" timestamp without time zone DEFAULT "now"(),
    "resultado" "text",
    "detalle" "jsonb",
    "exito" boolean,
    "creado_por" "text" DEFAULT 'system'::"text"
);


ALTER TABLE "public"."log_funciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensajes_enviados" (
    "id" integer NOT NULL,
    "fecha_hora" timestamp with time zone,
    "whatsapp_destino" "text",
    "tipo_mensaje" "text",
    "estado" "text",
    "id_suscriptor" integer NOT NULL,
    "id_contenido" integer,
    "canal_envio" "text",
    "resultado_envio" boolean,
    "mensaje_id_whatsapp" "text",
    "intentos" integer DEFAULT 0,
    "ultimo_error" "text",
    "reintentar_despues" timestamp with time zone,
    "fecha_creado" timestamp with time zone DEFAULT "now"(),
    "fecha_enviado" timestamp with time zone,
    "fecha_delivered" timestamp with time zone,
    "fecha_read" timestamp with time zone,
    "metadata" "jsonb",
    "nombre_plantilla" "text",
    "fecha_envio_programada" timestamp with time zone,
    "fecha_ultimo_intento" timestamp with time zone
);


ALTER TABLE "public"."mensajes_enviados" OWNER TO "postgres";


COMMENT ON COLUMN "public"."mensajes_enviados"."resultado_envio" IS 'hace referencia al envío por Whatsapp';



COMMENT ON COLUMN "public"."mensajes_enviados"."fecha_envio_programada" IS 'fecha_envio_programada';



CREATE SEQUENCE IF NOT EXISTS "public"."mensajes_enviados_id_mensaje_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."mensajes_enviados_id_mensaje_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."mensajes_enviados_id_mensaje_seq" OWNED BY "public"."mensajes_enviados"."id";



ALTER TABLE "public"."mensajes_enviados" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."mensajes_enviados_id_seq1"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pagos" (
    "id_pago" integer NOT NULL,
    "fecha_pago" "date",
    "status" "text",
    "amount" numeric(10,2),
    "medio_pago" "text",
    "suscriptor_id" integer,
    "link_pago" "text",
    "notas" "text",
    "tipo_pago" smallint,
    "mp_payment_id" "text",
    "preference_id" "text",
    "provider_event_id" "text",
    "currency" "text",
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "provider" "text",
    "preapproval_id" "text",
    "provider_payment_id" "text",
    "procesado" boolean DEFAULT false
);


ALTER TABLE "public"."pagos" OWNER TO "postgres";


COMMENT ON TABLE "public"."pagos" IS 'Ajustada el 2025-10-09 para compatibilidad con webhook y control de duplicados.';



COMMENT ON COLUMN "public"."pagos"."tipo_pago" IS '(mensual, anual, promo).';



CREATE SEQUENCE IF NOT EXISTS "public"."pagos_id_pago_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pagos_id_pago_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pagos_id_pago_seq" OWNED BY "public"."pagos"."id_pago";



CREATE TABLE IF NOT EXISTS "public"."paleta_colores" (
    "id" bigint NOT NULL,
    "grupo" "text" NOT NULL,
    "color" "text" NOT NULL,
    "peso" integer DEFAULT 1 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."paleta_colores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."paleta_colores_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."paleta_colores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."paleta_colores_id_seq" OWNED BY "public"."paleta_colores"."id";



CREATE TABLE IF NOT EXISTS "public"."plantillas" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "contenido" "text" NOT NULL,
    "creado_en" timestamp without time zone DEFAULT "now"(),
    "canal" "text",
    "descripcion" "text",
    "header_activo" boolean DEFAULT false NOT NULL,
    "header_tipo" "text",
    "header_nombre" "text",
    "header_url" "text",
    "header_media_id" "text",
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "plantillas_header_tipo_chk" CHECK ((("header_tipo" IS NULL) OR ("header_tipo" = ANY (ARRAY['image'::"text", 'video'::"text", 'document'::"text"]))))
);


ALTER TABLE "public"."plantillas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."plantillas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."plantillas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."plantillas_id_seq" OWNED BY "public"."plantillas"."id";



CREATE TABLE IF NOT EXISTS "public"."process_locks" (
    "lock_key" "text" NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner" "text"
);


ALTER TABLE "public"."process_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "beneficio" "text",
    "descripcion" "text",
    "tipo_acceso" "text" DEFAULT 'gratis'::"text",
    "categoria" "text",
    "activo" boolean DEFAULT true,
    "creado_por" "text" DEFAULT 'system'::"text" NOT NULL,
    "actualizado_por" "text" DEFAULT 'system'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "productos_tipo_acceso_check" CHECK (("tipo_acceso" = ANY (ARRAY['gratis'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."productos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."productos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."productos_id_seq" OWNED BY "public"."productos"."id";



CREATE TABLE IF NOT EXISTS "public"."rango_numeros" (
    "id" bigint NOT NULL,
    "grupo" "text" NOT NULL,
    "min" smallint NOT NULL,
    "max" smallint NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "rango_numeros_check" CHECK ((("min" >= 1) AND ("max" <= 99) AND ("min" <= "max")))
);


ALTER TABLE "public"."rango_numeros" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rango_numeros_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rango_numeros_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rango_numeros_id_seq" OWNED BY "public"."rango_numeros"."id";



CREATE TABLE IF NOT EXISTS "public"."signos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "fecha_inicio" "text",
    "fecha_fin" "text",
    "elemento" "text",
    "modalidad" "text",
    "emoji" "text",
    "img_url" "text"
);


ALTER TABLE "public"."signos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."signos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."signos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."signos_id_seq" OWNED BY "public"."signos"."id";



CREATE TABLE IF NOT EXISTS "public"."suscripciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suscriptor_id" integer NOT NULL,
    "provider" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "preapproval_id" "text",
    "external_reference" "text",
    "estado" "text" DEFAULT 'pendiente_autorizacion'::"text" NOT NULL,
    "provisional" boolean DEFAULT false NOT NULL,
    "auto_renovacion_activa" boolean DEFAULT true NOT NULL,
    "preapproval_status_mp" "text",
    "fecha_creacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fecha_activacion_provisional" timestamp with time zone,
    "fecha_activacion_definitiva" timestamp with time zone,
    "fecha_vencimiento_actual" timestamp with time zone,
    "fecha_cancelacion" timestamp with time zone,
    "reason" "text",
    "currency_id" "text",
    "amount" numeric(12,2),
    "frequency" integer,
    "frequency_type" "text",
    "payer_email" "text",
    "payer_id" "text",
    "init_point" "text",
    "sandbox_init_point" "text",
    "back_url" "text",
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "codigo_descuento" "text",
    "codigo_descuento_id" "uuid",
    "descuento_estado" "text",
    "descuento_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "chk_preapproval_status_mp" CHECK ((("preapproval_status_mp" IS NULL) OR ("preapproval_status_mp" = ANY (ARRAY['authorized'::"text", 'paused'::"text", 'cancelled'::"text", 'pending'::"text", 'expired'::"text"])))),
    CONSTRAINT "chk_suscripciones_descuento_estado" CHECK ((("descuento_estado" IS NULL) OR ("descuento_estado" = ANY (ARRAY['validado'::"text", 'pendiente_aplicacion'::"text", 'aplicado'::"text", 'fallido'::"text", 'no_aplica'::"text"]))))
);


ALTER TABLE "public"."suscripciones" OWNER TO "postgres";


COMMENT ON COLUMN "public"."suscripciones"."codigo_descuento" IS 'Código promocional ingresado o asociado a la suscripción. Ejemplo: LANZAMIENTO199. Campo opcional.';



COMMENT ON COLUMN "public"."suscripciones"."codigo_descuento_id" IS 'Referencia opcional al registro de public.codigos_descuento asociado a la suscripción.';



COMMENT ON COLUMN "public"."suscripciones"."descuento_estado" IS 'Estado opcional del descuento asociado a la suscripción: validado, pendiente_aplicacion, aplicado, fallido, no_aplica.';



COMMENT ON COLUMN "public"."suscripciones"."descuento_metadata" IS 'Metadata libre del descuento/código asociado a la suscripción. Permite guardar snapshot, respuesta de validación, precio promocional, precio normal, origen, etc.';



CREATE TABLE IF NOT EXISTS "public"."suscriptores" (
    "id" integer NOT NULL,
    "nombre" "text",
    "email" "text",
    "whatsapp" "text",
    "fecha_nacimiento" "date",
    "signo" "text",
    "tipo_suscripcion" "text",
    "estado_suscripcion" "text",
    "contenido_preferido" "text",
    "fecha_alta" "date",
    "token_wa_asociado" "text",
    "id_usuario_wa" "text",
    "estado_mensaje" "text",
    "url_carta_astral" "text",
    "id_pago_mp" "text",
    "notas_internas" "text",
    "origen" "text",
    "fecha_vencimiento_premium" "date",
    "fecha_inicio_premium" "date",
    "telefono" "text",
    "acepto_politicas" boolean DEFAULT false NOT NULL,
    "version_politicas" "text" DEFAULT 'v1.0'::"text" NOT NULL,
    "fecha_consentimiento" timestamp with time zone DEFAULT "now"(),
    "ip_consentimiento" "text",
    "medio_consentimiento" "text",
    "fecha_baja" timestamp with time zone,
    "motivo_baja" "text",
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"(),
    "creado_por" "text" DEFAULT 'system'::"text",
    "user_agent" "text",
    "preapproval_id" "text",
    "preapproval_status" "text",
    "mp_payer_email" "text",
    "mp_payer_id" "text",
    "auto_renovacion_activa" boolean,
    "preapproval_actualizado_en" timestamp with time zone DEFAULT "now"(),
    "preapproval_init_point" "text",
    "premium_activo" boolean DEFAULT false,
    "whatsapp_confirmado" boolean DEFAULT false NOT NULL,
    "fecha_confirmacion_whatsapp" timestamp with time zone,
    "primer_envio_premium_enviado" boolean DEFAULT false NOT NULL,
    "fecha_primer_envio_premium" timestamp with time zone,
    "bienvenida_enviada" boolean,
    CONSTRAINT "chk_estado_suscripcion" CHECK (("estado_suscripcion" = ANY (ARRAY['pendiente_autorizacion'::"text", 'activa'::"text", 'suspendida'::"text", 'cancelada_no_renueva'::"text", 'finalizada'::"text"]))),
    CONSTRAINT "chk_preapproval_status" CHECK ((("preapproval_status" IS NULL) OR ("preapproval_status" = ANY (ARRAY['pending'::"text", 'authorized'::"text", 'paused'::"text", 'cancelled'::"text"])))),
    CONSTRAINT "suscriptores_preapproval_status_check" CHECK ((("preapproval_status" IS NULL) OR ("preapproval_status" = ANY (ARRAY['pending'::"text", 'authorized'::"text", 'paused'::"text", 'cancelled'::"text"]))))
);


ALTER TABLE "public"."suscriptores" OWNER TO "postgres";


COMMENT ON COLUMN "public"."suscriptores"."fecha_vencimiento_premium" IS 'fecha vencimiento suscripción premium';



CREATE SEQUENCE IF NOT EXISTS "public"."suscriptores_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."suscriptores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."suscriptores_id_seq" OWNED BY "public"."suscriptores"."id";



CREATE TABLE IF NOT EXISTS "public"."whatsapp_webhook_events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "received_at_utc" timestamp with time zone DEFAULT "now"() NOT NULL,
    "http_method" "text",
    "query_string" "text",
    "headers" "jsonb",
    "payload" "jsonb" NOT NULL,
    "object_type" "text",
    "entry_time_utc" timestamp with time zone,
    "change_field" "text",
    "tipo_evento" "text",
    "es_evento_mensaje" boolean DEFAULT false NOT NULL,
    "es_evento_status" boolean DEFAULT false NOT NULL,
    "whatsapp_message_id" "text",
    "wamid" "text",
    "status" "text",
    "message_type" "text",
    "from_number" "text",
    "profile_name" "text",
    "phone_number_id" "text",
    "display_phone_number" "text",
    "meta_timestamp_utc" timestamp with time zone,
    "processing_status" "text" DEFAULT 'received'::"text" NOT NULL,
    "processing_error" "text",
    "inbound_called" boolean DEFAULT false NOT NULL,
    "inbound_url" "text",
    "inbound_http_status" integer,
    "inbound_response" "jsonb"
);


ALTER TABLE "public"."whatsapp_webhook_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."whatsapp_webhook_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."whatsapp_webhook_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."whatsapp_webhook_events_id_seq" OWNED BY "public"."whatsapp_webhook_events"."id";



ALTER TABLE ONLY "public"."config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."config_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."configuracion" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."configuracion_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contenido_gratis" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contenido_gratis_id_contenido_gratis_seq"'::"regclass");



ALTER TABLE ONLY "public"."desafios_cosmicos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."desafios_cosmicos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."emocion_dominante" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."emocion_dominante_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."log_funciones_old" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."log_funciones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pagos" ALTER COLUMN "id_pago" SET DEFAULT "nextval"('"public"."pagos_id_pago_seq"'::"regclass");



ALTER TABLE ONLY "public"."paleta_colores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."paleta_colores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."plantillas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."plantillas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."productos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."productos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rango_numeros" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rango_numeros_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."signos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."signos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."suscriptores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."suscriptores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."whatsapp_webhook_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."whatsapp_webhook_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."cat_estado_pago_mp"
    ADD CONSTRAINT "cat_estado_pago_mp_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."codigos_descuento"
    ADD CONSTRAINT "codigos_descuento_codigo_unique" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."codigos_descuento"
    ADD CONSTRAINT "codigos_descuento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."codigos_descuento_usos"
    ADD CONSTRAINT "codigos_descuento_usos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion"
    ADD CONSTRAINT "configuracion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contenido_gratis"
    ADD CONSTRAINT "contenido_gratis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contenido_premium"
    ADD CONSTRAINT "contenido_premium_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."desafios_cosmicos"
    ADD CONSTRAINT "desafios_cosmicos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emocion_dominante"
    ADD CONSTRAINT "emocion_dominante_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."log_funciones_old"
    ADD CONSTRAINT "log_funciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."log_funciones"
    ADD CONSTRAINT "log_funciones_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensajes_enviados"
    ADD CONSTRAINT "mensajes_enviados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_pkey" PRIMARY KEY ("id_pago");



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_provider_payment_id_key" UNIQUE ("provider_payment_id");



ALTER TABLE ONLY "public"."paleta_colores"
    ADD CONSTRAINT "paleta_colores_grupo_color_key" UNIQUE ("grupo", "color");



ALTER TABLE ONLY "public"."paleta_colores"
    ADD CONSTRAINT "paleta_colores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plantillas"
    ADD CONSTRAINT "plantillas_nombre_plantilla_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."plantillas"
    ADD CONSTRAINT "plantillas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_locks"
    ADD CONSTRAINT "process_locks_pkey" PRIMARY KEY ("lock_key");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rango_numeros"
    ADD CONSTRAINT "rango_numeros_grupo_key" UNIQUE ("grupo");



ALTER TABLE ONLY "public"."rango_numeros"
    ADD CONSTRAINT "rango_numeros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signos"
    ADD CONSTRAINT "signos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_preapproval_id_key" UNIQUE ("preapproval_id");



ALTER TABLE ONLY "public"."suscriptores"
    ADD CONSTRAINT "suscriptores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_webhook_events"
    ADD CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "contenido_premium_id_fecha_envio_real_idx" ON "public"."contenido_premium" USING "btree" ("id", "fecha_envio_real");



CREATE INDEX "idx_codigos_descuento_activo" ON "public"."codigos_descuento" USING "btree" ("activo");



CREATE INDEX "idx_codigos_descuento_codigo" ON "public"."codigos_descuento" USING "btree" ("codigo");



CREATE INDEX "idx_codigos_descuento_producto_plan" ON "public"."codigos_descuento" USING "btree" ("aplica_a_producto", "aplica_a_plan");



CREATE INDEX "idx_codigos_descuento_tipo" ON "public"."codigos_descuento" USING "btree" ("tipo_descuento");



CREATE INDEX "idx_codigos_descuento_usos_codigo" ON "public"."codigos_descuento_usos" USING "btree" ("codigo");



CREATE INDEX "idx_codigos_descuento_usos_codigo_id" ON "public"."codigos_descuento_usos" USING "btree" ("codigo_id");



CREATE INDEX "idx_codigos_descuento_usos_email" ON "public"."codigos_descuento_usos" USING "btree" ("email");



CREATE INDEX "idx_codigos_descuento_usos_estado" ON "public"."codigos_descuento_usos" USING "btree" ("estado_uso");



CREATE INDEX "idx_codigos_descuento_usos_fecha_aplicacion" ON "public"."codigos_descuento_usos" USING "btree" ("fecha_aplicacion");



CREATE INDEX "idx_codigos_descuento_usos_payment" ON "public"."codigos_descuento_usos" USING "btree" ("payment_id");



CREATE INDEX "idx_codigos_descuento_usos_preapproval" ON "public"."codigos_descuento_usos" USING "btree" ("preapproval_id");



CREATE INDEX "idx_codigos_descuento_usos_suscriptor" ON "public"."codigos_descuento_usos" USING "btree" ("id_suscriptor");



CREATE INDEX "idx_codigos_descuento_usos_whatsapp" ON "public"."codigos_descuento_usos" USING "btree" ("whatsapp");



CREATE INDEX "idx_codigos_descuento_vigencia" ON "public"."codigos_descuento" USING "btree" ("fecha_inicio", "fecha_fin");



CREATE INDEX "idx_contenido_premium_meta_generacion" ON "public"."contenido_premium" USING "gin" ("meta_generacion");



CREATE INDEX "idx_contenido_premium_suscriptor" ON "public"."contenido_premium" USING "btree" ("id_suscriptor");



CREATE UNIQUE INDEX "idx_contenido_premium_unique_dia" ON "public"."contenido_premium" USING "btree" ("id_suscriptor", "fecha_creacion");



CREATE INDEX "idx_log_funciones_fecha" ON "public"."log_funciones_old" USING "btree" ("fecha_ejecucion");



CREATE INDEX "idx_log_funciones_nombre" ON "public"."log_funciones_old" USING "btree" ("nombre_funcion");



CREATE INDEX "idx_mensajes_enviados_mensaje_id_whatsapp" ON "public"."mensajes_enviados" USING "btree" ("mensaje_id_whatsapp");



CREATE INDEX "idx_mensajes_enviados_nombre_plantilla" ON "public"."mensajes_enviados" USING "btree" ("nombre_plantilla");



CREATE INDEX "idx_mensajes_enviados_pendientes_reintento" ON "public"."mensajes_enviados" USING "btree" ("estado", "reintentar_despues");



CREATE INDEX "idx_mensajes_enviados_suscriptor_plantilla_fecha" ON "public"."mensajes_enviados" USING "btree" ("id_suscriptor", "nombre_plantilla", "fecha_creado" DESC);



CREATE INDEX "idx_mensajes_estado" ON "public"."mensajes_enviados" USING "btree" ("estado");



CREATE INDEX "idx_mensajes_suscriptor" ON "public"."mensajes_enviados" USING "btree" ("id_suscriptor");



CREATE INDEX "idx_mensajes_suscriptor_plantilla" ON "public"."mensajes_enviados" USING "btree" ("id_suscriptor", "nombre_plantilla");



CREATE INDEX "idx_pagos_preapproval_id" ON "public"."pagos" USING "btree" ("preapproval_id");



CREATE INDEX "idx_pagos_preference_id" ON "public"."pagos" USING "btree" ("preference_id");



CREATE UNIQUE INDEX "idx_pagos_provider_payment_id" ON "public"."pagos" USING "btree" ("provider_payment_id");



CREATE INDEX "idx_pagos_suscriptor_id" ON "public"."pagos" USING "btree" ("suscriptor_id");



CREATE INDEX "idx_pagos_suscriptor_preapproval" ON "public"."pagos" USING "btree" ("suscriptor_id", "preapproval_id");



CREATE INDEX "idx_suscripciones_codigo_descuento" ON "public"."suscripciones" USING "btree" ("codigo_descuento");



CREATE INDEX "idx_suscripciones_codigo_descuento_id" ON "public"."suscripciones" USING "btree" ("codigo_descuento_id");



CREATE INDEX "idx_suscripciones_descuento_estado" ON "public"."suscripciones" USING "btree" ("descuento_estado");



CREATE INDEX "idx_suscripciones_estado" ON "public"."suscripciones" USING "btree" ("estado");



CREATE INDEX "idx_suscripciones_preapproval" ON "public"."suscripciones" USING "btree" ("preapproval_id");



CREATE INDEX "idx_suscripciones_suscriptor" ON "public"."suscripciones" USING "btree" ("suscriptor_id");



CREATE INDEX "idx_suscriptores_estado" ON "public"."suscriptores" USING "btree" ("estado_suscripcion");



CREATE INDEX "idx_suscriptores_fecha_vencimiento" ON "public"."suscriptores" USING "btree" ("fecha_vencimiento_premium");



CREATE INDEX "idx_suscriptores_mp_payer_id" ON "public"."suscriptores" USING "btree" ("mp_payer_id");



CREATE INDEX "idx_suscriptores_preapproval_id" ON "public"."suscriptores" USING "btree" ("preapproval_id");



CREATE INDEX "idx_suscriptores_preapproval_status" ON "public"."suscriptores" USING "btree" ("preapproval_status");



CREATE UNIQUE INDEX "idx_suscriptores_preapproval_unique" ON "public"."suscriptores" USING "btree" ("preapproval_id");



CREATE INDEX "idx_suscriptores_premium_activo" ON "public"."suscriptores" USING "btree" ("premium_activo");



CREATE INDEX "idx_suscriptores_primer_envio" ON "public"."suscriptores" USING "btree" ("primer_envio_premium_enviado");



CREATE INDEX "idx_suscriptores_whatsapp" ON "public"."suscriptores" USING "btree" ("whatsapp");



CREATE INDEX "idx_suscriptores_whatsapp_confirmado" ON "public"."suscriptores" USING "btree" ("whatsapp_confirmado");



CREATE UNIQUE INDEX "idx_suscriptores_whatsapp_unique" ON "public"."suscriptores" USING "btree" ("whatsapp");



CREATE UNIQUE INDEX "idx_unique_provider_payment_id" ON "public"."pagos" USING "btree" ("provider_payment_id") WHERE ("provider_payment_id" IS NOT NULL);



CREATE INDEX "idx_wwe_created_at" ON "public"."whatsapp_webhook_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wwe_from_number" ON "public"."whatsapp_webhook_events" USING "btree" ("from_number");



CREATE INDEX "idx_wwe_payload_gin" ON "public"."whatsapp_webhook_events" USING "gin" ("payload");



CREATE INDEX "idx_wwe_processing_status" ON "public"."whatsapp_webhook_events" USING "btree" ("processing_status");



CREATE INDEX "idx_wwe_received_at" ON "public"."whatsapp_webhook_events" USING "btree" ("received_at_utc" DESC);



CREATE INDEX "idx_wwe_status" ON "public"."whatsapp_webhook_events" USING "btree" ("status");



CREATE INDEX "idx_wwe_tipo_evento" ON "public"."whatsapp_webhook_events" USING "btree" ("tipo_evento");



CREATE INDEX "idx_wwe_wamid" ON "public"."whatsapp_webhook_events" USING "btree" ("wamid");



CREATE INDEX "idx_wwe_whatsapp_message_id" ON "public"."whatsapp_webhook_events" USING "btree" ("whatsapp_message_id");



CREATE INDEX "ix_contenido_prem_reintentos" ON "public"."contenido_premium" USING "btree" ("estado_envio", "reintentar_despues");



CREATE INDEX "ix_contenido_prem_tipo_fecha_estado" ON "public"."contenido_premium" USING "btree" ("tipo", "fecha_envio_programada", "estado_envio");



CREATE INDEX "ix_pagos_preference_id" ON "public"."pagos" USING "btree" ("preference_id");



CREATE INDEX "log_funciones_fecha_ejecucion_idx" ON "public"."log_funciones" USING "btree" ("fecha_ejecucion");



CREATE INDEX "log_funciones_nombre_funcion_idx" ON "public"."log_funciones" USING "btree" ("nombre_funcion");



CREATE UNIQUE INDEX "pagos_mp_payment_id_idx" ON "public"."pagos" USING "btree" ("mp_payment_id");



CREATE UNIQUE INDEX "pagos_mp_payment_id_uniq" ON "public"."pagos" USING "btree" ("mp_payment_id") WHERE ("mp_payment_id" IS NOT NULL);



CREATE UNIQUE INDEX "pagos_provider_event_id_idx" ON "public"."pagos" USING "btree" ("provider_event_id");



CREATE UNIQUE INDEX "pagos_provider_payment_id_uniq" ON "public"."pagos" USING "btree" ("provider_payment_id") WHERE ("provider_payment_id" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_suscriptor_activa" ON "public"."suscripciones" USING "btree" ("suscriptor_id") WHERE ("estado" = ANY (ARRAY['activa'::"text", 'activa_provisional'::"text"]));



CREATE UNIQUE INDEX "uniq_suscriptores_whatsapp" ON "public"."suscriptores" USING "btree" ("whatsapp");



CREATE UNIQUE INDEX "uq_mensajes_enviados_mensaje_id_whatsapp" ON "public"."mensajes_enviados" USING "btree" ("mensaje_id_whatsapp") WHERE ("mensaje_id_whatsapp" IS NOT NULL);



CREATE UNIQUE INDEX "ux_contenido_prem_suscriptor_fecha_tipo" ON "public"."contenido_premium" USING "btree" ("id_suscriptor", "fecha_envio_programada", "tipo");



CREATE UNIQUE INDEX "ux_cp_unico_utc" ON "public"."contenido_premium" USING "btree" ("id_suscriptor", "fecha_envio_programada", "tipo");



CREATE UNIQUE INDEX "ux_pagos_mp_payment_id" ON "public"."pagos" USING "btree" ("mp_payment_id") WHERE ("mp_payment_id" IS NOT NULL);



CREATE UNIQUE INDEX "ux_pagos_preapproval_vigente" ON "public"."pagos" USING "btree" ("suscriptor_id") WHERE ((("metadata" ->> 'tipo'::"text") = 'preapproval'::"text") AND ("status" = ANY (ARRAY['pending'::"text", 'authorized'::"text"])));



CREATE UNIQUE INDEX "ux_pagos_provider_event_id" ON "public"."pagos" USING "btree" ("provider_event_id") WHERE ("provider_event_id" IS NOT NULL);



CREATE UNIQUE INDEX "ux_suscriptores_preapproval_id" ON "public"."suscriptores" USING "btree" ("preapproval_id") WHERE ("preapproval_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_codigos_descuento_set_actualizado_en" BEFORE UPDATE ON "public"."codigos_descuento" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_codigos_descuento_usos_set_actualizado_en" BEFORE UPDATE ON "public"."codigos_descuento_usos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_actualizado_en"();



CREATE OR REPLACE TRIGGER "trg_productos_auditoria_biub" BEFORE INSERT OR UPDATE ON "public"."productos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_productos_auditoria"();



CREATE OR REPLACE TRIGGER "trg_suscripciones_set_updated_at" BEFORE UPDATE ON "public"."suscripciones" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



ALTER TABLE ONLY "public"."codigos_descuento_usos"
    ADD CONSTRAINT "codigos_descuento_usos_codigo_id_fkey" FOREIGN KEY ("codigo_id") REFERENCES "public"."codigos_descuento"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."codigos_descuento_usos"
    ADD CONSTRAINT "codigos_descuento_usos_suscriptor_fkey" FOREIGN KEY ("id_suscriptor") REFERENCES "public"."suscriptores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contenido_premium"
    ADD CONSTRAINT "fk_suscriptor" FOREIGN KEY ("id_suscriptor") REFERENCES "public"."suscriptores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensajes_enviados"
    ADD CONSTRAINT "mensajes_enviados_id_suscriptor_fkey" FOREIGN KEY ("id_suscriptor") REFERENCES "public"."suscriptores"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_codigo_descuento_id_fkey" FOREIGN KEY ("codigo_descuento_id") REFERENCES "public"."codigos_descuento"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_suscriptor_id_fkey" FOREIGN KEY ("suscriptor_id") REFERENCES "public"."suscriptores"("id") ON DELETE RESTRICT;



CREATE POLICY "	allow_anon_read" ON "public"."plantillas" FOR SELECT USING (("auth"."role"() = 'anon'::"text"));



CREATE POLICY "Allow service role full access" ON "public"."config" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir insert desde service_role" ON "public"."contenido_gratis" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cat_estado_pago_mp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."codigos_descuento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."codigos_descuento_usos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuracion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contenido_gratis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contenido_premium" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."desafios_cosmicos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emocion_dominante" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."log_funciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."log_funciones_old" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mensajes_enviados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paleta_colores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plantillas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rango_numeros" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."signos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suscripciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suscriptores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_webhook_events" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."calcular_proximo_vencimiento"("current_date_iso" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calcular_proximo_vencimiento"("current_date_iso" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calcular_proximo_vencimiento"("current_date_iso" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirmar_cobro_premium"("p_external_reference" "text", "p_payment_id" "text", "p_amount" numeric, "p_currency" "text", "p_preapproval_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirmar_cobro_premium"("p_external_reference" "text", "p_payment_id" "text", "p_amount" numeric, "p_currency" "text", "p_preapproval_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_cobro_premium"("p_external_reference" "text", "p_payment_id" "text", "p_amount" numeric, "p_currency" "text", "p_preapproval_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_expirar_suscripciones_por_ttl"("p_ttl_hours" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_expirar_suscripciones_por_ttl"("p_ttl_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_expirar_suscripciones_por_ttl"("p_ttl_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_guardar_contenido_gratis"("signo_arg" "text", "tipo_contenido_arg" "text", "contenido_arg" "text", "generado_por_arg" "text", "generado_arg" boolean, "fecha_creacion_arg" "date", "id_mensaje_enviado_arg" integer, "ciclo_semana_arg" "text", "emocion_dominante_arg" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_guardar_contenido_gratis"("signo_arg" "text", "tipo_contenido_arg" "text", "contenido_arg" "text", "generado_por_arg" "text", "generado_arg" boolean, "fecha_creacion_arg" "date", "id_mensaje_enviado_arg" integer, "ciclo_semana_arg" "text", "emocion_dominante_arg" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_guardar_contenido_gratis"("signo_arg" "text", "tipo_contenido_arg" "text", "contenido_arg" "text", "generado_por_arg" "text", "generado_arg" boolean, "fecha_creacion_arg" "date", "id_mensaje_enviado_arg" integer, "ciclo_semana_arg" "text", "emocion_dominante_arg" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_productos_auditoria"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_productos_auditoria"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_productos_auditoria"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_set_actualizado_en"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_set_actualizado_en"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_actualizado_en"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sql_sniper_sender"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sql_sniper_sender"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sql_sniper_sender"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_thc_sender_sniper_1min"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_thc_sender_sniper_1min"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_thc_sender_sniper_1min"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_random_emocion_predominante"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_random_emocion_predominante"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_random_emocion_predominante"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_random_frase_motivadora"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_random_frase_motivadora"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_random_frase_motivadora"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pg_advisory_lock"("key" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."pg_advisory_lock"("key" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_advisory_lock"("key" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."pg_advisory_unlock"("key" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."pg_advisory_unlock"("key" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_advisory_unlock"("key" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."sp_cp_pendientes_hoy_diario"("p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sp_cp_pendientes_hoy_diario"("p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sp_cp_pendientes_hoy_diario"("p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."thc_build_cuerpo"("contenido" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."thc_build_cuerpo"("contenido" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."thc_build_cuerpo"("contenido" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."thc_trg_contenido_premium_set_cuerpo"() TO "anon";
GRANT ALL ON FUNCTION "public"."thc_trg_contenido_premium_set_cuerpo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."thc_trg_contenido_premium_set_cuerpo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."thc_trg_outbox_set_cuerpo"() TO "anon";
GRANT ALL ON FUNCTION "public"."thc_trg_outbox_set_cuerpo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."thc_trg_outbox_set_cuerpo"() TO "service_role";
























GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."cat_estado_pago_mp" TO "anon";
GRANT ALL ON TABLE "public"."cat_estado_pago_mp" TO "authenticated";
GRANT ALL ON TABLE "public"."cat_estado_pago_mp" TO "service_role";



GRANT ALL ON TABLE "public"."codigos_descuento" TO "anon";
GRANT ALL ON TABLE "public"."codigos_descuento" TO "authenticated";
GRANT ALL ON TABLE "public"."codigos_descuento" TO "service_role";



GRANT ALL ON TABLE "public"."codigos_descuento_usos" TO "anon";
GRANT ALL ON TABLE "public"."codigos_descuento_usos" TO "authenticated";
GRANT ALL ON TABLE "public"."codigos_descuento_usos" TO "service_role";



GRANT ALL ON TABLE "public"."config" TO "anon";
GRANT ALL ON TABLE "public"."config" TO "authenticated";
GRANT ALL ON TABLE "public"."config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."configuracion" TO "anon";
GRANT ALL ON TABLE "public"."configuracion" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."configuracion_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."configuracion_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."configuracion_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contenido_gratis" TO "anon";
GRANT ALL ON TABLE "public"."contenido_gratis" TO "authenticated";
GRANT ALL ON TABLE "public"."contenido_gratis" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contenido_gratis_id_contenido_gratis_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contenido_gratis_id_contenido_gratis_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contenido_gratis_id_contenido_gratis_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contenido_premium" TO "anon";
GRANT ALL ON TABLE "public"."contenido_premium" TO "authenticated";
GRANT ALL ON TABLE "public"."contenido_premium" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contenido_premium_id_contenido_premium_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contenido_premium_id_contenido_premium_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contenido_premium_id_contenido_premium_seq" TO "service_role";



GRANT ALL ON TABLE "public"."desafios_cosmicos" TO "anon";
GRANT ALL ON TABLE "public"."desafios_cosmicos" TO "authenticated";
GRANT ALL ON TABLE "public"."desafios_cosmicos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."desafios_cosmicos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."desafios_cosmicos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."desafios_cosmicos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."emocion_dominante" TO "anon";
GRANT ALL ON TABLE "public"."emocion_dominante" TO "authenticated";
GRANT ALL ON TABLE "public"."emocion_dominante" TO "service_role";



GRANT ALL ON SEQUENCE "public"."emocion_dominante_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."emocion_dominante_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."emocion_dominante_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."log_funciones_old" TO "anon";
GRANT ALL ON TABLE "public"."log_funciones_old" TO "authenticated";
GRANT ALL ON TABLE "public"."log_funciones_old" TO "service_role";



GRANT ALL ON SEQUENCE "public"."log_funciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."log_funciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."log_funciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."log_funciones" TO "anon";
GRANT ALL ON TABLE "public"."log_funciones" TO "authenticated";
GRANT ALL ON TABLE "public"."log_funciones" TO "service_role";



GRANT ALL ON TABLE "public"."mensajes_enviados" TO "anon";
GRANT ALL ON TABLE "public"."mensajes_enviados" TO "authenticated";
GRANT ALL ON TABLE "public"."mensajes_enviados" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mensajes_enviados_id_mensaje_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mensajes_enviados_id_mensaje_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mensajes_enviados_id_mensaje_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mensajes_enviados_id_seq1" TO "anon";
GRANT ALL ON SEQUENCE "public"."mensajes_enviados_id_seq1" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mensajes_enviados_id_seq1" TO "service_role";



GRANT ALL ON TABLE "public"."pagos" TO "anon";
GRANT ALL ON TABLE "public"."pagos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pagos_id_pago_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pagos_id_pago_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pagos_id_pago_seq" TO "service_role";



GRANT ALL ON TABLE "public"."paleta_colores" TO "anon";
GRANT ALL ON TABLE "public"."paleta_colores" TO "authenticated";
GRANT ALL ON TABLE "public"."paleta_colores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."paleta_colores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."paleta_colores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."paleta_colores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."plantillas" TO "anon";
GRANT ALL ON TABLE "public"."plantillas" TO "authenticated";
GRANT ALL ON TABLE "public"."plantillas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."plantillas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."plantillas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."plantillas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_locks" TO "anon";
GRANT ALL ON TABLE "public"."process_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."process_locks" TO "service_role";



GRANT ALL ON TABLE "public"."productos" TO "anon";
GRANT ALL ON TABLE "public"."productos" TO "authenticated";
GRANT ALL ON TABLE "public"."productos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rango_numeros" TO "anon";
GRANT ALL ON TABLE "public"."rango_numeros" TO "authenticated";
GRANT ALL ON TABLE "public"."rango_numeros" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rango_numeros_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rango_numeros_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rango_numeros_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."signos" TO "anon";
GRANT ALL ON TABLE "public"."signos" TO "authenticated";
GRANT ALL ON TABLE "public"."signos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."signos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."signos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."signos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."suscripciones" TO "anon";
GRANT ALL ON TABLE "public"."suscripciones" TO "authenticated";
GRANT ALL ON TABLE "public"."suscripciones" TO "service_role";



GRANT ALL ON TABLE "public"."suscriptores" TO "anon";
GRANT ALL ON TABLE "public"."suscriptores" TO "authenticated";
GRANT ALL ON TABLE "public"."suscriptores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."suscriptores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."suscriptores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."suscriptores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_webhook_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."whatsapp_webhook_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."whatsapp_webhook_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."whatsapp_webhook_events_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























revoke delete on table "public"."admin_users" from "anon";

revoke insert on table "public"."admin_users" from "anon";

revoke references on table "public"."admin_users" from "anon";

revoke select on table "public"."admin_users" from "anon";

revoke trigger on table "public"."admin_users" from "anon";

revoke truncate on table "public"."admin_users" from "anon";

revoke update on table "public"."admin_users" from "anon";

revoke delete on table "public"."admin_users" from "authenticated";

revoke insert on table "public"."admin_users" from "authenticated";

revoke references on table "public"."admin_users" from "authenticated";

revoke select on table "public"."admin_users" from "authenticated";

revoke trigger on table "public"."admin_users" from "authenticated";

revoke truncate on table "public"."admin_users" from "authenticated";

revoke update on table "public"."admin_users" from "authenticated";


