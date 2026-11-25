import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
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
import { leerMemoria, CONFIANZA_DE_NIVEL, type Nivel } from "@/lib/inteligencia/memoria";
import { crearAprendizaje, editarAprendizaje, bajaAprendizaje } from "@/lib/analista/memoria";
import { armarPaquete, generarDiagnostico, costoEstimadoDiagnostico, MODELO_DIAGNOSTICO } from "@/lib/inteligencia/diagnostico";
import { MODELOS, claveAnalista, NOMBRE_CLAVE } from "@/lib/analista/informe";

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
// GET ?vista=aprendizaje / ?vista=diagnosticos  → fase 3 (2026-11-25): resultados, memoria
//                                              única y diagnósticos IA hechos.
// POST {accion:"memoria_crear"|"memoria_editar"|"memoria_baja"|"memoria_reactivar"} → memoria única.
// POST {accion:"diagnosticar"}                 → diagnóstico ejecutivo con IA (solo a pedido;
//                                              respeta el tope mensual de IA del panel).
// Nada toca Google, Meta, la web ni clientes: solo datos propios del módulo.
export const dynamic = "force-dynamic";
// El diagnóstico IA corre en segundo plano (waitUntil) dentro de esta función.
export const maxDuration = 300;

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
    if (q.get("vista") === "aprendizaje") {
      const [memoria, exps, decisiones] = await Promise.all([
        leerMemoria(rest, negocio),
        rest(`ic_experimentos?negocio_id=eq.${encodeURIComponent(negocio)}&select=*&order=id.asc`) as Promise<Experimento[]>,
        rest(`ic_decisiones?negocio_id=eq.${encodeURIComponent(negocio)}&select=*&order=decidida_at.desc&limit=300`),
      ]);
      return NextResponse.json({ ok: true, memoria, experimentos: exps, decisiones });
    }
    if (q.get("vista") === "diagnosticos") {
      const [filas, tope, gasto] = await Promise.all([
        rest(`ic_diagnosticos?negocio_id=eq.${encodeURIComponent(negocio)}&select=id,estado,modelo,texto,tokens_entrada,tokens_salida,costo_usd,duracion_ms,error,created_at&order=created_at.desc&limit=10`),
        topeIa(rest), gastoIaMes(rest),
      ]);
      for (const f of filas as { estado: string; created_at: string; error: string | null }[]) {
        if (f.estado === "generando" && Date.now() - new Date(f.created_at).getTime() > VENCIDO_DIAG_MS) { f.estado = "error"; f.error = f.error ?? "Se cortó antes de terminar."; }
      }
      return NextResponse.json({ ok: true, diagnosticos: filas, modelo: MODELOS[MODELO_DIAGNOSTICO].nombre, costo_estimado_usd: costoEstimadoDiagnostico(), gasto_mes_usd: gasto, tope_mensual_usd: tope, clave_configurada: !!claveAnalista() });
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
    if (typeof b.accion === "string" && b.accion.startsWith("memoria_")) return await accionMemoria(rest, b);
    if (b.accion === "diagnosticar") return await diagnosticar(rest, b);
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
      // "Ya está hecha": el pendiente que crea la aceptación nace resuelto.
      if (res.ok && estado === "hecha" && res.pendiente_id) {
        await rest(`admin_pendientes?id=eq.${res.pendiente_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "resuelto", resuelto_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      }
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
  // Nivel de evidencia: solo es "hecho" si se juzgó con el volumen mínimo y dio un resultado claro.
  let volumenOk = false;
  if (estado === "cerrado") {
    const m = await medirExperimentos(rest, [e]);
    volumenOk = m.experimentos[0]?.evaluacion === "listo_para_juzgar";
  }
  await rest(`ic_experimentos?id=eq.${id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado, resultado, conclusion, aprendizaje, updated_at: ahora }),
  });
  const nivel: Nivel = estado === "cerrado" && volumenOk && (resultado === "exito" || resultado === "fracaso") ? "hecho" : resultado === "mixto" && volumenOk ? "senal" : "hipotesis";
  await crearAprendizaje(rest, {
    texto: `${id}${estado === "cancelado" ? " (cancelado)" : ""}: ${aprendizaje ?? conclusion}`.slice(0, 600),
    area: /ads/.test(e.canal) ? "trafico" : "otro", confianza: CONFIANZA_DE_NIVEL[nivel],
    evidencia: `${conclusion}${estado === "cerrado" && !volumenOk ? " (Cerrado sin el volumen mínimo para juzgarlo.)" : ""}`.slice(0, 1000),
    canal: e.canal, resultado: resultado === "exito" ? "funciono" : resultado === "fracaso" ? "no_funciono" : null, ref: id,
  }, "experimento");
  return NextResponse.json({ ok: true });
}

