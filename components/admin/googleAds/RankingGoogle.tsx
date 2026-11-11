"use client";
import { useMemo, useState } from "react";
import { Trophy, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

// "Ranking de Google" (2026-11-10, pedido de Manuel: "una representación
// oficial del ranking de Google, todos los datos realmente importantes a la
// vista"). Google no publica un ranking único: el lugar del anuncio (Ad Rank)
// sale de la puja, el Nivel de Calidad y los recursos. Acá va todo lo que
// Google SÍ informa de forma oficial, más el semáforo de las reglas de
// docs/modules/google-ads-optimizacion.md. Solo lectura.

type Comp = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | string | null;
interface PalabraR { id: string; grupo: string; grupo_estado: string; palabra: string; concordancia: string; estado: string; nivel: number | null; ctr: Comp; anuncio: Comp; pagina: Comp; aprobacion: string | null; impresiones: number; clics: number; cuota: number | null; perdida_ranking: number | null; cuota_arriba: number | null; cuota_primera: number | null; cpc_medio: number | null }
interface PiezaR { texto: string; rendimiento: string | null; aprobacion: string | null; fijado: string | null }
interface AnuncioR { id: string; grupo: string; grupo_estado: string; estado: string; url: string | null; fuerza: string | null; acciones: string[]; aprobacion: string | null; revision: string | null; motivos: string[]; titulos: PiezaR[]; descripciones: PiezaR[] }
interface CampanaR { id: string; optimizacion: number | null; inicio: string | null; fin: string | null; tope_cpc: number | null; cuota: number | null; perdida_ranking: number | null; perdida_presupuesto: number | null; cuota_arriba: number | null; cuota_primera: number | null; pct_arriba: number | null; pct_primera: number | null; cpc_medio: number | null; costo: number; clics: number; impresiones: number }
export interface Ranking {
  desde: string; hasta: string;
  campanas: CampanaR[];
  calidad_dias: { fecha: string; grupo: string; palabra: string; concordancia: string; nivel: number | null; ctr: Comp; anuncio: Comp; pagina: Comp }[];
  palabras: PalabraR[];
  anuncios: AnuncioR[];
  recursos: { nivel: string; tipo: string; texto: string | null; estado: string; estado_principal: string | null; motivos: string[]; aprobacion: string | null }[];
  recomendaciones: { tipo: string; campana_id: string | null; descartada: boolean }[];
  negativas: { texto: string; concordancia: string; origen: string }[];
  gasto_dias: { fecha: string; campana_id: string; costo: number; clics: number }[];
}
interface Props {
  ranking: Ranking | null | undefined;
  presupuestos: { id: string; nombre: string; presupuesto_total: number | null; presupuesto_diario: number | null }[];
  terminos: { termino: string; impresiones: number; clics: number; costo: number }[];
  lcpMovilMs: number | null;
  mideCompras: boolean;
  ventas: number;
}

const CONC: Record<string, string> = { BROAD: "amplia", PHRASE: "frase", EXACT: "exacta" };
const COMP: Record<string, { t: string; cls: string }> = {
  ABOVE_AVERAGE: { t: "Por encima", cls: "border-emerald-800/70 bg-emerald-950/40 text-emerald-300" },
  AVERAGE: { t: "Promedio", cls: "border-amber-800/60 bg-amber-950/30 text-amber-300" },
  BELOW_AVERAGE: { t: "Por debajo", cls: "border-red-900/70 bg-red-950/40 text-red-300" },
};
const FUERZA: Record<string, { t: string; ok: boolean }> = { EXCELLENT: { t: "Excelente", ok: true }, GOOD: { t: "Buena", ok: true }, AVERAGE: { t: "Promedio", ok: false }, POOR: { t: "Mala", ok: false }, PENDING: { t: "Calculando", ok: true }, NO_ADS: { t: "Sin anuncios", ok: false } };
const APROB: Record<string, { t: string; tono: "ok" | "aviso" | "mal" }> = { APPROVED: { t: "Aprobado", tono: "ok" }, APPROVED_LIMITED: { t: "Aprobado (limitado)", tono: "aviso" }, AREA_OF_INTEREST_ONLY: { t: "Solo zona de interés", tono: "aviso" }, DISAPPROVED: { t: "Rechazado", tono: "mal" }, UNKNOWN: { t: "Sin revisar", tono: "aviso" } };
const RINDE: Record<string, string> = { BEST: "Mejor", GOOD: "Bueno", LOW: "Bajo", LEARNING: "Aprendiendo", PENDING: "Sin calificar", UNKNOWN: "Sin calificar", UNSPECIFIED: "—" };
const RECURSO: Record<string, string> = { SITELINK: "Enlace a sitio", CALLOUT: "Texto destacado", STRUCTURED_SNIPPET: "Fragmento estructurado", BUSINESS_NAME: "Nombre del negocio", BUSINESS_LOGO: "Logo", LOGO: "Logo", PRICE: "Precio", PROMOTION: "Promoción", CALL: "Llamada", AD_IMAGE: "Imagen" };
const ESTADO_RECURSO: Record<string, string> = { ELIGIBLE: "Activo", PENDING: "Pendiente", LIMITED: "Limitado", NOT_ELIGIBLE: "No se muestra", PAUSED: "Pausado", REMOVED: "Quitado" };
// Recomendaciones de Google y lo que decidimos (manual §1–§5).
const RECOM: Record<string, { t: string; nota?: string }> = {
  SEARCH_PARTNERS_OPT_IN: { t: "Sumar socios de búsqueda", nota: "Descartada: tráfico de peor calidad." },
  DISPLAY_EXPANSION_OPT_IN: { t: "Expandir a Display", nota: "No conviene: es otro público." },
  RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: { t: "Mejorar la fuerza del anuncio" },
  RESPONSIVE_SEARCH_AD_ASSET: { t: "Sumar títulos o descripciones" },
  KEYWORD: { t: "Sumar palabras clave", nota: "Solo con intención de compra (G7)." },
  USE_BROAD_MATCH_KEYWORD: { t: "Pasar a concordancia amplia", nota: "No hasta 15 compras en 30 días (G7)." },
  MAXIMIZE_CONVERSIONS_OPT_IN: { t: "Pujar por conversiones", nota: "Recién con 15 compras en 30 días." },
  TARGET_CPA_OPT_IN: { t: "Usar CPA objetivo", nota: "Recién con 30 compras en 30 días." },
  CAMPAIGN_BUDGET: { t: "Subir el presupuesto" },
  FORECASTING_CAMPAIGN_BUDGET: { t: "Subir el presupuesto (previsión)" },
  SITELINK_ASSET: { t: "Sumar enlaces a sitios" }, CALLOUT_ASSET: { t: "Sumar textos destacados" }, PRICE_ASSET: { t: "Sumar recurso de precio", nota: "Pide 3 productos: hay uno solo." },
  RAISE_TARGET_CPA_BID_TOO_LOW: { t: "Subir el CPA objetivo" }, SET_TARGET_CPA: { t: "Fijar CPA objetivo" },
  ENHANCED_CPC_OPT_IN: { t: "CPC mejorado" }, OPTIMIZE_AD_ROTATION: { t: "Optimizar rotación de anuncios" },
  KEYWORD_MATCH_TYPE: { t: "Cambiar concordancias", nota: "No hasta 15 compras en 30 días (G7)." },
  MOVE_UNUSED_BUDGET: { t: "Mover presupuesto sin usar" }, TARGET_ROAS_OPT_IN: { t: "Usar ROAS objetivo" },
  DYNAMIC_IMAGE_EXTENSION_OPT_IN: { t: "Imágenes dinámicas" }, IMAGE_ASSET: { t: "Sumar imágenes" },
};

// Google informa 0.0999 cuando la cuota es "menos de 10 %".
const cuotaTxt = (v: number | null | undefined) => (v == null ? "—" : v === 0.0999 ? "< 10 %" : `${Math.round(v * 100)} %`);
const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const diaCorto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const activa = (p: { estado: string; grupo_estado: string }) => p.estado === "ENABLED" && p.grupo_estado === "ENABLED";
const DIA = 86_400_000;

function Chip({ v }: { v: Comp }) {
  const c = v ? COMP[v] : null;
  return c ? <span className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold ${c.cls}`}>{c.t}</span> : <span className="text-[10px] text-gray-600">—</span>;
}
function Nota({ n }: { n: number | null }) {
  if (n == null) return <span className="text-gray-600">—</span>;
  return <span className={`font-bold tabular-nums ${n >= 7 ? "text-emerald-300" : n >= 5 ? "text-amber-300" : "text-red-300"}`}>{n}<span className="font-normal text-gray-600">/10</span></span>;
}
function Bloque({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-800 bg-gray-950/50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{titulo}</p>
      {sub && <p className="mb-2 mt-0.5 text-[11px] text-gray-500">{sub}</p>}
      <div className={sub ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

// ¿El término queda bloqueado por alguna negativa? (aproximación de cómo
// compara Google: exacta = igual; frase = contiene la frase; amplia = contiene
// todas las palabras).
function bloqueadoPor(termino: string, negativas: Ranking["negativas"]) {
  const t = sinTilde(termino); const palabras = new Set(t.split(/\s+/));
  return negativas.find((n) => {
    const x = sinTilde(n.texto);
    if (n.concordancia === "EXACT") return t === x;
    if (n.concordancia === "PHRASE") return ` ${t} `.includes(` ${x} `);
    return x.split(/\s+/).every((w) => palabras.has(w));
  }) ?? null;
}

// Línea del Nivel de Calidad promedio por día (una sola serie: sin leyenda).
function LineaCalidad({ puntos }: { puntos: { fecha: string; prom: number; n: number }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  if (puntos.length < 2) return <p className="text-xs text-gray-500">Hace falta más de un día con impresiones para ver la evolución.</p>;
  const W = 400, H = 190, L = 24, R = 8, T = 10, B = 24;
  const x = (i: number) => L + (i * (W - L - R)) / (puntos.length - 1);
  const y = (v: number) => T + ((10 - v) * (H - T - B)) / 9;
  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.prom).toFixed(1)}`).join(" ");
  const cada = Math.ceil(puntos.length / 8);
  const p = sel != null ? puntos[sel] : puntos[puntos.length - 1];
  return (
    <div>
      <p className="mb-1 text-[11px] text-gray-400">{sel != null ? diaCorto(p.fecha) : "Último día"}: <span className="font-semibold text-white">{p.prom.toFixed(1)}/10</span> <span className="text-gray-500">· {p.n} {p.n === 1 ? "palabra" : "palabras"} con dato</span></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Nivel de Calidad promedio por día" onMouseLeave={() => setSel(null)}>
        {[1, 4, 7, 10].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#1f2937" strokeWidth="1" strokeDasharray={v === 7 ? "4 4" : undefined} />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="11" fill="#9ca3af">{v}</text>
          </g>
        ))}
        <path d={linea} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />
        {puntos.map((q, i) => (
          <g key={q.fecha}>
            <circle cx={x(i)} cy={y(q.prom)} r={sel === i ? 5 : 4} fill="#38bdf8" stroke="#030712" strokeWidth="2" />
            {i % cada === 0 || i === puntos.length - 1 ? <text x={x(i)} y={H - 6} textAnchor={i === puntos.length - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="11" fill="#9ca3af">{diaCorto(q.fecha)}</text> : null}
            {/* Zona de toque más grande que el punto */}
            <rect x={x(i) - (W - L - R) / (2 * (puntos.length - 1))} y={T} width={(W - L - R) / (puntos.length - 1)} height={H - T - B} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
          </g>
        ))}
      </svg>
      <p className="text-[10px] text-gray-500">Línea punteada: 7/10, el nivel bueno. Google recalcula la nota con varios días de datos.</p>
    </div>
  );
}

