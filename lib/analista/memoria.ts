import type { Rest } from "@/lib/asistenteParte";

// Memoria única del negocio (tarot_analista_aprendizajes). Nació como "lo que
// ya sabemos" del Analista (2026-11-01); desde 2026-11-25 también la usan
// Inteligencia comercial (experimentos, decisiones) y el Estratega. Una sola
// tabla, una sola lógica de escritura para todas las pantallas.
//   confianza alta / media / baja = hecho comprobado / señal / hipótesis.
//   resultado funciono / no_funciono = lo que se probó (los fracasos se guardan).
//   activo=false conserva lo refutado o descartado, con su motivo.

export const AREAS_MEMORIA = new Set(["trafico", "pagina", "checkout", "pago", "postcompra", "oferta", "medicion", "otro"]);
export const CONFIANZAS = new Set(["alta", "media", "baja"]);
export const RESULTADOS = new Set(["funciono", "no_funciono"]);

export interface EntradaMemoria { texto?: unknown; area?: unknown; confianza?: unknown; evidencia?: unknown; canal?: unknown; resultado?: unknown; ref?: unknown }

function validar(b: EntradaMemoria): { ok: true; campos: Record<string, unknown> } | { ok: false; detalle: string } {
  const texto = String(b.texto ?? "").trim();
  if (texto.length < 3 || texto.length > 600) return { ok: false, detalle: "El texto va de 3 a 600 caracteres." };
  if (!AREAS_MEMORIA.has(String(b.area))) return { ok: false, detalle: "Área inválida." };
  if (!CONFIANZAS.has(String(b.confianza))) return { ok: false, detalle: "Confianza inválida." };
  const campos: Record<string, unknown> = { texto, area: b.area, confianza: b.confianza, evidencia: String(b.evidencia ?? "").trim().slice(0, 1000) || null, updated_at: new Date().toISOString() };
  // Campos de Inteligencia comercial: solo se tocan si vienen (el Analista no los manda).
  if (b.canal !== undefined) campos.canal = typeof b.canal === "string" && /^[a-z_]{2,30}$/.test(b.canal) ? b.canal : null;
  if (b.resultado !== undefined) campos.resultado = RESULTADOS.has(String(b.resultado)) ? b.resultado : null;
  if (b.ref !== undefined) campos.ref = typeof b.ref === "string" ? b.ref.slice(0, 80) || null : null;
  return { ok: true, campos };
}

export async function crearAprendizaje(rest: Rest, b: EntradaMemoria, origen = "manual") {
  const v = validar(b);
  if (!v.ok) return v;
  await rest("tarot_analista_aprendizajes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...v.campos, origen }) });
  return { ok: true as const };
}

/** Si Manuel corrige uno de la IA, pasa a ser suyo: la IA ya no lo pisa. */
export async function editarAprendizaje(rest: Rest, id: string, b: EntradaMemoria) {
  const v = validar(b);
  if (!v.ok) return v;
  await rest(`tarot_analista_aprendizajes?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...v.campos, origen: "manual" }) });
  return { ok: true as const };
}

export async function bajaAprendizaje(rest: Rest, id: string, accion: "descartar" | "reactivar", motivo?: unknown) {
  await rest(`tarot_analista_aprendizajes?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify(accion === "descartar"
      ? { activo: false, motivo_baja: String(motivo ?? "Descartado por el dueño").slice(0, 600), updated_at: new Date().toISOString() }
      : { activo: true, motivo_baja: null, updated_at: new Date().toISOString() }),
  });
  return { ok: true as const };
}
