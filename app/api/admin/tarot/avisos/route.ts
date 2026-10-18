import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// Avisos importantes del panel de Tarot (2026-10-18): estado operativo que
// conviene tener siempre a la vista — modo de cobro, a quién se envía
// WhatsApp y cuánto del tope diario se usó hoy. Solo lectura.

type Nivel = "info" | "atencion" | "critico";
interface Aviso { nivel: Nivel; titulo: string; detalle: string }

function inicioDiaMontevideoISO(): string {
  const ahoraMvd = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(ahoraMvd.getUTCFullYear(), ahoraMvd.getUTCMonth(), ahoraMvd.getUTCDate(), 3, 0, 0)).toISOString();
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };

  const claves = ["mp_modo", "whatsapp_modo", "whatsapp_destinos", "whatsapp_limite_diario", "whatsapp_numeros_autorizados_prueba"];
  const [cfgRes, enviadosRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/tarot_configuracion?activo=eq.true&clave=in.(${claves.join(",")})&select=clave,valor`, { headers, cache: "no-store" }),
    fetch(`${supabaseUrl}/rest/v1/tarot_envios_whatsapp?estado=eq.enviado&created_at=gte.${encodeURIComponent(inicioDiaMontevideoISO())}&select=id&limit=1`, { headers, cache: "no-store" }),
  ]);
  if (!cfgRes.ok) return NextResponse.json({ ok: false, motivo: "db_error" }, { status: 502 });

  const rows: { clave: string; valor: string }[] = await cfgRes.json();
  const cfg = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  const rango = enviadosRes.headers.get("content-range") ?? "";
  const enviadosHoy = Number(rango.split("/")[1] ?? 0) || 0;

  const mpProd = cfg.mp_modo === "production";
  const waProd = cfg.whatsapp_modo === "production";
  const soloLista = cfg.whatsapp_destinos === "lista" || (waProd && !mpProd);
  const limite = Math.max(0, Math.floor(Number(cfg.whatsapp_limite_diario ?? 0)) || 0);
  const nLista = (cfg.whatsapp_numeros_autorizados_prueba ?? "").split(",").map((x) => x.trim()).filter(Boolean).length;

  const avisos: Aviso[] = [];

  avisos.push(mpProd
    ? { nivel: "info", titulo: "Mercado Pago en producción", detalle: "Se cobran pagos reales." }
    : { nivel: "atencion", titulo: "Mercado Pago en sandbox", detalle: "No se cobra dinero real: las compras son de prueba." });

  if (!waProd) {
    avisos.push({ nivel: "atencion", titulo: "WhatsApp en sandbox", detalle: "Ningún WhatsApp se envía de verdad: todos se simulan." });
  } else if (soloLista) {
    avisos.push({
      nivel: "atencion",
      titulo: "WhatsApp restringido a la lista",
      detalle: `Solo reciben WhatsApp real los ${nLista} números autorizados; al resto se le simula el envío${mpProd ? " (¡con cobro real!)" : ""}.`,
    });
  } else {
    avisos.push({ nivel: "info", titulo: "WhatsApp abierto a cualquier número", detalle: "Se envía a todos los clientes." });
  }

  if (waProd && limite > 0) {
    const pct = enviadosHoy / limite;
    avisos.push({
      nivel: enviadosHoy >= limite ? "critico" : pct >= 0.8 ? "atencion" : "info",
      titulo: enviadosHoy >= limite ? "Tope diario de WhatsApp alcanzado" : "Tope diario de WhatsApp",
      detalle: enviadosHoy >= limite
        ? `${enviadosHoy} de ${limite} hoy. Las órdenes nuevas quedan en error_whatsapp hasta mañana o hasta subir el tope — reenvialas desde Entregas.`
        : `${enviadosHoy} de ${limite} enviados hoy.`,
    });
  } else if (waProd) {
    avisos.push({ nivel: "atencion", titulo: "WhatsApp sin tope diario", detalle: "El límite de seguridad está desactivado (0)." });
  }

  return NextResponse.json({ ok: true, avisos });
}