export function RankingGoogle({ ranking: r, presupuestos, terminos, lcpMovilMs, mideCompras, ventas }: Props) {
  const [verTerminos, setVerTerminos] = useState(false);
  const calc = useMemo(() => {
    if (!r) return null;
    const act = r.palabras.filter(activa);
    const conNota = act.filter((p) => p.nivel != null);
    // Promedio ponderado por impresiones (si no hay, simple).
    const pesoTot = conNota.reduce((a, p) => a + (p.impresiones || 0), 0);
    const notaProm = conNota.length ? (pesoTot ? conNota.reduce((a, p) => a + (p.nivel ?? 0) * p.impresiones, 0) / pesoTot : conNota.reduce((a, p) => a + (p.nivel ?? 0), 0) / conNota.length) : null;
    const dias = new Map<string, number[]>();
    for (const d of r.calidad_dias) if (d.nivel != null) dias.set(d.fecha, [...(dias.get(d.fecha) ?? []), d.nivel]);
    const serie = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, v]) => ({ fecha, prom: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }));
    // Evolución por palabra: primera y última nota del período.
    const evol = new Map<string, { primera: number; ultima: number; desde: string }>();
    for (const d of r.calidad_dias) {
      if (d.nivel == null) continue;
      const k = `${d.palabra}|${d.concordancia}`; const e = evol.get(k);
      evol.set(k, e ? { ...e, ultima: d.nivel } : { primera: d.nivel, ultima: d.nivel, desde: d.fecha });
    }
    const anunciosAct = r.anuncios.filter(activa);
    const urls = [...new Set(anunciosAct.map((a) => (a.url ?? "").replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/"))];
    const amplias = act.filter((p) => p.concordancia === "BROAD");
    const repetidas = Object.entries(act.reduce<Record<string, Set<string>>>((a, p) => { const k = `${sinTilde(p.palabra)} (${CONC[p.concordancia] ?? p.concordancia})`; (a[k] ??= new Set()).add(p.grupo); return a; }, {})).filter(([, g]) => g.size > 1).map(([k]) => k);
    const bajas = conNota.filter((p) => (p.nivel ?? 10) <= 4);
    const paginaMal = act.filter((p) => p.pagina === "BELOW_AVERAGE");
    const negTxt = new Set(r.negativas.map((n) => sinTilde(n.texto)));
    const faltanIa = ["ia", "chatgpt"].filter((x) => !negTxt.has(x));
    const camp = r.campanas[0];
    const rechazados = [...anunciosAct.filter((a) => a.aprobacion === "DISAPPROVED"), ...act.filter((p) => p.aprobacion === "DISAPPROVED")];
    const flojos = anunciosAct.filter((a) => a.fuerza && FUERZA[a.fuerza] && !FUERZA[a.fuerza].ok);
    type Regla = { estado: "ok" | "aviso" | "mal" | "info"; t: string; d: string };
    const reglas: Regla[] = [
      { estado: urls.length === 1 && urls[0] === "/tarot" ? "ok" : "mal", t: "Una sola página de destino: /tarot", d: urls.length ? `Anuncios activos llevan a: ${urls.join(", ")}` : "No hay anuncios activos." },
      { estado: amplias.length ? "mal" : "ok", t: "Sin concordancia amplia (G7)", d: amplias.length ? `Activas: ${amplias.map((p) => `«${p.palabra}» (${p.grupo})`).join(", ")}` : "Solo exacta y frase hasta llegar a 15 compras en 30 días." },
      { estado: repetidas.length ? "aviso" : "ok", t: "Sin palabras repetidas entre grupos", d: repetidas.length ? repetidas.join(", ") : "Cada palabra activa está en un solo grupo." },
      { estado: bajas.length ? "aviso" : "ok", t: "Nivel de Calidad 5 o más (G10)", d: bajas.length ? `Con 4 o menos: ${bajas.map((p) => `«${p.palabra}» ${p.nivel}/10`).join(", ")}. Se arregla; si sigue 14 días con 20+ impresiones, se pausa.` : "Ninguna palabra activa con nota baja." },
      { estado: paginaMal.length ? "aviso" : "ok", t: "Experiencia en la página: promedio o mejor", d: paginaMal.length ? `${paginaMal.length} de ${act.filter((p) => p.pagina).length} palabras con la página por debajo del promedio.` : "Google no marca la página por debajo del promedio." },
      { estado: lcpMovilMs == null ? "info" : lcpMovilMs <= 2500 ? "ok" : "aviso", t: "Carga en celular menor a 2,5 s (G12)", d: lcpMovilMs == null ? "Sin medición de PageSpeed." : `Medida: ${(lcpMovilMs / 1000).toFixed(1)} s.` },
      { estado: faltanIa.length ? "aviso" : "ok", t: "Negativas de IA y chatgpt", d: faltanIa.length ? `Faltan: ${faltanIa.join(", ")}` : "Cargadas (acordado el 10/11)." },
      { estado: (camp?.perdida_presupuesto ?? 0) > 0.1 ? "aviso" : "ok", t: "No se pierden búsquedas por presupuesto", d: `Perdido por presupuesto: ${cuotaTxt(camp?.perdida_presupuesto)} · por ranking: ${cuotaTxt(camp?.perdida_ranking)}.` },
      { estado: rechazados.length ? "mal" : "ok", t: "Anuncios y palabras aprobados", d: rechazados.length ? `${rechazados.length} rechazados.` : "Ninguno rechazado (\"limitado\" es normal en tarot: va con la excepción legal)." },
      { estado: flojos.length ? "aviso" : "ok", t: "Fuerza del anuncio Buena o Excelente", d: flojos.length ? flojos.map((a) => `${a.grupo}: ${FUERZA[a.fuerza ?? ""]?.t}`).join(", ") : anunciosAct.map((a) => `${a.grupo}: ${FUERZA[a.fuerza ?? ""]?.t ?? a.fuerza}`).join(" · ") },
      { estado: mideCompras ? "ok" : "mal", t: "Medición de compras activa", d: mideCompras ? `Google recibe cada compra. Ventas de Google medidas en la web en el período: ${ventas}.` : "Google no sabe qué clics compran." },
    ];
    return { act, conNota, notaProm, serie, evol, reglas, camp };
  }, [r, lcpMovilMs, mideCompras, ventas]);

  if (!r || !calc) {
    return (
      <section className="rounded-2xl border border-amber-900/50 bg-amber-950/10 p-5">
        <p className="flex items-center gap-2 text-base font-semibold text-white"><Trophy size={16} className="text-amber-300" /> Ranking de Google</p>
        <p className="mt-1 text-xs text-gray-400">Todavía no hay datos: aparecen después de la próxima lectura de la cuenta (cada hora, o con &quot;Leer ahora&quot;).</p>
      </section>
    );
  }
  const { act, notaProm, serie, evol, reglas, camp } = calc;

  // Gasto y ritmo
  const pres = presupuestos.find((p) => p.id === camp?.id);
  const gastado = r.gasto_dias.filter((g) => g.campana_id === camp?.id).reduce((a, g) => a + Number(g.costo), 0);
  const hoy = Date.now();
  const fin = camp?.fin ? new Date(`${camp.fin.replace(" ", "T")}-03:00`).getTime() : null;
  const inicio = camp?.inicio ? new Date(`${camp.inicio.replace(" ", "T")}-03:00`).getTime() : null;
  const diasRestan = fin ? Math.max(Math.ceil((fin - hoy) / DIA), 0) : null;
  const diasCorridos = inicio ? Math.max(Math.ceil((hoy - inicio) / DIA), 1) : null;
  const total = pres?.presupuesto_total ?? null;
  const queda = total != null ? Math.max(total - gastado, 0) : null;
  const ultimos7 = r.gasto_dias.filter((g) => g.campana_id === camp?.id).slice(-7);
  const ritmoReal = ultimos7.length ? ultimos7.reduce((a, g) => a + Number(g.costo), 0) / ultimos7.length : null;
  const ritmoNecesario = queda != null && diasRestan ? queda / diasRestan : null;
  const proyeccion = ritmoReal != null && diasRestan != null ? gastado + ritmoReal * diasRestan : null;

  // Términos clasificados
  const clasif = terminos.map((t) => {
    const neg = bloqueadoPor(t.termino, r.negativas);
    const clase = neg ? "excluido" : t.clics > 0 ? "sirve" : t.impresiones >= 10 ? "vigilar" : "poco dato";
    return { ...t, clase, neg };
  }).sort((a, b) => b.impresiones - a.impresiones);
  const CLASE: Record<string, string> = { sirve: "border-emerald-800/70 bg-emerald-950/40 text-emerald-300", vigilar: "border-amber-800/60 bg-amber-950/30 text-amber-300", excluido: "border-gray-700 bg-gray-900 text-gray-400", "poco dato": "border-gray-800 bg-gray-950 text-gray-500" };
  const cuenta = (c: string) => clasif.filter((t) => t.clase === c).length;

  const kpis: [string, string, string][] = [
    ["Nivel de Calidad", notaProm != null ? `${notaProm.toFixed(1)}/10` : "—", "promedio de palabras activas (por impresiones)"],
    ["Cuota de impresiones", cuotaTxt(camp?.cuota), "de las búsquedas donde podías salir"],
    ["Perdida por ranking", cuotaTxt(camp?.perdida_ranking), "por puja y calidad"],
    ["Arriba de los resultados", cuotaTxt(camp?.cuota_arriba), "cuota sobre los resultados orgánicos"],
    ["Primer lugar", cuotaTxt(camp?.cuota_primera), "cuota en la primera posición"],
    ["Puntuación de optimización", camp?.optimizacion != null ? `${Math.round(camp.optimizacion * 100)} %` : "—", "de Google (no mide ventas)"],
  ];
  const ICONO = { ok: <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />, aviso: <AlertTriangle size={14} className="shrink-0 text-amber-400" />, mal: <XCircle size={14} className="shrink-0 text-red-400" />, info: <Info size={14} className="shrink-0 text-gray-400" /> };
  const okCount = reglas.filter((x) => x.estado === "ok").length;
  const palabrasTabla = [...act].sort((a, b) => b.impresiones - a.impresiones);
  const recom = r.recomendaciones.filter((x) => !x.campana_id || x.campana_id === camp?.id);

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-amber-900/50 bg-gradient-to-b from-amber-950/20 via-gray-900/40 to-gray-950/40 p-4 shadow-[0_10px_40px_-22px_rgba(251,191,36,0.4)] md:p-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Valoración oficial</p>
        <p className="mt-0.5 flex items-center gap-2 text-base font-semibold text-white"><Trophy size={16} className="text-amber-300" /> Ranking de Google</p>
        <p className="mt-0.5 max-w-3xl text-[11px] text-gray-400">Google no publica un ranking único: el lugar del anuncio sale de la puja, el Nivel de Calidad y los recursos. Esto es todo lo que Google informa oficialmente (últimos 30 días, hasta el {diaCorto(r.hasta)}).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([t, v, s]) => (
          <div key={t} className="rounded-xl border border-gray-800 bg-gray-950/50 p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{t}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-white tabular-nums">{v}</p>
            <p className="text-[11px] leading-snug text-gray-500">{s}</p>
          </div>
        ))}
      </div>

      <Bloque titulo={`Semáforo de reglas · ${okCount} de ${reglas.length} bien`} sub="Reglas de docs/modules/google-ads-optimizacion.md, calculadas con los datos de Google.">
        <ul className="grid gap-2 md:grid-cols-2">
          {reglas.map((x) => (
            <li key={x.t} className="flex items-start gap-2 rounded-lg border border-gray-800/80 bg-gray-900/40 px-3 py-2">
              <span className="mt-px">{ICONO[x.estado]}</span>
              <span className="min-w-0"><span className="block text-xs font-semibold text-gray-100">{x.t}</span><span className="block break-words text-[11px] text-gray-400">{x.d}</span></span>
            </li>
          ))}
        </ul>
      </Bloque>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Nivel de Calidad por día" sub="Promedio de las palabras que tuvieron impresiones ese día (dato histórico de Google).">
          <LineaCalidad puntos={serie} />
        </Bloque>
        <Bloque titulo="Gasto y ritmo" sub={`Desde el inicio de la campaña${camp?.inicio ? ` (${diaCorto(camp.inicio)})` : ""}.`}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {([
              ["Tope total", total != null ? usd(total) : "—"],
              ["Gastado", `${usd(gastado)}${total ? ` (${Math.round((gastado / total) * 100)} %)` : ""}`],
              ["Queda", usd(queda)],
              ["Días que quedan", diasRestan != null ? `${diasRestan}${diasCorridos ? ` (van ${diasCorridos})` : ""}` : "—"],
              ["Gasto por día (últimos 7)", usd(ritmoReal)],
              ["Gasto por día posible", usd(ritmoNecesario)],
              ["Proyección al cierre", proyeccion != null ? `${usd(proyeccion)}${total ? ` de ${usd(total)}` : ""}` : "—"],
              ["CPC medio / tope", `${usd(camp?.cpc_medio)} / ${usd(camp?.tope_cpc)}`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-[10px] uppercase tracking-wider text-gray-500">{k}</dt><dd className="font-semibold tabular-nums text-gray-100">{v}</dd></div>
            ))}
          </dl>
          {ritmoReal != null && ritmoNecesario != null && (
            <p className="mt-3 text-[11px] text-gray-400">
              {ritmoReal < ritmoNecesario * 0.6
                ? `Se gasta bastante menos de lo posible: el límite no es la plata sino el ranking (cuota perdida por ranking ${cuotaTxt(camp?.perdida_ranking)}).`
                : ritmoReal > ritmoNecesario * 1.2 ? "A este ritmo el tope se termina antes del cierre." : "El gasto va al ritmo del tope."}
              {camp?.cpc_medio != null && camp?.tope_cpc != null && camp.cpc_medio < camp.tope_cpc * 0.8 ? " El CPC medio está lejos del tope: el tope no es lo que frena." : ""}
            </p>
          )}
        </Bloque>
      </div>

      <Bloque titulo="Palabras activas: nota y subasta" sub="Nivel de Calidad de hoy con su cambio en el período, y en qué parte de la subasta salen (30 días).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="pb-2 font-medium">Palabra</th><th className="pb-2 font-medium">Nota</th><th className="pb-2 font-medium">Cambio</th><th className="pb-2 font-medium">Página</th><th className="pb-2 font-medium">Anuncio</th><th className="pb-2 font-medium">CTR esp.</th>
              <th className="pb-2 text-right font-medium">Impr.</th><th className="pb-2 text-right font-medium">Cuota</th><th className="pb-2 text-right font-medium">Pierde rank.</th><th className="pb-2 text-right font-medium">Arriba</th><th className="pb-2 text-right font-medium">CPC</th>
            </tr></thead>
            <tbody>
              {palabrasTabla.map((p) => {
                const e = evol.get(`${p.palabra}|${p.concordancia}`);
                const delta = e ? e.ultima - e.primera : null;
                return (
                  <tr key={p.id} className="border-t border-gray-800/80">
                    <td className="py-1.5 pr-2 text-gray-200">{p.palabra} <span className="text-[10px] text-gray-500">{CONC[p.concordancia] ?? p.concordancia} · {p.grupo}</span>{p.aprobacion === "DISAPPROVED" && <span className="ml-1 text-[10px] text-red-300">rechazada</span>}</td>
                    <td className="py-1.5 pr-2"><Nota n={p.nivel} /></td>
                    <td className="py-1.5 pr-2 tabular-nums">{delta == null ? <span className="text-gray-600">—</span> : delta === 0 ? <span className="text-gray-500">= desde {diaCorto(e!.desde)}</span> : <span className={delta > 0 ? "text-emerald-300" : "text-red-300"}>{delta > 0 ? "▲" : "▼"} {e!.primera}→{e!.ultima}</span>}</td>
                    <td className="py-1.5 pr-2"><Chip v={p.pagina} /></td>
                    <td className="py-1.5 pr-2"><Chip v={p.anuncio} /></td>
                    <td className="py-1.5 pr-2"><Chip v={p.ctr} /></td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{p.impresiones}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{cuotaTxt(p.cuota)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{cuotaTxt(p.perdida_ranking)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{cuotaTxt(p.cuota_arriba)}</td>
                    <td className="py-1.5 text-right tabular-nums">{usd(p.cpc_medio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloque>

      <Bloque titulo="Anuncios" sub="Aprobación, fuerza y cómo rinde cada título según Google.">
        <div className="grid gap-3 lg:grid-cols-2">
          {[...r.anuncios].sort((a, b) => Number(activa(b)) - Number(activa(a))).map((a) => {
            const ap = APROB[a.aprobacion ?? ""]; const fz = FUERZA[a.fuerza ?? ""];
            return (
              <div key={a.id} className={`rounded-lg border border-gray-800 bg-gray-900/40 p-3 ${activa(a) ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-white">{a.grupo}</span>
                  {!activa(a) && <span className="rounded-full border border-gray-700 px-1.5 text-[10px] text-gray-400">pausado</span>}
                  {fz && <span className={`rounded-full border px-1.5 text-[10px] ${fz.ok ? "border-emerald-800/70 text-emerald-300" : "border-amber-800/60 text-amber-300"}`}>Fuerza: {fz.t}</span>}
                  {ap && <span className={`rounded-full border px-1.5 text-[10px] ${ap.tono === "ok" ? "border-emerald-800/70 text-emerald-300" : ap.tono === "aviso" ? "border-amber-800/60 text-amber-300" : "border-red-900/70 text-red-300"}`}>{ap.t}</span>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-500">{(a.url ?? "").replace(/^https?:\/\//, "")}</p>
                {a.motivos.length > 0 && <p className="mt-0.5 text-[10px] text-gray-500">Motivos de Google: {a.motivos.join(", ").toLowerCase().replaceAll("_", " ")}</p>}
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11px] text-sky-300">{a.titulos.length} títulos · {a.descripciones.length} descripciones</summary>
                  <ul className="mt-1.5 space-y-0.5">
                    {[...a.titulos, ...a.descripciones].map((t, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className={i < a.titulos.length ? "text-gray-200" : "text-gray-400"}>{t.texto}{t.fijado && <span className="ml-1 text-[10px] text-amber-300">fijado</span>}</span>
                        <span className={`shrink-0 text-[10px] ${t.rendimiento === "BEST" || t.rendimiento === "GOOD" ? "text-emerald-300" : t.rendimiento === "LOW" ? "text-red-300" : "text-gray-500"}`}>{RINDE[t.rendimiento ?? ""] ?? t.rendimiento ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            );
          })}
        </div>
      </Bloque>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Recursos" sub="Enlaces, textos destacados y datos del negocio.">
          <ul className="space-y-1">
            {r.recursos.filter((x) => x.estado === "ENABLED").sort((a, b) => String(a.tipo).localeCompare(String(b.tipo))).map((x, i) => {
              const ap = APROB[x.aprobacion ?? ""];
              return (
                <li key={i} className="flex items-baseline justify-between gap-2 border-t border-gray-800/60 pt-1 text-[11px] first:border-t-0 first:pt-0">
                  <span className="min-w-0 text-gray-200"><span className="text-gray-500">{RECURSO[x.tipo] ?? x.tipo}:</span> {x.texto ?? "—"}</span>
                  <span className={`shrink-0 text-[10px] ${x.estado_principal === "PENDING" || ap?.tono === "aviso" ? "text-amber-300" : ap?.tono === "mal" ? "text-red-300" : "text-gray-400"}`}>
                    {x.estado_principal === "PENDING" ? "Pendiente de aprobación" : ap?.t ?? ESTADO_RECURSO[x.estado_principal ?? ""] ?? x.estado_principal ?? "—"}
                  </span>
                </li>
              );
            })}
          </ul>
          {!r.recursos.some((x) => x.tipo === "PRICE") && <p className="mt-2 text-[10px] text-gray-500">Sin recurso de precio: Google pide al menos 3 productos y hay uno solo. El precio va en los títulos y en un texto destacado.</p>}
        </Bloque>
        <Bloque titulo="Recomendaciones de Google" sub="Lo que sugiere Google y lo que decidimos según el manual. Nada se aplica solo.">
          {recom.length === 0 ? <p className="text-xs text-gray-500">Sin recomendaciones.</p> : (
            <ul className="space-y-1.5">
              {recom.map((x, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-[11px]">
                  <span className="text-gray-200">{RECOM[x.tipo]?.t ?? x.tipo}{RECOM[x.tipo]?.nota && <span className="block text-[10px] text-gray-500">{RECOM[x.tipo]?.nota}</span>}</span>
                  <span className={`shrink-0 text-[10px] ${x.descartada ? "text-gray-500" : "text-amber-300"}`}>{x.descartada ? "descartada" : "abierta"}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-gray-500">{r.negativas.length} palabras negativas cargadas ({r.negativas.filter((n) => n.origen === "campaña").length} en la campaña, {r.negativas.filter((n) => n.origen !== "campaña").length} en listas).</p>
        </Bloque>
      </div>

      <Bloque titulo="Términos de búsqueda clasificados" sub={`30 días · ${cuenta("sirve")} con clics · ${cuenta("vigilar")} para vigilar (10+ impresiones sin clics) · ${cuenta("excluido")} ya excluidos por una negativa · ${cuenta("poco dato")} con poco dato.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-500"><th className="pb-2 font-medium">Búsqueda</th><th className="pb-2 font-medium">Estado</th><th className="pb-2 text-right font-medium">Impr.</th><th className="pb-2 text-right font-medium">Clics</th><th className="pb-2 text-right font-medium">Gasto</th></tr></thead>
            <tbody>
              {clasif.filter((t) => verTerminos || t.clase !== "excluido").slice(0, verTerminos ? 300 : 30).map((t) => (
                <tr key={t.termino} className="border-t border-gray-800/80">
                  <td className="py-1.5 pr-2 text-gray-200">{t.termino}</td>
                  <td className="py-1.5 pr-2"><span className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold ${CLASE[t.clase]}`}>{t.clase}{t.neg ? ` · «${t.neg.texto}»` : ""}</span></td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{t.impresiones}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{t.clics}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(Number(t.costo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => setVerTerminos((v) => !v)} className="mt-2 text-[11px] text-sky-300 hover:underline">{verTerminos ? "Ver solo los 30 principales sin excluir" : "Ver todos (también los ya excluidos)"}</button>
      </Bloque>
    </section>
  );
}
