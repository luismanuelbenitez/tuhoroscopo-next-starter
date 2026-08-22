// ============================================================================
// Cliente único — helper server-only para llamar a la fuente canónica de
// identidad de cliente (ef_tarot_admin_clientes_unicos).
//
// UNA SOLA DEFINICIÓN DE CLIENTE EN TODO TAROT: cualquier ruta BFF que
// necesite "clientes únicos", "clientes nuevos" o "clientes recurrentes"
// debe llamar a esta función — nunca reimplementar normalización de
// teléfono/email ni agrupamiento por su cuenta (Regla 3 de
// docs/ENGINEERING_RULES.md). Ver docs/product/DECISIONS.md 2026-08-22.
//
// Usado por: /api/admin/tarot/clientes-unicos, /api/admin/tarot/metricas,
// /api/admin/tarot/adquisicion.
// ============================================================================

export interface ResumenClientesUnicos {
  clientes_unicos_total: number;
  clientes_recurrentes_historico: number;
  compradores_periodo: number;
  nuevos_periodo: number;
  recurrentes_periodo: number;
  pct_recurrencia_historico: number | null;
  compras_periodo: number;
  compras_por_cliente_periodo: number | null;
  ingreso_total_periodo_por_moneda: Record<string, number>;
  ingreso_promedio_por_cliente_periodo_por_moneda: Record<string, number> | null;
  ticket_promedio_periodo_por_moneda: Record<string, number> | null;
}

export type ResumenClientesUnicosResult =
  | { ok: true; registros_totales: number; personas_totales: number; resumen: ResumenClientesUnicos }
  | { ok: false; motivo: string; detalle?: string };

export interface FetchResumenParams {
  supabaseUrl: string;
  internalKey: string;
  serviceRoleKey: string;
  /** Filtro personalizado — si se pasa, anula `periodo`. */
  desde?: string;
  hasta?: string | null;
  /** 1 | 7 | 30 | 90 — default 30 en la EF si se omite. */
  periodo?: number;
}

export async function fetchResumenClientesUnicos(
  params: FetchResumenParams,
): Promise<ResumenClientesUnicosResult> {
  const { supabaseUrl, internalKey, serviceRoleKey, desde, hasta, periodo } = params;

  const efBody: Record<string, unknown> = { vista: "resumen", log: false };
  if (desde) {
    efBody.desde = desde;
    if (hasta) efBody.hasta = hasta;
  } else if (periodo) {
    efBody.periodo = periodo;
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/ef_tarot_admin_clientes_unicos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(efBody),
      cache: "no-store",
    });
  } catch (e: unknown) {
    return { ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    return { ok: false, motivo: data?.motivo ?? "ef_error", detalle: data?.error ?? `HTTP ${res.status}` };
  }

  return {
    ok: true,
    registros_totales: data.registros_totales,
    personas_totales: data.personas_totales,
    resumen: data.resumen as ResumenClientesUnicos,
  };
}
