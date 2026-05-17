-- ============================================================================
-- Migración: Agregar campos de estado de menú WhatsApp a suscriptores
-- Sprint 1 — Menú WhatsApp MVP
-- Fecha: 2026-05-17
-- ============================================================================
--
-- OBJETIVO:
--   Agregar dos columnas nullable a suscriptores para implementar la máquina
--   de estados del menú interactivo WhatsApp.
--
-- CAMPOS:
--   menu_state             — pantalla actual del menú (null = fuera del menú)
--   menu_state_updated_at  — timestamp de la última actualización de estado
--                            usado para calcular el timeout de 10 minutos
--
-- SEGURIDAD:
--   - Ambas columnas son nullable (DEFAULT NULL).
--   - No afectan filas existentes.
--   - IF NOT EXISTS garantiza idempotencia.
--
-- IMPACTO EN PRODUCCIÓN:
--   - Sin downtime esperado: agregar columnas nullable en PostgreSQL es
--     una operación no bloqueante (no reescribe filas).
--   - Los suscriptores existentes quedan con menu_state = NULL
--     (estado "fuera del menú"), que es el comportamiento correcto.
--
-- CÓMO REVERTIR (rollback manual si fuera necesario):
--   ALTER TABLE public.suscriptores
--     DROP COLUMN IF EXISTS menu_state,
--     DROP COLUMN IF EXISTS menu_state_updated_at;
--
-- REQUIERE TAMBIÉN (fuera de esta migración):
--   - Insertar plantillas en tabla `plantillas`:
--       menu_principal, menu_salir, menu_timeout,
--       menu_proximamente, menu_principal_invalido
--   - Aprobar dichas plantillas en Meta WhatsApp Business Manager
--   - Deployar ef_orquesta_menu_respuesta (corregida)
--   - Deployar ef_webhook_whatsapp_inbound (con routing de MENU)
-- ============================================================================

ALTER TABLE public.suscriptores
  ADD COLUMN IF NOT EXISTS menu_state text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS menu_state_updated_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.suscriptores.menu_state IS
  'Estado actual del menú interactivo WhatsApp. NULL = fuera del menú. Valores: menu_principal.';

COMMENT ON COLUMN public.suscriptores.menu_state_updated_at IS
  'Timestamp de la última actualización de menu_state. Usado para calcular timeout de 10 minutos.';
