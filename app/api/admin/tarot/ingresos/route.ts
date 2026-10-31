import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// Ingresos de Tarot (rediseño 2026-10-31). Toda compra aprobada por Mercado
// Pago es ingreso, la haga quien la haga (es plata real); las internas solo se
// marcan. Devuelve neto y comisión de MP, plata por liberar, mes en curso con
// proyección, serie diaria contra el período anterior y desgloses por tema,
// origen y medio de pago. Solo lectura.

const DIA = 86_400_000;
const diaUy = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
const inicioDiaUy = (t: number) => Date.parse(`${diaUy(t)}T00:00:00-03:00`);

type PagoMp = {
  id: string; orden_id: string; monto: number | string | null; moneda: string; mp_payment_type: string | null;
  mp_payment_method_id: string | null; mp_installments: number | null; created_at: string;
  neto: string | null; fees: { amount?: number }[] | null; liberacion: string | null; liberacion_estado: string | null;
};
type OrdenIng = { id: string; nombre_snapshot: string | null; tema: string | null; funnel_session_id: string | null; estado: string | null; utm_source: string | null };

function origenLegible(src: string | null): string {
  const s = (src ?? "").toLowerCase();
  if (!s) return "Directo";
  if (["fb", "facebook", "ig", "instagram", "meta"].some((k) => s.includes(k))) return "Meta (Facebook / Instagram)";
  if (s.includes("google")) return "Google";
  if (s.includes("whatsapp") || s === "wa") return "WhatsApp";
  return src as string;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const get = async (q: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "30d";
  const ahora = Date.now();
  const hoy0 = inicioDiaUy(ahora);
  const diasPeriodo: Record<string, number> = { hoy: 1, "7d": 7, "30d": 30, "90d": 90 };

  try {
    const campos = "id,orden_id,monto,moneda,mp_payment_type,mp_payment_method_id,mp_installments,created_at," +
      "neto:webhook_payload->transaction_details->>net_received_amount,fees:webhook_payload->fee_details," +
      "liberacion:webhook_payload->>money_release_date,liberacion_estado:webhook_payload->>money_release_status";
    const crudos = (await get(`tarot_pagos?mp_status=eq.approved&select=${campos}&order=created_at.asc&limit=5000`)) as PagoMp[];

    const ids = Array.from(new Set(crudos.map((p) => p.orden_id).filter(Boolean)));
    const ordenes = ids.length
      ? ((await get(`tarot_ordenes?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,nombre_snapshot,tema,funnel_session_id,estado,utm_source`)) as OrdenIng[])
      : [];
    const sesiones = ordenes.filter((o) => o.funnel_session_id).map((o) => `"${o.funnel_session_id}"`);
    const internas = new Set(
      sesiones.length
        ? ((await get(`funnel_sessions?anonymous_id=in.(${sesiones.join(",")})&es_interno=eq.true&select=anonymous_id`)) as { anonymous_id: string }[]).map((x) => x.anonymous_id)
        : [],
    );
    const ordenDe = new Map(ordenes.map((o) => [o.id, o]));

    const pagos = crudos.map((p) => {
      const o = ordenDe.get(p.orden_id);
      const monto = Number(p.monto ?? 0);
      const comision = Array.isArray(p.fees) ? p.fees.reduce((a, f) => a + (Number(f.amount) || 0), 0) : 0;
      const neto = p.neto != null && p.neto !== "" ? Number(p.neto) : monto - comision;
      const liberadaYa = p.liberacion_estado === "released" || (p.liberacion ? Date.parse(p.liberacion) <= ahora : true);
      return {
        id: p.id, orden_id: p.orden_id, created_at: p.created_at, t: Date.parse(p.created_at), moneda: p.moneda,
        monto, comision, neto, medio: p.mp_payment_type ?? "otro", marca: p.mp_payment_method_id, cuotas: p.mp_installments ?? 1,
        liberacion_at: p.liberacion, liberada: liberadaYa,
        cliente: o?.nombre_snapshot ?? null, tema: o?.tema ?? null, estado_orden: o?.estado ?? null,
        origen: origenLegible(o?.utm_source ?? null),
        interna: !!o?.funnel_session_id && internas.has(o.funnel_session_id),
      };
    });
    type Pago = (typeof pagos)[number];

    // Ventana: "hoy" desde medianoche; N días incluyendo hoy; "todo" desde el primer pago.
    const primero = pagos.length ? inicioDiaUy(pagos[0].t) : hoy0;
    const dias = periodo === "todo" ? Math.max(1, Math.round((hoy0 - primero) / DIA) + 1) : diasPeriodo[periodo] ?? 30;
    const ini = hoy0 - (dias - 1) * DIA;
    const iniAnt = ini - dias * DIA;
    const actual = pagos.filter((p) => p.t >= ini);
    const anterior = periodo === "todo" ? null : pagos.filter((p) => p.t >= iniAnt && p.t < ini);

    const uyu = (l: Pago[]) => l.filter((p) => p.moneda === "UYU");
    const totales = (l: Pago[]) => {
      const u = uyu(l);
      const s = (k: "monto" | "comision" | "neto") => Math.round(u.reduce((a, p) => a + p[k], 0) * 100) / 100;
      return { ventas: u.length, cobrado: s("monto"), comision: s("comision"), neto: s("neto") };
    };

    // Serie diaria (UYU) del período y del anterior, alineadas por día.
    const serie = (desde: number, l: Pago[]) => Array.from({ length: dias }, (_, i) => {
      const d0 = desde + i * DIA;
      const del = uyu(l).filter((p) => p.t >= d0 && p.t < d0 + DIA);
      return { fecha: diaUy(d0 + 12 * 3600_000), cobrado: del.reduce((a, p) => a + p.monto, 0), ventas: del.length };
    });

    // Desgloses del período.
    const agrupar = (f: (p: Pago) => string) => {
      const m = new Map<string, { clave: string; ventas: number; cobrado: number }>();
      for (const p of uyu(actual)) {
        const k = f(p);
        const r = m.get(k) ?? { clave: k, ventas: 0, cobrado: 0 };
        r.ventas += 1; r.cobrado += p.monto; m.set(k, r);
      }
      return Array.from(m.values()).sort((a, b) => b.cobrado - a.cobrado);
    };

    // Mes calendario en curso (Montevideo) y proyección a este ritmo.
    const hoyStr = diaUy(ahora);
    const iniMes = Date.parse(`${hoyStr.slice(0, 8)}01T00:00:00-03:00`);
    const [y, mo] = hoyStr.split("-").map(Number);
    const diasMes = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const diaDelMes = Number(hoyStr.slice(8, 10));
    const delMes = uyu(pagos.filter((p) => p.t >= iniMes));
    const cobradoMes = delMes.reduce((a, p) => a + p.monto, 0);

    const porLiberar = uyu(pagos).filter((p) => !p.liberada);

    return NextResponse.json({
      ok: true, periodo, dias,
      actual: totales(actual),
      anterior: anterior ? totales(anterior) : null,
      internas: actual.filter((p) => p.interna).length,
      serie: serie(ini, actual),
      serie_anterior: anterior ? serie(iniAnt, anterior) : null,
      por_tema: agrupar((p) => p.tema ?? "sin tema"),
      por_origen: agrupar((p) => p.origen),
      por_medio: agrupar((p) => p.medio),
      mes: {
        nombre: new Date(iniMes + 12 * 3600_000).toLocaleDateString("es-UY", { month: "long", timeZone: "America/Montevideo" }),
        cobrado: cobradoMes, ventas: delMes.length, dia: diaDelMes, dias: diasMes,
        proyeccion: delMes.length ? Math.round((cobradoMes / diaDelMes) * diasMes) : null,
      },
      por_liberar: {
        neto: Math.round(porLiberar.reduce((a, p) => a + p.neto, 0)),
        proxima: porLiberar.map((p) => p.liberacion_at).filter(Boolean).sort()[0] ?? null,
      },
      otras_monedas: actual.filter((p) => p.moneda !== "UYU").map((p) => ({ moneda: p.moneda, monto: p.monto })),
      pagos: [...actual].reverse().slice(0, 100).map(({ t: _t, ...p }) => p),
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
