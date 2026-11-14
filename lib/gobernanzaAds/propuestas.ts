import { busquedasBasura, clasificarPalabras, negativasFaltantes, sinTilde } from "./reglas";
import type { ConfigGobernanza, EntradaGobernanza, Hallazgo } from "./tipos";

// Cambios propuestos (fase 2, 2026-11-14). A partir del diagnóstico arma
// cambios concretos que se pueden aplicar con un botón. Genérico: habla de
// "agregar negativa" y "pausar palabra"; cada plataforma los traduce a su API.
//
// Solo se proponen cambios que BAJAN o mantienen el gasto (REGLA MÁXIMA):
// nunca subir presupuesto, pujas, campañas ni redes. Lo que no se puede (o no
// conviene) hacer con un botón va a "tareas a mano".

export type OperacionGenerica =
  | { tipo: "agregar_negativa"; texto: string; concordancia: "PHRASE" | "EXACT" }
  | { tipo: "pausar_palabra"; palabra_id: string };

export interface ItemPropuesta { clave: string; texto: string; detalle?: string; operaciones: OperacionGenerica[] }
export interface Propuesta { id: string; hallazgo_id: string; titulo: string; porque: string; items: ItemPropuesta[] }
export interface TareaManual { hallazgo_id: string; titulo: string; accion: string; columna: Hallazgo["columna"] }

/** Hallazgos que ya tienen una propuesta con botón. */
const CUBIERTOS = new Set(["busquedas_basura", "negativas_base", "palabras_sin_ventas", "amplias"]);

export function armarPropuestas(e: EntradaGobernanza, cfg: ConfigGobernanza, hallazgos: Hallazgo[]) {
  const propuestas: Propuesta[] = [];
  const hay = (id: string) => hallazgos.some((h) => h.id === id && h.columna !== "ok");

  // 1. Búsquedas que no compran → negativas de frase.
  const basura = busquedasBasura(e, cfg);
  if (basura.length && hay("busquedas_basura")) {
    const porNeg = new Map<string, { neg: string; terminos: string[] }>();
    for (const b of basura) { const k = sinTilde(b.neg); const a = porNeg.get(k) ?? { neg: b.neg, terminos: [] }; a.terminos.push(b.termino); porNeg.set(k, a); }
    propuestas.push({
      id: "negativas_busquedas", hallazgo_id: "busquedas_basura",
      titulo: "Bloquear búsquedas que no compran",
      porque: "Estas búsquedas ya activaron el anuncio y casi nunca terminan en compra.",
      items: [...porNeg.entries()].map(([k, x]) => ({ clave: `neg:${k}`, texto: `Negativa «${x.neg}» (frase)`, detalle: `Bloquea: ${x.terminos.map((t) => `«${t}»`).join(", ")}`, operaciones: [{ tipo: "agregar_negativa", texto: x.neg, concordancia: "PHRASE" }] })),
    });
  }

  // 2. Negativas preventivas que faltan.
  const faltan = negativasFaltantes(e, cfg, basura);
  if (faltan.length && hay("negativas_base")) {
    propuestas.push({
      id: "negativas_preventivas", hallazgo_id: "negativas_base",
      titulo: "Cargar negativas preventivas",
      porque: "Búsquedas que casi nunca compran en ningún rubro. Todavía no costaron: cerrarlas antes es gratis.",
      items: faltan.map((n) => ({ clave: `neg:${n}`, texto: `Negativa «${n}» (frase)`, operaciones: [{ tipo: "agregar_negativa", texto: n, concordancia: "PHRASE" }] })),
    });
  }

  // 3. Palabras que gastaron el doble del objetivo sin vender → pausar.
  const cl = clasificarPalabras(e, cfg);
  const sinVender = cl.sinVender.filter((p) => p.ids.length);
  if (sinVender.length && hay("palabras_sin_ventas")) {
    propuestas.push({
      id: "pausar_sin_ventas", hallazgo_id: "palabras_sin_ventas",
      titulo: "Pausar palabras que gastan sin vender",
      porque: `Gastaron más de 2 veces lo que aceptás pagar por una venta, sin ninguna venta en 30 días.`,
      items: sinVender.map((p) => ({ clave: `pausa:${sinTilde(p.palabra)}`, texto: `Pausar «${p.palabra}»`, detalle: p.ids.length > 1 ? `En ${p.ids.length} versiones (exacta y frase)` : undefined, operaciones: p.ids.map((id) => ({ tipo: "pausar_palabra" as const, palabra_id: id })) })),
    });
  }

  // 4. Concordancia amplia sin ventas suficientes → pausar.
  const amplias = e.palabras.filter((p) => p.activa && p.concordancia === "BROAD" && p.id);
  if (amplias.length && hay("amplias")) {
    propuestas.push({
      id: "pausar_amplias", hallazgo_id: "amplias",
      titulo: "Pausar palabras en concordancia amplia",
      porque: `Sin ${cfg.minimos.conversiones_amplia} compras en 30 días, la amplia trae búsquedas de cualquier cosa.`,
      items: amplias.map((p) => ({ clave: `amplia:${p.id}`, texto: `Pausar «${p.palabra}» (amplia)`, detalle: p.grupo, operaciones: [{ tipo: "pausar_palabra", palabra_id: p.id! }] })),
    });
  }

  // Lo demás que pide acción pero no tiene botón (títulos, página, checkout…).
  const manuales: TareaManual[] = hallazgos
    .filter((h) => (h.columna === "frenar" || h.columna === "oportunidad") && h.accion && !CUBIERTOS.has(h.id))
    .map((h) => ({ hallazgo_id: h.id, titulo: h.titulo, accion: h.accion!, columna: h.columna }));

  return { propuestas, manuales };
}
