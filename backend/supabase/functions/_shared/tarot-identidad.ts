// Normalización de identidad de cliente — Tu Oráculo.
// Una sola implementación de "qué es un teléfono/email normalizado",
// reutilizada por ef_tarot_crear_orden (normalización al registrar) y
// ef_tarot_admin_clientes_unicos (agrupación administrativa de personas
// a partir de registros de tarot_clientes — ver docs/product/DECISIONS.md
// 2026-08-22, sprint Módulo Clientes V1).
//
// El nombre NUNCA es identificador — solo es descriptivo. Identidad se
// determina exclusivamente por teléfono y/o email normalizados.

/** Normaliza teléfono a E.164. Soporta Uruguay y Argentina. */
export function normalizarTelefono(raw: string): string | null {
  const limpio = raw.replace(/[\s\-().]/g, "");
  // Ya en E.164
  if (/^\+\d{8,15}$/.test(limpio)) return limpio;
  // Uruguay: 09XXXXXXXX → +598 9XXXXXXXX
  if (/^09\d{7}$/.test(limpio)) return "+598" + limpio.slice(1);
  // Uruguay: 9XXXXXXXX → +598 9XXXXXXXX
  if (/^9\d{7}$/.test(limpio)) return "+598" + limpio;
  // Argentina: 011XXXXXXXX → +5411XXXXXXXX
  if (/^0\d{9,10}$/.test(limpio)) return "+54" + limpio.slice(1);
  return null;
}

/**
 * Normaliza email para comparación de identidad: trim + lowercase.
 * Deliberadamente NO elimina puntos ni sufijos +tag (ej: no trata
 * "nombre.apellido@gmail.com" y "nombreapellido@gmail.com" como iguales) —
 * esa normalización agresiva es específica de Gmail y no es universal;
 * aplicarla generaría falsos positivos con otros proveedores.
 */
export function normalizarEmailIdentidad(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return v ? v : null;
}
