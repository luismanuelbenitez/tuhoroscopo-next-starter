// ============================================================
// _shared/tarot-precio.ts — Validación canónica del precio base
// comercial de Tu Tirada.
//
// Única fuente de verdad: tarot_configuracion.precio_base_uyu /
// precio_base_ars. El cliente nunca es autoridad sobre este valor —
// ef_tarot_crear_orden y ef_tarot_validar_codigo deben leerlo de la
// DB y validarlo con esta misma función (Regla 3 de
// docs/ENGINEERING_RULES.md — una sola implementación canónica por
// regla de negocio). Ver docs/product/DECISIONS.md (2026-08-17/18).
// ============================================================

/**
 * Valida un valor crudo de tarot_configuracion (precio_base_uyu/ars)
 * como precio comercial utilizable. Devuelve null si el valor está
 * ausente, no es numérico o no es positivo — nunca un fallback
 * histórico inventado (590/4900). El caller debe fallar de forma
 * controlada ante null: no crear orden, no crear preferencia MP,
 * no calcular un descuento sobre un precio no verificado.
 */
export function parsePrecioBaseCanonico(valorRaw: string | null | undefined): number | null {
  const n = Number(valorRaw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
