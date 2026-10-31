import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { armarEjecucion, type LogEjecucion, type Ejecucion, type Paso } from "@/lib/ejecuciones";

// Ejecuciones del pipeline (2026-10-31): una fila por compra que entró al
// pipeline (pagada o cortesía confirmada), con sus pasos reconstruidos desde
// tarot_logs. Solo lectura y en lote: 5 consultas por página + 2 para los
// números de los últimos 7 días. No llama a ninguna EF.

const FUERA_DEL_PIPELINE = "formulario_completo,pago_iniciado,pago_rechazado,pago_expirado";
const CAMPOS_LOG = "orden_id,evento,nivel,mensaje,duracion_ms,funcion_origen,created_at";

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (q: string) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 30;
  const offsetRaw = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  try {
    const resOrd = await fetch(
      `${supabaseUrl}/rest/v1/tarot_ordenes?estado=not.in.(${FUERA_DEL_PIPELINE})` +
        `&select=id,nombre_snapshot,tema,tipo_orden,precio_cobrado,moneda,estado,funnel_session_id,created_at` +
        `&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { ...headers, Prefer: "count=exact" }, cache: "no-store" },
    );
    if (!resOrd.ok) throw new Error(`HTTP ${resOrd.status}`);
    const ords = (await resOrd.json()) as {
      id: string; nombre_snapshot: string | null; tema: string | null; tipo_orden: string | null;
      precio_cobrado: number | string | null; moneda: string | null; estado: string;
      funnel_session_id: string | null; created_at: string;
    }[];
    const total = Number(resOrd.headers.get("content-range")?.split("/")[1] ?? ords.length) || ords.length;

    const ids = ords.map((o) => o.id);
    const lista = ids.map(encodeURIComponent).join(",");
    const sesiones = ords.filter((o) => o.funnel_session_id).map((o) => `"${o.funnel_session_id}"`).join(",");
    const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [logs, lecs, evs, internas, ords7] = await Promise.all([
      ids.length ? get(`tarot_logs?orden_id=in.(${lista})&select=${CAMPOS_LOG}&order=created_at.asc&limit=5000`) : [],
      ids.length ? get(`tarot_lecturas?orden_id=in.(${lista})&select=orden_id,ia_costo_usd`) : [],
      ids.length ? get(`funnel_events?order_id=in.(${lista})&event_name=in.(mobile_reading_opened,mobile_pdf_clicked)&select=order_id,event_name,created_at&order=created_at.asc&limit=5000`) : [],
      sesiones ? get(`funnel_sessions?anonymous_id=in.(${sesiones})&es_interno=eq.true&select=anonymous_id`) : [],
      get(`tarot_ordenes?estado=not.in.(${FUERA_DEL_PIPELINE})&created_at=gte.${desde7}&select=id&limit=500`),
    ]);

    const porOrden = agrupar(logs as LogEjecucion[]);
    const internasSet = new Set((internas as { anonymous_id: string }[]).map((s) => s.anonymous_id));
    const costo = new Map<string, number>();
    for (const l of lecs as { orden_id: string; ia_costo_usd: number | string | null }[]) {
      costo.set(l.orden_id, (costo.get(l.orden_id) ?? 0) + (Number(l.ia_costo_usd ?? 0) || 0));
    }
    const cliente = new Map<string, { abrio_at: string | null; aperturas: number; pdf_clicks: number }>();
    for (const e of evs as { order_id: string; event_name: string; created_at: string }[]) {
      const c = cliente.get(e.order_id) ?? { abrio_at: null, aperturas: 0, pdf_clicks: 0 };
      if (e.event_name === "mobile_reading_opened") { c.abrio_at ??= e.created_at; c.aperturas += 1; }
      else c.pdf_clicks += 1;
      cliente.set(e.order_id, c);
    }

    const ejecuciones = ords.map((o) => {
      const eventos = porOrden.get(o.id) ?? [];
      return {
        id: o.id,
        cliente: o.nombre_snapshot,
        tema: o.tema,
        tipo: o.tipo_orden === "cortesia" ? "cortesia" : "venta",
        precio: o.precio_cobrado != null ? Number(o.precio_cobrado) : null,
        moneda: o.moneda,
        estado_orden: o.estado,
        created_at: o.created_at,
        interna: !!o.funnel_session_id && internasSet.has(o.funnel_session_id),
        costo_ia_usd: costo.get(o.id) ?? 0,
        ...(cliente.get(o.id) ?? { abrio_at: null, aperturas: 0, pdf_clicks: 0 }),
        sin_registro: eventos.length === 0,
        ejecucion: armarEjecucion(eventos),
        eventos: eventos.map(({ orden_id: _o, ...e }) => e),
      };
    });

    // Números de los últimos 7 días (todas las compras, incluidas internas y
    // cortesías: miden al sistema, no a las ventas).
    const ids7 = (ords7 as { id: string }[]).map((o) => o.id);
    const logs7 = ids7.length
      ? ((await get(`tarot_logs?orden_id=in.(${ids7.map(encodeURIComponent).join(",")})&select=${CAMPOS_LOG}&order=created_at.asc&limit=10000`)) as LogEjecucion[])
      : [];
    const resumen = resumir(Array.from(agrupar(logs7).values()).map((l) => armarEjecucion(l)));

    return NextResponse.json({
      ok: true,
      paginacion: { total, limit, offset, next_offset: offset + limit < total ? offset + limit : null },
      resumen,
      ejecuciones,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

function agrupar(logs: LogEjecucion[]): Map<string, LogEjecucion[]> {
  const m = new Map<string, LogEjecucion[]>();
  for (const l of logs) {
    const arr = m.get(l.orden_id);
    if (arr) arr.push(l); else m.set(l.orden_id, [l]);
  }
  return m;
}

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function resumir(ej: Ejecucion[]) {
  const iniciadas = ej.filter((e) => e.resultado !== "sin_iniciar");
  const completas = iniciadas.filter((e) => e.fin && e.resultado !== "error");
  const totales = completas.map((e) => e.total_ms).filter((v): v is number => v != null);
  const claves: Paso["clave"][] = ["lectura", "pdf", "whatsapp", "email", "audio"];
  const pasos = claves.map((clave) => {
    const ps = iniciadas.map((e) => e.pasos.find((p) => p.clave === clave)!).filter(Boolean);
    const tiempos = ps.filter((p) => p.ms != null && (p.estado === "ok" || p.estado === "lento" || p.estado === "reintento")).map((p) => p.ms as number);
    return {
      clave,
      nombre: ps[0]?.nombre ?? clave,
      mediana_ms: mediana(tiempos),
      max_ms: tiempos.length ? Math.max(...tiempos) : null,
      problemas: ps.filter((p) => p.estado === "error" || p.estado === "reintento").length,
    };
  });
  return {
    compras: iniciadas.length,
    completas: completas.length,
    sin_problemas: iniciadas.filter((e) => e.resultado === "ok" || e.resultado === "con_avisos").length,
    con_error: iniciadas.filter((e) => e.resultado === "error").length,
    en_curso: iniciadas.filter((e) => e.resultado === "en_curso").length,
    entrega_mediana_ms: mediana(totales),
    entrega_max_ms: totales.length ? Math.max(...totales) : null,
    pasos,
  };
}
