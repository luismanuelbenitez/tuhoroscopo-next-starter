import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { calcularEstrategico } from "@/lib/estrategico";

// Presupuesto (2026-10-31): costos fijos y puntuales (tarot_costos), gasto de
// publicidad (campaign_costs) y costos de referencia por venta
// (tarot_configuracion). Solo tablas internas: nada de esto toca clientes.

const CLAVES_CONFIG = new Set(["tipo_cambio_usd_uyu", "whatsapp_costo_por_mensaje_usd", "tts_costo_por_1000_caracteres_usd"]);
const CATEGORIAS = new Set(["infraestructura", "herramientas", "dominio", "licencias", "operativo", "otros"]);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function entorno() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const rest = async (q: string, init?: RequestInit) => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${q}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) }, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
  return rest;
}

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = entorno();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const [costos, publicidad, config, resumen] = await Promise.all([
      rest(`tarot_costos?select=*&order=tipo.asc,activo.desc,fecha_desde.desc`),
      rest(`campaign_costs?select=id,date,platform,utm_campaign,amount,currency,notes&order=date.desc&limit=60`),
      rest(`tarot_configuracion?clave=in.(${Array.from(CLAVES_CONFIG).join(",")})&select=clave,valor,descripcion`),
      calcularEstrategico((q) => rest(q), 30, false),
    ]);
    return NextResponse.json({ ok: true, costos, publicidad, config, resumen });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = entorno();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b.accion !== "string") return NextResponse.json({ ok: false, motivo: "body_invalido" }, { status: 400 });
  const malo = (detalle: string) => NextResponse.json({ ok: false, motivo: "dato_invalido", detalle }, { status: 400 });

  try {
    switch (b.accion) {
      case "guardar_costo": {
        const tipo = b.tipo === "puntual" ? "puntual" : "fijo";
        const monto = Number(b.monto);
        if (!String(b.nombre ?? "").trim()) return malo("Falta el nombre");
        if (!Number.isFinite(monto) || monto < 0) return malo("Monto inválido");
        if (!FECHA.test(String(b.fecha_desde ?? ""))) return malo("Fecha inválida");
        if (b.fecha_hasta && !FECHA.test(String(b.fecha_hasta))) return malo("Fecha de fin inválida");
        const fila = {
          nombre: String(b.nombre).trim().slice(0, 120),
          categoria: CATEGORIAS.has(b.categoria) ? b.categoria : "otros",
          tipo,
          monto,
          moneda: b.moneda === "UYU" ? "UYU" : "USD",
          frecuencia: tipo === "fijo" ? (b.frecuencia === "anual" ? "anual" : "mensual") : null,
          fecha_desde: b.fecha_desde,
          fecha_hasta: tipo === "fijo" && b.fecha_hasta ? b.fecha_hasta : null,
          activo: b.activo !== false,
          notas: b.notas ? String(b.notas).slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        };
        if (b.id) await rest(`tarot_costos?id=eq.${encodeURIComponent(b.id)}`, { method: "PATCH", body: JSON.stringify(fila) });
        else await rest(`tarot_costos`, { method: "POST", body: JSON.stringify(fila) });
        break;
      }
      case "activar_costo":
        await rest(`tarot_costos?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", body: JSON.stringify({ activo: !!b.activo, updated_at: new Date().toISOString() }) });
        break;
      case "borrar_costo":
        await rest(`tarot_costos?id=eq.${encodeURIComponent(String(b.id))}`, { method: "DELETE" });
        break;
      case "guardar_publicidad": {
        const monto = Number(b.amount);
        if (!FECHA.test(String(b.date ?? ""))) return malo("Fecha inválida");
        if (!Number.isFinite(monto) || monto <= 0) return malo("Monto inválido");
        await rest(`campaign_costs`, {
          method: "POST",
          body: JSON.stringify({
            date: b.date, amount: monto, currency: b.currency === "USD" ? "USD" : "UYU",
            platform: String(b.platform || "meta").slice(0, 40),
            utm_source: b.platform === "google" ? "google" : "facebook",
            utm_campaign: b.utm_campaign ? String(b.utm_campaign).slice(0, 120) : null,
            notes: b.notes ? String(b.notes).slice(0, 300) : null,
          }),
        });
        break;
      }
      case "borrar_publicidad":
        await rest(`campaign_costs?id=eq.${encodeURIComponent(String(b.id))}`, { method: "DELETE" });
        break;
      case "config": {
        if (!CLAVES_CONFIG.has(b.clave)) return malo("Clave no editable");
        const v = Number(b.valor);
        if (!Number.isFinite(v) || v < 0) return malo("Valor inválido");
        await rest(`tarot_configuracion?clave=eq.${encodeURIComponent(b.clave)}`, { method: "PATCH", body: JSON.stringify({ valor: String(v), updated_at: new Date().toISOString() }) });
        break;
      }
      default:
        return NextResponse.json({ ok: false, motivo: "accion_desconocida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
