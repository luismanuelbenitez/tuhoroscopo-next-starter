-- ============================================================================
-- Migration: admin_cron_rpcs
-- Crea RPCs seguras para administrar pg_cron desde el panel admin.
--
-- Principios:
--   - SECURITY DEFINER: las funciones se ejecutan con permisos de postgres
--     y pueden acceder a cron.job sin otorgar permisos directos a ningún rol.
--   - search_path explícito y mínimo: previene ataques de hijacking de funciones.
--   - Solo service_role puede invocarlas (las llama el servidor Next.js).
--   - El campo command de cron.job NUNCA se devuelve al cliente.
--   - cron.alter_job se usa para modificar (nunca UPDATE cron.job directo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_listar_cron_jobs
--    Lista los jobs de pg_cron con la última ejecución.
--    Devuelve ef_name (nombre de la EF detectado en el comando) en lugar del
--    campo command completo, que puede contener tokens y credenciales.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_listar_cron_jobs()
RETURNS TABLE (
  jobid           bigint,
  jobname         text,
  schedule        text,
  active          boolean,
  ef_name         text,
  ultimo_inicio   timestamptz,
  ultimo_fin      timestamptz,
  ultimo_estado   text,
  ultima_duracion interval
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    -- Extrae SOLO el nombre de la EF desde la URL del comando.
    -- Nunca devuelve el campo command completo porque puede contener
    -- headers Authorization, x-internal-key u otros secretos.
    (regexp_match(j.command, 'functions/v1/([a-zA-Z0-9_-]+)'))[1]::text AS ef_name,
    rd.start_time   AS ultimo_inicio,
    rd.end_time     AS ultimo_fin,
    rd.status::text AS ultimo_estado,
    (rd.end_time - rd.start_time) AS ultima_duracion
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, end_time, status
    FROM cron.job_run_details
    WHERE jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) rd ON true
  ORDER BY j.jobid;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_listar_cron_jobs() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_listar_cron_jobs() TO service_role;

-- ----------------------------------------------------------------------------
-- 2. admin_update_cron_job
--    Modifica el estado activo y/o el schedule de un job existente.
--    Usa cron.alter_job (API oficial de pg_cron).
--    Nunca modifica el comando ni ningún otro campo.
--
--    Parámetros:
--      p_job_id   - requerido: jobid del job a modificar
--      p_active   - opcional: nuevo estado activo (NULL = no cambiar)
--      p_schedule - opcional: nuevo schedule cron (NULL = no cambiar)
--
--    Retorna jsonb con: success, job_id, active, schedule, message
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_cron_job(
  p_job_id   bigint,
  p_active   boolean DEFAULT NULL,
  p_schedule text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_active   boolean;
  v_schedule text;
  v_field    text;
  v_ok       boolean;
BEGIN
  -- Validar que se pasó al menos un campo a modificar
  IF p_active IS NULL AND p_schedule IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Se debe especificar p_active o p_schedule'
    );
  END IF;

  -- Validar que el job existe
  SELECT active, schedule
    INTO v_active, v_schedule
  FROM cron.job
  WHERE jobid = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Job no encontrado',
      'job_id', p_job_id
    );
  END IF;

  -- Validar schedule si fue proporcionado
  IF p_schedule IS NOT NULL THEN

    -- No puede estar vacío
    IF trim(p_schedule) = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'El schedule no puede estar vacío'
      );
    END IF;

    -- Debe tener exactamente 5 campos separados por espacios
    IF array_length(regexp_split_to_array(trim(p_schedule), '\s+'), 1) <> 5 THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Expresión cron inválida: debe tener exactamente 5 campos (min hora dom mes dow)'
      );
    END IF;

    -- Cada campo debe contener solo caracteres válidos de cron
    IF trim(p_schedule) !~ '^[\d\*,/\-]+([ \t]+[\d\*,/\-]+){4}$' THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Expresión cron inválida: caracteres no permitidos'
      );
    END IF;

  END IF;

  -- Aplicar el cambio usando la API oficial de pg_cron.
  -- Pasar NULL en un parámetro significa "mantener el valor actual".
  -- Nunca se modifica el campo command.
  PERFORM cron.alter_job(
    job_id   := p_job_id,
    schedule := p_schedule,
    active   := p_active
  );

  -- Leer el estado actualizado desde la DB
  SELECT active, schedule
    INTO v_active, v_schedule
  FROM cron.job
  WHERE jobid = p_job_id;

  RETURN jsonb_build_object(
    'success',  true,
    'job_id',   p_job_id,
    'active',   v_active,
    'schedule', v_schedule,
    'message',  'Job actualizado correctamente'
  );

EXCEPTION WHEN OTHERS THEN
  -- No revelar detalles internos del error al cliente.
  -- El error real queda en los logs de Postgres.
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Error interno al modificar el job. Revisá los logs de Supabase.'
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_update_cron_job(bigint, boolean, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_cron_job(bigint, boolean, text) TO service_role;

-- ----------------------------------------------------------------------------
-- Confirmación
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'admin_cron_rpcs: funciones creadas correctamente.';
  RAISE NOTICE '  - admin_listar_cron_jobs()';
  RAISE NOTICE '  - admin_update_cron_job(bigint, boolean, text)';
  RAISE NOTICE 'Permisos: solo service_role puede invocarlas.';
END;
$$;
