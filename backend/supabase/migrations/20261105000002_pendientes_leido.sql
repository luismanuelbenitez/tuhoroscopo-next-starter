-- Pendientes "leídos" (2026-11-05, pedido de Manuel): el número del menú
-- cuenta solo los urgentes que todavía no se vieron. Marcar como leído no
-- cambia el estado (sigue abierto); un pendiente nuevo vuelve a sumar.
alter table admin_pendientes add column if not exists leido_at timestamptz;
