// Inteligencia comercial (2026-11-24): el negocio gestionado y sus objetivos
// (tabla ic_negocios, fuente única). El precio no se copia: se lee de la
// configuración que usa la web (clave_precio), así nunca quedan dos precios.

export interface Negocio {
  id: string; nombre: string; producto: string; mercado: string; moneda: string; zona_horaria: string;
  precio: number | null;
  ganancia_mensual_objetivo: number | null;
  cac_objetivo: number | null;
  updated_at: string;
}

export const NEGOCIO_POR_DEFECTO = "tu_oraculo_uy";

type Get = (q: string) => Promise<unknown>;

export async function leerNegocio(get: Get, id = NEGOCIO_POR_DEFECTO): Promise<Negocio | null> {
  const filas = (await get(`ic_negocios?id=eq.${encodeURIComponent(id)}&activo=eq.true&select=*`)) as Record<string, unknown>[];
  const n = filas?.[0];
  if (!n) return null;
  let precio: number | null = null;
  if (n.clave_precio) {
    const c = (await get(`tarot_configuracion?clave=eq.${encodeURIComponent(String(n.clave_precio))}&select=valor`)) as { valor: string }[];
    const v = Number(c?.[0]?.valor);
    precio = Number.isFinite(v) && v > 0 ? v : null;
  }
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    id: String(n.id), nombre: String(n.nombre), producto: String(n.producto), mercado: String(n.mercado), moneda: String(n.moneda),
    zona_horaria: String(n.zona_horaria), precio,
    ganancia_mensual_objetivo: num(n.ganancia_mensual_objetivo), cac_objetivo: num(n.cac_objetivo), updated_at: String(n.updated_at),
  };
}
