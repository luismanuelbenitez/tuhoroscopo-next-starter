// Escritura en Google Ads — ÚNICO módulo autorizado (2026-11-14).
//
// REGLA MÁXIMA, modificada por Manuel por escrito el 14/11/2026: "el módulo sí
// podrá tener botones de aplicar, SALVO en aumentar el presupuesto". Bordes
// definidos ese mismo día:
//   - Solo Google Ads (Meta sigue solo lectura).
//   - PROHIBIDO todo lo que suba el gasto: presupuestos, campañas nuevas,
//     reactivar campañas, sumar redes, subir pujas.
//   - PERMITIDO: negativas, pausar/activar palabras y anuncios, palabras y
//     anuncios nuevos en grupos existentes, fijar títulos.
//
// Este archivo implementa solo el subconjunto que hoy usa el módulo:
//   1. crear palabras negativas de campaña;
//   2. quitar negativas de campaña (para deshacer el punto 1);
//   3. cambiar el estado de una palabra clave entre PAUSED y ENABLED.
// Cualquier otra cosa corta con ViolacionReglaMaxima ANTES de llamar a Google.
// Nunca se llama solo: lo dispara un clic de Manuel en el admin, con
// validación previa de Google (validateOnly) y confirmación.

import { ViolacionReglaMaxima } from "@/lib/reglaMaxima";
import { BASE, GoogleAdsError, mensajeError, tokenDeAcceso, type GoogleAdsConfig } from "./api";

export type OperacionPermitida =
  | { tipo: "negativa_crear"; campana_id: string; texto: string; concordancia: "EXACT" | "PHRASE" | "BROAD" }
  | { tipo: "negativa_quitar"; resource_name: string }
  | { tipo: "palabra_estado"; grupo_id: string; criterio_id: string; estado: "PAUSED" | "ENABLED" };

const ID = /^\d{1,20}$/;

/** Traduce una operación permitida a la de la API, revisando cada campo. */
function aOperacionApi(cfg: GoogleAdsConfig, op: OperacionPermitida): Record<string, unknown> {
  const cliente = `customers/${cfg.cuenta}`;
  switch (op.tipo) {
    case "negativa_crear": {
      const texto = op.texto.trim();
      if (!ID.test(op.campana_id) || !texto || texto.length > 80 || !["EXACT", "PHRASE", "BROAD"].includes(op.concordancia)) throw new ViolacionReglaMaxima(`negativa inválida «${op.texto}»`);
      return { campaignCriterionOperation: { create: { campaign: `${cliente}/campaigns/${op.campana_id}`, negative: true, keyword: { text: texto, matchType: op.concordancia } } } };
    }
    case "negativa_quitar": {
      if (!new RegExp(`^${cliente}/campaignCriteria/\\d+~\\d+$`).test(op.resource_name)) throw new ViolacionReglaMaxima(`recurso inválido ${op.resource_name}`);
      return { campaignCriterionOperation: { remove: op.resource_name } };
    }
    case "palabra_estado": {
      if (!ID.test(op.grupo_id) || !ID.test(op.criterio_id) || !["PAUSED", "ENABLED"].includes(op.estado)) throw new ViolacionReglaMaxima("cambio de estado de palabra inválido");
      return { adGroupCriterionOperation: { updateMask: "status", update: { resourceName: `${cliente}/adGroupCriteria/${op.grupo_id}~${op.criterio_id}`, status: op.estado } } };
    }
    default:
      throw new ViolacionReglaMaxima(`operación no permitida: ${JSON.stringify(op).slice(0, 120)}`);
  }
}

/**
 * Segunda barrera: revisa el pedido ya armado, por si alguien edita
 * aOperacionApi. Solo negativas de campaña (crear/quitar) y estado de palabras.
 */
export function asegurarMutacionPermitida(operaciones: Record<string, unknown>[]): void {
  for (const o of operaciones) {
    const claves = Object.keys(o);
    if (claves.length !== 1) throw new ViolacionReglaMaxima("operación con más de un tipo");
    const [clave] = claves; const v = o[clave] as Record<string, unknown>;
    if (clave === "campaignCriterionOperation") {
      if ("update" in v) throw new ViolacionReglaMaxima("no se editan criterios de campaña");
      const c = v.create as Record<string, unknown> | undefined;
      if (c && (c.negative !== true || !c.keyword || Object.keys(c).some((k) => !["campaign", "negative", "keyword"].includes(k)))) throw new ViolacionReglaMaxima("solo se crean negativas de palabra");
      if (!c && typeof v.remove !== "string") throw new ViolacionReglaMaxima("operación de campaña inválida");
      continue;
    }
    if (clave === "adGroupCriterionOperation") {
      const u = v.update as Record<string, unknown> | undefined;
      if (!u || v.updateMask !== "status" || Object.keys(u).some((k) => !["resourceName", "status"].includes(k)) || !["PAUSED", "ENABLED"].includes(String(u.status))) throw new ViolacionReglaMaxima("en palabras solo se cambia el estado");
      continue;
    }
    // Presupuestos, campañas, pujas, redes, grupos, anuncios: afuera.
    throw new ViolacionReglaMaxima(`tipo de operación no permitido: ${clave}`);
  }
}

export interface ResultadoMutacion { ok: boolean; validado: boolean; recursos: string[]; error?: string }

/**
 * Manda las operaciones a Google. validar=true: Google las revisa pero no
 * aplica nada (validateOnly). Todo o nada (partialFailure: false).
 */
export async function mutarGoogleAds(cfg: GoogleAdsConfig, ops: OperacionPermitida[], validar: boolean): Promise<ResultadoMutacion> {
  if (!ops.length) return { ok: false, validado: validar, recursos: [], error: "No hay cambios para mandar." };
  if (ops.length > 100) throw new ViolacionReglaMaxima("más de 100 cambios juntos");
  const operaciones = ops.map((op) => aOperacionApi(cfg, op));
  asegurarMutacionPermitida(operaciones);
  const url = `${BASE}/customers/${cfg.cuenta}/googleAds:mutate`;
  const headers: Record<string, string> = { Authorization: `Bearer ${await tokenDeAcceso(cfg)}`, "Content-Type": "application/json" };
  if (/^\d{10}$/.test(cfg.mcc)) headers["login-customer-id"] = cfg.mcc;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ mutateOperations: operaciones, validateOnly: validar, partialFailure: false }), cache: "no-store" });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, validado: validar, recursos: [], error: mensajeError(cuerpo, r.status) };
  const respuestas = ((cuerpo as { mutateOperationResponses?: Record<string, { resourceName?: string }>[] })?.mutateOperationResponses) ?? [];
  // Mismo orden que las operaciones (deshacer depende de eso): sin filtrar vacíos.
  const recursos = respuestas.map((x) => Object.values(x)[0]?.resourceName ?? "");
  return { ok: true, validado: validar, recursos };
}

export { GoogleAdsError };
