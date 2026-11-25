import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { calcularCentro } from "@/lib/inteligencia/centro";
import { leerNegocio, NEGOCIO_POR_DEFECTO } from "@/lib/inteligencia/negocio";
import { calcularEstrategico } from "@/lib/estrategico";
import type { Atribucion } from "@/lib/inteligencia/canales";
import { armarBandeja, type Experimento } from "@/lib/inteligencia/recomendaciones";
import { medirExperimentos, lineaBaseAlAplicar } from "@/lib/inteligencia/experimentos";
import { cambiarEstadoRecAnalista } from "@/lib/analista/seguimiento";
import { resolverPropuestaEstratega } from "@/lib/estratega/propuestas";

// Inteligencia comercial (2026-11-24, fase 1; 2026-11-25, fase 2).
// GET ?vista=centro&dias=30&atribucion=ultimo → Centro de control.
// GET ?vista=economia                          → modelo económico real + objetivos.
// GET ?vista=recomendaciones                   → bandeja única (lib/inteligencia/recomendaciones).
// GET ?vista=experimentos                      → experimentos medidos, acciones aceptadas y cambios.
// POST {accion:"guardar_objetivos", ganancia_mensual_objetivo, cac_objetivo}
//                                              → objetivos del negocio (ic_negocios, fuente única).
// POST {accion:"decidir"|"reabrir", clave, …}  → decisión de Manuel (ic_decisiones) y, si la
//                                              recomendación vino del Analista o del Estratega,
//                                              el mismo estado en su herramienta.
// POST {accion:"experimento_aplicado"|"experimento_cerrar", id, …} → ciclo del experimento.
// Nada toca Google, Meta, la web ni clientes: solo datos propios del módulo.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIAS = new Set([7, 14, 30, 90]);

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const q = req.nextUrl.searchParams;
  const negocio = q.get("negocio") || NEGOCIO_POR_DEFECTO;
  try {
    if (q.get("vista") === "economia") {
      const n = await leerNegocio(rest, negocio);
      if (!n) return NextResponse.json({ ok: false, motivo: "negocio_inexistente" }, { status: 404 });
      const [e90, costos] = await Promise.all([
        calcularEstrategico((x) => rest(x), 90, false),
        rest("tarot_costos?activo=eq.true&tipo=eq.fijo&select=nombre,monto,moneda,frecuencia,fecha_desde,fecha_hasta&order=nombre.asc"),
      ]);
      const p = e90.actual.plata;
      const v = p.ventas;
      return NextResponse.json({
        ok: true,
        negocio: n,
        referencia: {
          dias: 90, ventas: v,
          precio_promedio: v > 0 ? p.bruto / v : null,
          por_venta: v > 0 ? { comision: p.comision / v, ia: p.ia / v, audio: p.audio / v, whatsapp: p.wa / v, neto_cobrado: p.neto / v } : null,
          costo_variable: v > 0 ? (p.bruto - p.queda) / v : null,
          margen_contribucion: v > 0 ? p.queda / v : null,
        },
        fijos_mensuales: e90.fijos_mensuales,
        costos_fijos: costos,
        tipo_cambio: e90.tipo_cambio,
        costos_unitarios: e90.costos_unitarios,
      });
    }
    if (q.get("vista") === "recomendaciones") {
      return NextResponse.json(await armarBandeja(rest, { negocio }));
    }
    if (q.get("vista") === "experimentos") {
      const [exps, aceptadas] = await Promise.all([
        rest(`ic_experimentos?negocio_id=eq.${encodeURIComponent(negocio)}&select=*&order=id.asc`) as Promise<Experimento[]>,
        rest(`ic_decisiones?negocio_id=eq.${encodeURIComponent(negocio)}&estado=eq.aceptada&select=*&order=decidida_at.desc`),
      ]);
      const r = await medirExperimentos(rest, exps);
      return NextResponse.json({ ok: true, ...r, aceptadas });
    }
    const dias = DIAS.has(Number(q.get("dias"))) ? Number(q.get("dias")) : 30;
    const atribucion: Atribucion = q.get("atribucion") === "primero" ? "primero" : "ultimo";
    const r = await calcularCentro((x) => rest(x), { negocio, dias, atribucion });
    return NextResponse.json(r, { status: r.ok ? 200 : 404 });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; negocio?: string; ganancia_mensual_objetivo?: unknown; cac_objetivo?: unknown } & Record<string, unknown>;
  try {
    if (b.accion === "decidir" || b.accion === "reabrir") return await decidir(rest, b);
    if (b.accion === "experimento_aplicado" || b.accion === "experimento_cerrar") return await cicloExperimento(rest, b);
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (b.accion !== "guardar_objetivos") return NextResponse.json({ ok: false, motivo: "accion_invalida" }, { status: 400 });
  const numero = (v: unknown, nombre: string, permiteCero: boolean): number | null | string => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (!permiteCero && n === 0) || n > 1e9) return `${nombre}: tiene que ser un número ${permiteCero ? "de 0 o más" : "mayor que 0"}.`;
    return Math.round(n * 100) / 100;
  };
  const ganancia = numero(b.ganancia_mensual_objetivo, "Ganancia mensual", true);
  if (typeof ganancia === "string") return NextResponse.json({ ok: false, motivo: ganancia }, { status: 400 });
  const cac = numero(b.cac_objetivo, "CAC objetivo", false);
  if (typeof cac === "string") return NextResponse.json({ ok: false, motivo: cac }, { status: 400 });
  try {
    const id = b.negocio || NEGOCIO_POR_DEFECTO;
    const filas = (await rest(`ic_negocios?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ganancia_mensual_objetivo: ganancia, cac_objetivo: cac, updated_at: new Date().toISOString() }),
    })) as unknown[];
    if (!filas?.length) return NextResponse.json({ ok: false, motivo: "negocio_inexistente" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// ── Decisiones de la bandeja ────────────────────────────────────────────────
type RestT = NonNullable<ReturnType<typeof restSupabase>>;
const CLAVE = /^(regla|centro|estratega|analista|experimento):[\w:.\-]{1,200}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const ESTADOS = new Set(["aceptada", "descartada", "pospuesta", "hecha", "no_aplica"]);
const ESTADO_ANALISTA: Record<string, string | null> = { aceptada: "en_curso", hecha: "hecha", descartada: "descartada", no_aplica: "descartada", pospuesta: null };
const mal = (motivo: string) => NextResponse.json({ ok: false, motivo }, { status: 400 });
const hoyUY = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function decidir(rest: RestT, b: Record<string, unknown>) {
  const clave = String(b.clave ?? "");
  if (!CLAVE.test(clave)) return mal("Recomendación inválida.");
  const negocio = typeof b.negocio === "string" && b.negocio ? b.negocio : NEGOCIO_POR_DEFECTO;
  const refs = (Array.isArray(b.refs) ? b.refs : [])
    .filter((r): r is { tipo: string; id: string } => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" && UUID.test((r as { id: string }).id) && ["analista", "estratega"].includes(String((r as { tipo?: unknown }).tipo)))
    .slice(0, 20);
  const nota = typeof b.nota === "string" ? b.nota.trim().slice(0, 500) || null : null;

  if (b.accion === "reabrir") {
    const [previa] = (await rest(`ic_decisiones?clave=eq.${encodeURIComponent(clave)}&select=fuentes`)) as { fuentes: { tipo: string; id: string }[] | null }[];
    const todas = [...refs, ...(previa?.fuentes ?? [])].filter((r, i, a) => UUID.test(String(r.id)) && a.findIndex((x) => x.id === r.id) === i);
    await rest(`ic_decisiones?clave=eq.${encodeURIComponent(clave)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    for (const r of todas) if (r.tipo === "analista") await cambiarEstadoRecAnalista(rest, r.id, "pendiente");
    return NextResponse.json({ ok: true, aviso: todas.some((r) => r.tipo === "estratega") ? "Las propuestas del Estratega ya resueltas no se pueden reabrir desde acá." : null });
  }

  const estado = String(b.estado ?? "");
  if (!ESTADOS.has(estado)) return mal("Estado inválido.");
  const titulo = String(b.titulo ?? "").trim().slice(0, 300);
  if (!titulo) return mal("Falta el título.");
  let posponer: string | null = null;
  if (estado === "pospuesta") {
    posponer = typeof b.posponer_hasta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.posponer_hasta) ? b.posponer_hasta : null;
    if (!posponer || posponer <= hoyUY()) return mal("Elegí una fecha futura para volver a mostrarla.");
  }
  if ((estado === "descartada" || estado === "no_aplica") && !nota) return mal("Contá en una frase por qué: queda como aprendizaje.");
  const experimento = typeof b.experimento_id === "string" && /^EXP-\d{3,}$/.test(b.experimento_id) ? b.experimento_id : null;
  const canal = typeof b.canal === "string" ? b.canal.slice(0, 40) : null;

  // 1) El mismo estado en la herramienta de origen (para que sus pantallas no queden desfasadas).
  for (const r of refs) {
    if (r.tipo === "analista") {
      const e = ESTADO_ANALISTA[estado];
      if (e) await cambiarEstadoRecAnalista(rest, r.id, e, estado === "no_aplica" ? `Ya no aplica${nota ? `: ${nota}` : ""}` : nota);
    } else if (estado !== "pospuesta") {
      const res = await resolverPropuestaEstratega(rest, r.id, estado === "aceptada" || estado === "hecha" ? "aceptar" : "descartar", "Inteligencia comercial");
      if (!res.ok && !/ya no está abierta/.test(res.motivo)) return mal(res.motivo);
    }
  }
  // 2) Una recomendación hecha que no vino del Analista se anota en la bitácora
  //    (el Analista ya lo hace con las suyas): así los experimentos la ven.
  if (estado === "hecha" && !refs.some((r) => r.tipo === "analista")) {
    await rest("tarot_analista_bitacora", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ fecha: hoyUY(), categoria: canal && /ads/.test(canal) ? "publicidad" : "otro", descripcion: `Aplicado (Inteligencia comercial): ${titulo}${nota ? ` (${nota})` : ""}`.slice(0, 500) }),
    });
  }
  // 3) La decisión.
  await rest("ic_decisiones?on_conflict=clave", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ clave, negocio_id: negocio, estado, titulo, canal, nota, posponer_hasta: posponer, experimento_id: experimento, fuentes: refs, decidida_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  return NextResponse.json({ ok: true });
}

