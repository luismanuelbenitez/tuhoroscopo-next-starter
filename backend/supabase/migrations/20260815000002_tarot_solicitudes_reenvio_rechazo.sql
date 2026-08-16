-- ============================================================
-- tarot_solicitudes_reenvio_rechazo: completar el ciclo de vida
-- de una solicitud de reenvío con la rama de rechazo.
--
-- 'rechazada' ya existía en el CHECK de estado desde la migración
-- original (tarot_entregas_v1), reservada sin flujo de UI. Esta
-- migración solo agrega las columnas mínimas faltantes para
-- registrar quién/cuándo/por qué se rechazó, espejando el patrón
-- ya usado para autorizado_por/autorizado_at.
--
-- pendiente_autorizacion
--   ├── autorizada → ejecutada   (ya implementado)
--   └── rechazada                (esta migración)
-- ============================================================

ALTER TABLE tarot_solicitudes_reenvio
  ADD COLUMN rechazado_por text,
  ADD COLUMN rechazado_at timestamptz,
  ADD COLUMN motivo_rechazo text,
  ADD COLUMN motivo_rechazo_detalle text;

ALTER TABLE tarot_solicitudes_reenvio
  ADD CONSTRAINT tarot_solicitudes_reenvio_motivo_rechazo_check
  CHECK (motivo_rechazo IS NULL OR motivo_rechazo IN (
    'solicitud_duplicada', 'no_corresponde', 'prueba_administrativa', 'otro'
  ));
