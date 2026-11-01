import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { FOCOS, MODELOS, NOMBRE_CLAVE, claveAnalista, generarInforme, type Esfuerzo, type Foco, type Modelo } from "@/lib/analista/informe";
import { FUENTES_POR_DEFECTO } from "@/lib/analista/datos";

// Analista de conversión (2026-11-01). GET: historial de informes (o uno con
// ?informe=<id>; &datos=1 suma el paquete que vio la IA). POST: generar un
// informe (corre en segundo plano y la pantalla consulta hasta que termine)
// o borrar uno. Solo lee datos agregados; no le escribe a nadie.

export const maxDuration = 600;
const DIAS_PERMITIDOS = new Set([7, 14, 30, 60, 90]);
const VENCIDO_MS = 15 * 60_000; // un "generando" más viejo que esto se cortó

const inicioDeMes = () => {
  const d = new Date(Date.now() - 3 * 3600_000); // fecha de Uruguay
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 3)).toISOString();
};

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const id = req.nextUrl.searchParams.get("informe");
    if (id) {
      const campos = req.nextUrl.searchParams.get("datos") === "1" ? "*" : "id,estado,foco,periodo_desde,periodo_hasta,modelo,esfuerzo,contenido,tokens_entrada,tokens_salida,costo_usd,duracion_ms,error,created_at";
      const idq = encodeURIComponent(id);
      const recCampos = "id,informe_id,indice,prioridad,accion,donde,estado,nota,estado_at,evaluacion_veredicto,evaluacion_texto,evaluado_at";
      const [[fila], recomendaciones, evaluadas] = await Promise.all([
        rest(`tarot_analista_informes?id=eq.${idq}&select=${campos}`),
        rest(`tarot_analista_recomendaciones?informe_id=eq.${idq}&select=${recCampos}&order=indice.asc`),
        rest(`tarot_analista_recomendaciones?evaluado_informe_id=eq.${idq}&select=${recCampos}`),
      ]);
      return NextResponse.json({ ok: !!fila, informe: fila ?? null, recomendaciones, evaluadas });
    }
    // Historial: los últimos 30, o todo (?todos=1) con búsqueda por titular (?q=) y foco (?foco=).
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").replace(/[*,()]/g, " ").trim().slice(0, 80);
    const filtroFoco = sp.get("foco") && sp.get("foco")! in FOCOS ? `&foco=eq.${sp.get("foco")}` : "";
    const filtroQ = q ? `&contenido->>titular=ilike.*${encodeURIComponent(q)}*` : "";
    const limite = sp.get("todos") === "1" ? 500 : 30;
    const [historial, [config], mes] = await Promise.all([
      rest(`tarot_analista_informes?select=id,estado,foco,periodo_desde,periodo_hasta,modelo,esfuerzo,costo_usd,duracion_ms,error,created_at,titular:contenido->>titular,estado_general:contenido->>estado${filtroFoco}${filtroQ}&order=created_at.desc&limit=${limite}`),
      rest(`tarot_analista_config?id=eq.1&select=modelo,esfuerzo,tope_mensual_usd`),
      rest(`tarot_analista_informes?created_at=gte.${inicioDeMes()}&select=costo_usd`),
    ]);
    const ahora = Date.now();
    for (const h of historial) {
      if (h.estado === "generando" && ahora - new Date(h.created_at).getTime() > VENCIDO_MS) { h.estado = "error"; h.error = h.error ?? "Se cortó antes de terminar."; }
    }
    return NextResponse.json({
      ok: true, historial, config, focos: FOCOS,
      gasto_mes_usd: mes.reduce((t: number, r: { costo_usd: number | null }) => t + (Number(r.costo_usd) || 0), 0),
      clave_configurada: !!claveAnalista(),
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = await req.json().catch(() => null);
  try {
    if (b?.accion === "borrar") {
      if (typeof b.id !== "string") return NextResponse.json({ ok: false, motivo: "falta_id" }, { status: 400 });
      await rest(`tarot_analista_informes?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
      return NextResponse.json({ ok: true });
    }
    if (b?.accion === "recomendacion_estado") return await cambiarEstadoRecomendacion(rest, b);
    if (b?.accion !== "generar") return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });

    if (!claveAnalista()) return NextResponse.json({ ok: false, motivo: "sin_clave", detalle: `Falta ${NOMBRE_CLAVE} en Vercel.` }, { status: 400 });
    const foco: Foco = b.foco in FOCOS ? b.foco : "general";
    const dias = DIAS_PERMITIDOS.has(Number(b.dias)) ? Number(b.dias) : 7;

    const [[config], enCurso, mes] = await Promise.all([
      rest(`tarot_analista_config?id=eq.1&select=*`),
      rest(`tarot_analista_informes?estado=eq.generando&created_at=gte.${new Date(Date.now() - VENCIDO_MS).toISOString()}&select=id`),
      rest(`tarot_analista_informes?created_at=gte.${inicioDeMes()}&select=costo_usd`),
    ]);
    if (enCurso.length) return NextResponse.json({ ok: false, motivo: "en_curso", detalle: "Ya hay un informe generándose." }, { status: 409 });
    const gastado = mes.reduce((t: number, r: { costo_usd: number | null }) => t + (Number(r.costo_usd) || 0), 0);
    if (config?.tope_mensual_usd != null && gastado >= Number(config.tope_mensual_usd)) {
      return NextResponse.json({ ok: false, motivo: "tope", detalle: `Llegaste al tope mensual (US$ ${Number(config.tope_mensual_usd).toFixed(2)}).` }, { status: 409 });
    }
    const modelo: Modelo = config?.modelo in MODELOS ? config.modelo : "claude-opus-5-5";
    const esfuerzo: Esfuerzo = ["medium", "high", "xhigh"].includes(config?.esfuerzo) ? config.esfuerzo : "high";
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - dias * 86_400_000);
    const [fila] = await rest("tarot_analista_informes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ estado: "generando", foco, periodo_desde: desde.toISOString(), periodo_hasta: hasta.toISOString(), modelo, esfuerzo }),
    });
    // Corre después de responder: la pantalla consulta el estado cada pocos segundos.
    waitUntil(generarInforme(rest, fila.id, {
      foco, dias, modelo, esfuerzo,
      fuentes: { ...FUENTES_POR_DEFECTO, ...(config?.fuentes ?? {}) },
      contextoNegocio: config?.contexto_negocio ?? "",
      minimoVisitas: Number(config?.minimo_visitas) || 100,
    }));
    return NextResponse.json({ ok: true, id: fila.id });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Seguimiento (2026-11-01): Manuel marca cada recomendación. Al marcarla
// "hecha" se anota en la bitácora (así el próximo informe sabe desde cuándo
// comparar); si después cambia de estado, esa entrada se borra.
const ESTADOS_REC = new Set(["pendiente", "en_curso", "hecha", "descartada"]);
const CATEGORIA_POR_DONDE: Record<string, string> = {
  meta: "publicidad", pagina_tarot: "web", checkout: "web", medicion: "web", oferta: "precio", postcompra: "producto",
};
async function cambiarEstadoRecomendacion(rest: NonNullable<ReturnType<typeof restSupabase>>, b: { id?: unknown; estado?: unknown; nota?: unknown }) {
  if (typeof b.id !== "string" || !ESTADOS_REC.has(String(b.estado))) return NextResponse.json({ ok: false, motivo: "invalido" }, { status: 400 });
  const [rec] = await rest(`tarot_analista_recomendaciones?id=eq.${encodeURIComponent(b.id)}&select=id,accion,donde,estado,bitacora_id`);
  if (!rec) return NextResponse.json({ ok: false, motivo: "no_existe" }, { status: 404 });
  const estado = String(b.estado);
  const nota = typeof b.nota === "string" ? b.nota.trim().slice(0, 500) || null : null;
  let bitacoraId: string | null = rec.bitacora_id;
  if (estado === "hecha" && !bitacoraId) {
    const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const [fila] = await rest("tarot_analista_bitacora", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ fecha: hoy, categoria: CATEGORIA_POR_DONDE[rec.donde] ?? "otro", descripcion: `Recomendación aplicada: ${rec.accion}${nota ? ` (${nota})` : ""}`.slice(0, 500) }),
    });
    bitacoraId = fila?.id ?? null;
  } else if (estado !== "hecha" && bitacoraId) {
    await rest(`tarot_analista_bitacora?id=eq.${bitacoraId}`, { method: "DELETE" });
    bitacoraId = null;
  }
  await rest(`tarot_analista_recomendaciones?id=eq.${rec.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado, nota, estado_at: new Date().toISOString(), bitacora_id: bitacoraId }),
  });
  return NextResponse.json({ ok: true });
}