// ── Ciclo de un experimento ─────────────────────────────────────────────────
async function cicloExperimento(rest: RestT, b: Record<string, unknown>) {
  const id = String(b.id ?? "");
  if (!/^EXP-\d{3,}$/.test(id)) return mal("Experimento inválido.");
  const [e] = (await rest(`ic_experimentos?id=eq.${id}&select=*`)) as Experimento[];
  if (!e) return mal("No existe ese experimento.");
  const ahora = new Date().toISOString();

  if (b.accion === "experimento_aplicado") {
    if (e.estado !== "planificado") return mal("Solo se puede marcar como aplicado un experimento planificado.");
    const t = Date.parse(String(b.aplicado_desde ?? ""));
    if (!Number.isFinite(t)) return mal("Fecha y hora inválidas.");
    if (t > Date.now() + 5 * 60_000) return mal("La fecha de aplicación no puede ser futura.");
    if (t < new Date(e.created_at).getTime() - 7 * 86_400_000) return mal("La fecha es muy anterior a cuando se planificó.");
    const linea_base = await lineaBaseAlAplicar(rest, e, t);
    await rest(`ic_experimentos?id=eq.${id}&estado=eq.planificado`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        estado: "activo", aplicado_desde: new Date(t).toISOString(), linea_base,
        faltantes: (e.faltantes ?? []).filter((f) => !/^Todavía no está aplicada/.test(f) && !/línea base exacta se congela/.test(f)),
        updated_at: ahora,
      }),
    });
    await rest("tarot_analista_bitacora", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ fecha: new Date(t - 3 * 3600_000).toISOString().slice(0, 10), categoria: /ads/.test(e.canal) ? "publicidad" : "otro", descripcion: `Experimento ${id} aplicado: ${e.nombre}`.slice(0, 500) }),
    });
    return NextResponse.json({ ok: true });
  }

  const estado = b.estado === "cancelado" ? "cancelado" : "cerrado";
  if (e.estado === "cerrado" || e.estado === "cancelado") return mal("El experimento ya está cerrado.");
  const resultado = estado === "cerrado" && typeof b.resultado === "string" && ["exito", "fracaso", "sin_evidencia", "mixto"].includes(b.resultado) ? b.resultado : null;
  if (estado === "cerrado" && !resultado) return mal("Elegí el resultado.");
  const conclusion = typeof b.conclusion === "string" ? b.conclusion.trim().slice(0, 2000) : "";
  if (!conclusion) return mal("Escribí la conclusión: es lo que queda como aprendizaje.");
  const aprendizaje = typeof b.aprendizaje === "string" ? b.aprendizaje.trim().slice(0, 2000) || null : null;
  await rest(`ic_experimentos?id=eq.${id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado, resultado, conclusion, aprendizaje, updated_at: ahora }),
  });
  return NextResponse.json({ ok: true });
}
