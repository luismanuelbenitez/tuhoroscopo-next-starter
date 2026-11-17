// Ventas de Google Ads avisadas desde el servidor (2026-11-17).
//
// Manuel: "cuando MP confirma el pago, si viene de Google, hay que avisarle".
// Antes la compra se avisaba solo desde el navegador (/tarot/estado); si la
// compradora no volvía de Mercado Pago, Google no se enteraba.
//
// Cómo funciona:
//   1. Al llegar desde un anuncio, el navegador guarda el código del clic
//      (gclid; en iPhone gbraid/wbraid) y lo manda con los eventos de la
//      sesión → tabla google_ads_clics (app/api/analytics/event).
//   2. La orden ya guarda su sesión (tarot_ordenes.funnel_session_id).
//   3. Cada hora, el cron de Google Ads llama a avisarVentasGoogle(): busca los
//      pagos aprobados por MP con clic de Google que todavía no se avisaron y
//      se los manda a Google por la Data Manager API (la de siempre,
//      UploadClickConversions, Google ya no la habilita para cuentas nuevas).
//   4. Cada orden queda anotada en google_ads_ventas_enviadas (una sola vez).
//
// Va a la acción "Compra (servidor)" (tipo "importar clics"), separada de la
// "Compra" del navegador, así Google no suma dos veces la misma venta en la
// columna Conversiones (solo una de las dos es principal).
// Solo se manda el código del clic, el valor y la hora: ningún dato personal.
// REGLA MÁXIMA: el guardia asegurarAvisoDeVentas solo deja pasar events:ingest.

import { asegurarAvisoDeVentas } from "@/lib/reglaMaxima";
import { googleAdsConfig } from "./api";

type Rest = (q: string, init?: RequestInit) => Promise<any>;

const INGEST = "https://datamanager.googleapis.com/v1/events:ingest";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Acción "Compra (servidor)", creada el 17/11/2026 (UPLOAD_CLICKS, categoría Compra).
const ACCION_POR_DEFECTO = "7906553455";

interface VentaPendiente {
  orden_id: string; session_id: string | null; gclid: string | null; gbraid: string | null; wbraid: string | null;
  valor: number | string; moneda: string | null; venta_at: string; intentos: number;
}

export interface ResultadoAviso { ok: boolean; motivo?: string; enviadas: number; errores: number; detalle?: string }

const limpiar = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim() ?? "";

let acceso: { token: string; vence: number } | null = null;
async function tokenVentas(clientId: string, clientSecret: string, refresh: string): Promise<string> {
  if (acceso && acceso.vence > Date.now() + 60_000) return acceso.token;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error === "invalid_grant" ? "la autorización venció: correr scripts/google-ventas-autorizar.mjs" : `token: ${j.error ?? r.status}`);
  acceso = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return acceso.token;
}

/** Un solo identificador de clic, el más preciso disponible. */
function identificador(v: VentaPendiente): Record<string, string> | null {
  if (v.gclid) return { gclid: v.gclid };
  if (v.gbraid) return { gbraid: v.gbraid };
  if (v.wbraid) return { wbraid: v.wbraid };
  return null;
}

function mensajeDe(cuerpo: unknown, status: number): string {
  const e = (cuerpo as { error?: { message?: string; status?: string } })?.error;
  return (e?.message ? `${e.status ?? status}: ${e.message}` : `HTTP ${status}`).slice(0, 500);
}

/**
 * Avisa a Google las ventas pendientes. validar=true: Google revisa el pedido
 * sin registrar nada (y tampoco se anota en la base).
 */
export async function avisarVentasGoogle(rest: Rest, opciones: { validar?: boolean } = {}): Promise<ResultadoAviso> {
  const cfg = googleAdsConfig();
  const refresh = limpiar(process.env.GOOGLE_DATAMANAGER_REFRESH_TOKEN);
  if (!cfg || !refresh) return { ok: true, motivo: "sin_configurar", enviadas: 0, errores: 0 };
  const accion = limpiar(process.env.GOOGLE_ADS_COMPRA_SERVIDOR_ID) || ACCION_POR_DEFECTO;

  const pendientes = ((await rest("rpc/google_ads_ventas_por_enviar", { method: "POST", body: "{}" })) ?? []) as VentaPendiente[];
  const conClic = pendientes.map((v) => ({ v, id: identificador(v) })).filter((x) => x.id) as { v: VentaPendiente; id: Record<string, string> }[];
  if (!conClic.length) return { ok: true, enviadas: 0, errores: 0 };

  const cuerpo = {
    validateOnly: !!opciones.validar,
    destinations: [{
      operatingAccount: { accountType: "GOOGLE_ADS", accountId: cfg.cuenta },
      ...(/^\d{10}$/.test(cfg.mcc) ? { loginAccount: { accountType: "GOOGLE_ADS", accountId: cfg.mcc } } : {}),
      productDestinationId: accion,
    }],
    events: conClic.map(({ v, id }) => ({
      transactionId: v.orden_id,
      eventTimestamp: new Date(v.venta_at).toISOString(),
      eventSource: "WEB",
      conversionValue: Number(v.valor),
      currency: (v.moneda || "UYU").toUpperCase(),
      adIdentifiers: id,
    })),
  };
  asegurarAvisoDeVentas("POST", INGEST, cuerpo);

  let estado: "enviada" | "error" = "error";
  let requestId: string | null = null;
  let detalle: string | null = null;
  try {
    const token = await tokenVentas(cfg.clientId, cfg.clientSecret, refresh);
    const r = await fetch(INGEST, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      estado = "enviada";
      requestId = (j as { requestId?: string })?.requestId ?? null;
      const avisos = (j as { fieldWarnings?: unknown[] })?.fieldWarnings;
      if (avisos?.length) detalle = JSON.stringify(avisos).slice(0, 500);
    } else {
      detalle = mensajeDe(j, r.status);
    }
  } catch (e) {
    detalle = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  }

  if (opciones.validar) return { ok: estado === "enviada", enviadas: 0, errores: 0, detalle: detalle ?? `validado (${conClic.length})` };

  const ahora = new Date().toISOString();
  await rest("google_ads_ventas_enviadas?on_conflict=orden_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(conClic.map(({ v }) => ({
      orden_id: v.orden_id, session_id: v.session_id, estado, valor: Number(v.valor), moneda: v.moneda,
      venta_at: v.venta_at, request_id: requestId, detalle, intentos: (v.intentos ?? 0) + 1, updated_at: ahora,
    }))),
  });
  return estado === "enviada"
    ? { ok: true, enviadas: conClic.length, errores: 0, ...(detalle ? { detalle } : {}) }
    : { ok: false, motivo: "error_google", enviadas: 0, errores: conClic.length, detalle: detalle ?? undefined };
}
