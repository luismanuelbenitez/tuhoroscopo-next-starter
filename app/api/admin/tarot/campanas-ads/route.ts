import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// Campañas de anuncios (2026-10-22). Registro desde el Admin + resumen con
// visitas, compras y gasto unidos por utm_campaign. El gasto se carga con el
// endpoint existente de Adquisición (POST /api/admin/tarot/adquisicion).
export const dynamic = "force-dynamic";

const cliente = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const ID_CAMPANA = /^[a-z0-9][a-z0-9_-]{1,59}$/;
const ESTADOS = ["borrador", "activa", "pausada", "finalizada"];
const MONEDAS = ["USD", "UYU"];

const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const numero = (v: unknown) => (v === "" || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

function campos(body: Record<string, unknown>) {
  const destino = txt(body.destino_path, 200);
  return {
    nombre: txt(body.nombre, 120),
    objetivo: txt(body.objetivo, 300),
    destino_path: destino && destino.startsWith("/") ? destino : null,
    presupuesto: numero(body.presupuesto),
    moneda: typeof body.moneda === "string" && MONEDAS.includes(body.moneda) ? body.moneda : null,
    fecha_inicio: fecha(body.fecha_inicio),
    fecha_fin: fecha(body.fecha_fin),
    estado: typeof body.estado === "string" && ESTADOS.includes(body.estado) ? body.estado : null,
    notas: txt(body.notas, 2000),
  };
}

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const { data, error } = await cliente().rpc("ads_campanas_resumen");
  if (error) return NextResponse.json({ ok: false, motivo: "error_query", detalle: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(data as object) });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const utm = typeof body.utm_campaign === "string" ? body.utm_campaign.trim().toLowerCase() : "";
  if (!ID_CAMPANA.test(utm)) return NextResponse.json({ ok: false, motivo: "identificador_invalido" }, { status: 400 });
  const c = campos(body);
  if (!c.nombre) return NextResponse.json({ ok: false, motivo: "nombre_requerido" }, { status: 400 });
  const fila = Object.fromEntries(Object.entries({ ...c, utm_campaign: utm, plataforma: "meta" }).filter(([, v]) => v !== null));
  const { error } = await cliente().from("ads_campanas").insert(fila);
  if (error) {
    const duplicada = error.code === "23505";
    return NextResponse.json({ ok: false, motivo: duplicada ? "identificador_existente" : "error_insert", detalle: error.message }, { status: duplicada ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}

// Edición: el identificador (utm_campaign) NO se puede cambiar — está pegado
// en los anuncios y es lo que une visitas, compras y gasto.
export async function PATCH(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, motivo: "id_requerido" }, { status: 400 });
  const c = campos(body);
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(c)) if (k in body) cambios[k] = v;
  if ("nombre" in cambios && !cambios.nombre) delete cambios.nombre;
  if ("destino_path" in cambios && !cambios.destino_path) delete cambios.destino_path;
  if ("moneda" in cambios && !cambios.moneda) delete cambios.moneda;
  if ("estado" in cambios && !cambios.estado) delete cambios.estado;
  const { error } = await cliente().from("ads_campanas").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ ok: false, motivo: "error_update", detalle: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