// ── Memoria única (fase 3) ──────────────────────────────────────────────────
async function accionMemoria(rest: RestT, b: Record<string, unknown>) {
  const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : null;
  const nivel = typeof b.nivel === "string" && b.nivel in CONFIANZA_DE_NIVEL ? (b.nivel as Nivel) : null;
  const entrada = { texto: b.texto, area: b.area, confianza: nivel ? CONFIANZA_DE_NIVEL[nivel] : b.confianza, evidencia: b.evidencia, canal: b.canal ?? null, resultado: b.resultado ?? null, ref: b.ref ?? null };
  switch (b.accion) {
    case "memoria_crear": { const r = await crearAprendizaje(rest, entrada); return r.ok ? NextResponse.json({ ok: true }) : mal(r.detalle); }
    case "memoria_editar": { if (!id) return mal("Falta id."); const r = await editarAprendizaje(rest, id, entrada); return r.ok ? NextResponse.json({ ok: true }) : mal(r.detalle); }
    case "memoria_baja": if (!id) return mal("Falta id."); if (!String(b.motivo ?? "").trim()) return mal("Contá por qué deja de valer: queda guardado."); await bajaAprendizaje(rest, id, "descartar", b.motivo); return NextResponse.json({ ok: true });
    case "memoria_reactivar": if (!id) return mal("Falta id."); await bajaAprendizaje(rest, id, "reactivar"); return NextResponse.json({ ok: true });
    default: return mal("Acción inválida.");
  }
}

// ── Diagnóstico ejecutivo con IA (fase 3, solo a pedido) ───────────────────
const VENCIDO_DIAG_MS = 10 * 60_000;
const inicioDeMesUY = () => { const d = new Date(Date.now() - 3 * 3600_000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 3)).toISOString(); };
/** Tope mensual de IA del panel: el mismo que el del Analista (Admin → Analista → configuración). */
async function topeIa(rest: RestT): Promise<number | null> {
  const [cfg] = (await rest("tarot_analista_config?id=eq.1&select=tope_mensual_usd").catch(() => [])) as { tope_mensual_usd: number | null }[];
  return cfg?.tope_mensual_usd != null ? Number(cfg.tope_mensual_usd) : null;
}
/** Gasto de IA del mes en lo que comparte el tope: informes del Analista + diagnósticos. */
async function gastoIaMes(rest: RestT) {
  const desde = inicioDeMesUY();
  const [a, d] = await Promise.all([
    rest(`tarot_analista_informes?created_at=gte.${desde}&select=costo_usd`).catch(() => []),
    rest(`ic_diagnosticos?created_at=gte.${desde}&select=costo_usd`).catch(() => []),
  ]) as { costo_usd: number | null }[][];
  return [...a, ...d].reduce((t, r) => t + (Number(r.costo_usd) || 0), 0);
}
async function diagnosticar(rest: RestT, b: Record<string, unknown>) {
  if (!claveAnalista()) return mal(`Falta ${NOMBRE_CLAVE} en Vercel.`);
  const negocio = typeof b.negocio === "string" && b.negocio ? b.negocio : NEGOCIO_POR_DEFECTO;
  const [enCurso, tope, gasto] = await Promise.all([
    rest(`ic_diagnosticos?estado=eq.generando&created_at=gte.${new Date(Date.now() - VENCIDO_DIAG_MS).toISOString()}&select=id`),
    topeIa(rest), gastoIaMes(rest),
  ]);
  if ((enCurso as unknown[]).length) return mal("Ya hay un diagnóstico generándose.");
  if (tope != null && gasto + costoEstimadoDiagnostico() > tope) return mal(`Llegarías al tope mensual de IA del panel (US$ ${tope.toFixed(2)}; gastado US$ ${gasto.toFixed(2)}).`);
  const paquete = await armarPaquete(rest, negocio);
  const [fila] = (await rest("ic_diagnosticos", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ negocio_id: negocio, estado: "generando", modelo: MODELO_DIAGNOSTICO, paquete }),
  })) as { id: string }[];
  waitUntil(generarDiagnostico(rest, fila.id, paquete));
  return NextResponse.json({ ok: true, id: fila.id });
}
