import type { Rest } from "@/lib/asistenteParte";
import { googleAdsConfig } from "@/lib/googleAdsApi/api";
import { mutarGoogleAds, type OperacionPermitida } from "@/lib/googleAdsApi/escritura";
import { sincronizarGoogleAds } from "@/lib/googleAdsApi/sync";
import { gobernanzaGoogle } from "./fuenteGoogle";
import type { OperacionGenerica } from "./propuestas";

// Aplicar y deshacer cambios propuestos en Google Ads (fase 2, 2026-11-14).
//
// Seguridad:
// - El servidor vuelve a calcular las propuestas: del navegador solo llegan el
//   id de la propuesta y las claves de los ítems elegidos. Nunca se ejecuta
//   una operación que el navegador haya armado.
// - Siempre se valida con Google primero (validateOnly) y recién después se
//   aplica, todo o nada.
// - escritura.ts tiene su propio guardia: solo negativas y estado de palabras.
// - Si el último cambio todavía se está midiendo, hay que confirmarlo aparte.

export interface PedidoAplicar { propuesta_id: string; claves: string[]; modo: "validar" | "aplicar"; acepto_espera?: boolean }

function aGoogle(op: OperacionGenerica, campanas: string[]): OperacionPermitida[] {
  if (op.tipo === "agregar_negativa") return campanas.map((c) => ({ tipo: "negativa_crear" as const, campana_id: c, texto: op.texto, concordancia: op.concordancia }));
  const [grupo, criterio] = op.palabra_id.split("~");
  return [{ tipo: "palabra_estado", grupo_id: grupo, criterio_id: criterio, estado: "PAUSED" }];
}

export async function aplicarPropuesta(rest: Rest, p: PedidoAplicar) {
  const cfg = googleAdsConfig();
  if (!cfg) return { ok: false, motivo: "Google Ads no está configurado en este entorno." };
  const g = await gobernanzaGoogle(rest, 14);
  if (!g.ok) return { ok: false, motivo: "La cuenta todavía no se leyó." };
  const prop = g.propuestas.find((x) => x.id === p.propuesta_id);
  if (!prop) return { ok: false, motivo: "Esa propuesta ya no está (puede que se haya aplicado o que cambiaran los datos). Actualizá la página." };
  const items = prop.items.filter((i) => p.claves.includes(i.clave));
  if (!items.length) return { ok: false, motivo: "No elegiste ningún cambio." };
  if (g.revision.esperar && !p.acepto_espera) return { ok: false, motivo: "en_espera", detalle: g.revision.motivo };
  if (!g.campanas_activas.length && items.some((i) => i.operaciones.some((o) => o.tipo === "agregar_negativa"))) return { ok: false, motivo: "No hay campañas activas donde cargar las negativas." };

  const ops = items.flatMap((i) => i.operaciones.flatMap((o) => aGoogle(o, g.campanas_activas)));
  const validacion = await mutarGoogleAds(cfg, ops, true);
  if (!validacion.ok) return { ok: false, motivo: `Google no lo aceptó: ${validacion.error}` };
  if (p.modo === "validar") return { ok: true, validado: true, cambios: ops.length };

  const r = await mutarGoogleAds(cfg, ops, false);
  const fila = {
    plataforma: "google", propuesta_id: prop.id, titulo: prop.titulo,
    items: items.map((i) => ({ clave: i.clave, texto: i.texto })), operaciones: ops,
    resultado: r.ok ? { recursos: r.recursos } : null, estado: r.ok ? "aplicada" : "error", error: r.ok ? null : r.error ?? null,
    en_espera: g.revision.esperar,
  };
  const [guardada] = (await rest("ads_gobernanza_acciones", { method: "POST", body: JSON.stringify(fila), headers: { Prefer: "return=representation" } })) as { id: number; created_at: string }[];
  if (!r.ok) return { ok: false, motivo: `Google rechazó el cambio: ${r.error}` };
  await despuesDeCambiar(rest, guardada, `Aplicado desde el módulo de gobernanza (acción #${guardada.id}): ${prop.titulo} — ${items.map((i) => i.texto).join("; ")}.`);
  return { ok: true, aplicado: true, accion_id: guardada.id, cambios: ops.length };
}

export async function deshacerAccion(rest: Rest, id: number) {
  const cfg = googleAdsConfig();
  if (!cfg) return { ok: false, motivo: "Google Ads no está configurado en este entorno." };
  const [a] = (await rest(`ads_gobernanza_acciones?id=eq.${id}&select=*`)) as { id: number; titulo: string; estado: string; operaciones: OperacionPermitida[]; resultado: { recursos?: string[] } | null; created_at: string }[];
  if (!a) return { ok: false, motivo: "No existe esa acción." };
  if (a.estado !== "aplicada") return { ok: false, motivo: "Esa acción no está aplicada (ya se deshizo o dio error)." };
  const recursos = a.resultado?.recursos ?? [];
  // Inverso de cada operación: la negativa creada se quita (por el recurso que
  // devolvió Google, en el mismo orden) y la palabra pausada se vuelve a activar.
  const inversas: OperacionPermitida[] = a.operaciones.flatMap((op, i): OperacionPermitida[] => {
    if (op.tipo === "negativa_crear") return recursos[i] ? [{ tipo: "negativa_quitar", resource_name: recursos[i] }] : [];
    if (op.tipo === "palabra_estado" && op.estado === "PAUSED") return [{ ...op, estado: "ENABLED" }];
    return [];
  });
  if (!inversas.length) return { ok: false, motivo: "No hay nada que deshacer en esa acción." };
  const v = await mutarGoogleAds(cfg, inversas, true);
  if (!v.ok) return { ok: false, motivo: `Google no aceptó deshacerlo: ${v.error}` };
  const r = await mutarGoogleAds(cfg, inversas, false);
  if (!r.ok) return { ok: false, motivo: `Google rechazó deshacerlo: ${r.error}` };
  const ahora = new Date().toISOString();
  await rest(`ads_gobernanza_acciones?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ estado: "deshecha", deshecha_at: ahora, deshecha_resultado: { recursos: r.recursos, operaciones: inversas } }), headers: { Prefer: "return=minimal" } });
  await despuesDeCambiar(rest, { id, created_at: ahora }, `Deshecho desde el módulo de gobernanza (acción #${id}): ${a.titulo}.`);
  return { ok: true, deshecho: true, cambios: inversas.length };
}

/**
 * Después de cambiar: se vuelve a leer la cuenta (así el panel y el histórico
 * lo reflejan enseguida) y se anota en la versión nueva del histórico de dónde
 * salió el cambio. Si algo de esto falla, el cambio ya quedó hecho igual.
 */
async function despuesDeCambiar(rest: Rest, accion: { id: number; created_at: string }, nota: string) {
  try {
    await sincronizarGoogleAds(rest, { dias: 3, origen: "manual" });
    const [v] = (await rest(`ads_config_historial?plataforma=eq.google&vigente_hasta=is.null&vigente_desde=gte.${encodeURIComponent(accion.created_at)}&select=id,analisis&order=vigente_desde.desc&limit=1`)) as { id: number; analisis: string | null }[];
    if (v) await rest(`ads_config_historial?id=eq.${v.id}`, { method: "PATCH", body: JSON.stringify({ analisis: v.analisis ? `${v.analisis}\n${nota}` : nota }), headers: { Prefer: "return=minimal" } });
  } catch (e) {
    console.error("gobernanza: después de cambiar", e);
  }
}
