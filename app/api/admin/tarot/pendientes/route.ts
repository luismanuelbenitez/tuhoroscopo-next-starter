import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import {
  AREAS_PENDIENTE, ESTADOS_ACTIVOS, ESTADOS_PENDIENTE, RESPONSABLES, estaVencido, leerSenales, venceHoy, type Pendiente,
} from "@/lib/pendientes";

// Pendientes (2026-11-02). GET: lista propia + señales de Normativa y Meta Ads;
// ?solo_contador=true devuelve solo los urgentes (vencidos, vencen hoy o
// prioridad alta) para el número del menú. POST: alta (también "convertir una
// señal", con origen + origen_ref). PATCH: edición. DELETE: borrar.
export const dynamic = "force-dynamic";

const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const enLista = <T extends string>(v: unknown, lista: readonly T[]) => (typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null);
const ID = /^[0-9a-f-]{36}$/i;

function campos(b: Record<string, unknown>) {
  const enlace = txt(b.enlace, 300);
  return {
    titulo: txt(b.titulo, 160),
    detalle: txt(b.detalle, 2000),
    area: enLista(b.area, Object.keys(AREAS_PENDIENTE)),
    responsable: enLista(b.responsable, Object.keys(RESPONSABLES)),
    prioridad: enLista(b.prioridad, ["alta", "media", "baja"] as const),
    estado: enLista(b.estado, Object.keys(ESTADOS_PENDIENTE)),
    vence: b.vence === "" ? null : fecha(b.vence),
    enlace: enlace && (enlace.startsWith("/") || enlace.startsWith("https://")) ? enlace : null,
    notas: txt(b.notas, 2000),
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const todos = (await rest("admin_pendientes?select=*&order=created_at.desc&limit=500")) as Pendiente[];
    const activos = todos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
    const urgentes = activos.filter((p) => estaVencido(p) || venceHoy(p) || p.prioridad === "alta").length;
    if (req.nextUrl.searchParams.get("solo_contador") === "true") return NextResponse.json({ ok: true, urgentes });
    const senales = await leerSenales(rest, new Set(todos.map((p) => p.origen_ref).filter((r): r is string => !!r)));
    return NextResponse.json({ ok: true, pendientes: todos, senales, urgentes });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const c = campos(b);
  if (!c.titulo || c.titulo.length < 3) return NextResponse.json({ ok: false, motivo: "titulo_requerido" }, { status: 400 });
  const origen = enLista(b.origen, ["manual", "meta_ads", "normativa", "asistente"] as const) ?? "manual";
  const origen_ref = origen === "manual" ? null : txt(b.origen_ref, 200);
  const fila = Object.fromEntries(Object.entries({ ...c, origen, origen_ref }).filter(([, v]) => v !== null));
  try {
    await rest("admin_pendientes", { method: "POST", body: JSON.stringify(fila) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dup = msg.includes("23505") || msg.includes("duplicate");
    return NextResponse.json({ ok: false, motivo: dup ? "ya_existe" : "error", detalle: msg }, { status: dup ? 409 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && ID.test(b.id) ? b.id : null;
  if (!id) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });
  const c = campos(b);
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(c)) if (k in b && (v !== null || ["detalle", "vence", "enlace", "notas"].includes(k))) cambios[k] = v;
  if ("estado" in cambios) cambios.resuelto_at = cambios.estado === "resuelto" ? new Date().toISOString() : null;
  try {
    await rest(`admin_pendientes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(cambios) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID.test(id)) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });
  try {
    await rest(`admin_pendientes?id=eq.${id}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
