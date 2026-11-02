"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, RefreshCw, Radar, ExternalLink, X } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// ============================================================================
// Inteligencia de visitantes (2026-10-22)
// Sesiones propias (Supabase) unidas a órdenes: procedencia, campañas, embudo,
// recorridos y detalle de cada sesión. El tráfico agregado general (todas las
// visitas, páginas, referencias, países) se consulta en Vercel Web Analytics.
// ============================================================================

type Fila = Record<string, string | number | null>;
interface Panel {
  ok: boolean; motivo?: string; detalle?: string;
  resumen: { sesiones: number; visitantes: number; recurrentes: number; vieron_producto: number; checkout: number; ordenes: number; compras: number; cortesias: number; ingresos: number; abandono_checkout: number; paginas_por_sesion: number | null; duracion_mediana_seg: number | null };
  por_fuente: Fila[]; campanas: Fila[]; anuncios: Fila[]; dispositivos: Fila[]; navegadores: Fila[]; sistemas: Fila[]; departamentos: Fila[]; ciudades: Fila[]; recorridos: Fila[];
  filtros: { fuentes: string[]; campanas: string[]; regiones: string[] };
}
interface Sesion {
  sesion: string; started_at: string; last_seen_at: string; fuente: string | null; utm_campaign: string | null; utm_content: string | null;
  device_type: string | null; os: string | null; browser: string | null; in_app: string | null; region: string | null; city: string | null; country: string | null;
  page_views: number; checkout: boolean; compro: boolean; cortesia: boolean; es_recurrente: boolean; es_interno: boolean; orden_id: string | null; orden_estado: string | null; first_path: string | null;
}

const PERIODOS = [{ d: 1, l: "Hoy" }, { d: 7, l: "7 días" }, { d: 30, l: "30 días" }, { d: 90, l: "90 días" }];
const DEPTOS_UY: Record<string, string> = {
  MO: "Montevideo", CA: "Canelones", MA: "Maldonado", CO: "Colonia", SA: "Salto", PA: "Paysandú", RN: "Río Negro", RO: "Rocha",
  RV: "Rivera", SJ: "San José", SO: "Soriano", TA: "Tacuarembó", TT: "Treinta y Tres", CL: "Cerro Largo", DU: "Durazno",
  FS: "Flores", FD: "Florida", LA: "Lavalleja", AR: "Artigas",
};
const nombreRegion = (r: string | null | undefined, pais?: string | null) => (r && (pais ?? "UY") === "UY" ? DEPTOS_UY[r] ?? r : r ?? "—");
const DISPOSITIVO: Record<string, string> = { movil: "Móvil", tablet: "Tablet", escritorio: "Escritorio" };
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const fmtFechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
// Recorrido: páginas por su ruta; interacción (2026-10-31) en palabras.
const etiquetaEvento = (e: { evento: string; path: string | null; valor?: number | null }) =>
  e.evento === "page_view" ? e.path
  : e.evento === "scroll_depth" ? `bajó hasta el ${e.valor ?? "?"}%`
  : e.evento === "time_on_page" ? `${e.valor ?? "?"} s en la página`
  : e.evento.replace(/_/g, " ");
const dur = (a: string, b: string) => { const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)); return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`; };

function Etiqueta({ tipo }: { tipo: "exacto" | "aprox" }) {
  return tipo === "exacto"
    ? <span className="ml-1.5 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide bg-emerald-900/40 text-emerald-400">Exacto</span>
    : <span className="ml-1.5 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide bg-amber-900/40 text-amber-400">Aproximado</span>;
}

function Tarjeta({ titulo, valor, sub, tipo }: { titulo: string; valor: string | number; sub?: string; tipo: "exacto" | "aprox" }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center">{titulo}<Etiqueta tipo={tipo} /></p>
      <p className="mt-1 text-2xl font-semibold text-white">{valor}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Tabla({ titulo, filas, columnas, nota, tipo = "exacto" }: {
  titulo: string; filas: Fila[]; tipo?: "exacto" | "aprox"; nota?: string;
  columnas: { k: string; l: string; f?: (v: unknown, fila: Fila) => string; num?: boolean }[];
}) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <div className="bg-gray-900 px-4 py-2.5 border-b border-gray-800 flex items-center">
        <p className="text-sm font-medium text-gray-200">{titulo}</p><Etiqueta tipo={tipo} />
        {nota && <span className="ml-auto text-[10px] text-gray-500">{nota}</span>}
      </div>
      {filas.length === 0 ? <p className="px-4 py-4 text-xs text-gray-500">Sin datos en el período.</p> : (
        <table className="w-full text-xs">
          <thead><tr className="bg-gray-900/50 text-left text-gray-500">{columnas.map((c) => <th key={c.k} className={`px-3 py-2 font-medium ${c.num ? "text-right" : ""}`}>{c.l}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => (
            <tr key={i} className="border-t border-gray-800/60">{columnas.map((c) => (
              <td key={c.k} className={`px-3 py-1.5 ${c.num ? "text-right tabular-nums text-gray-300" : "text-gray-300"}`}>{c.f ? c.f(f[c.k], f) : (f[c.k] ?? "—")}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function Embudo({ r }: { r: Panel["resumen"] }) {
  const pasos = [
    { l: "Sesiones", v: r.sesiones }, { l: "Vieron el producto", v: r.vieron_producto },
    { l: "Llegaron al checkout", v: r.checkout }, { l: "Crearon orden", v: r.ordenes }, { l: "Compraron", v: r.compras },
  ];
  const max = Math.max(1, r.sesiones);
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
      <p className="text-sm font-medium text-gray-200 mb-3 flex items-center">Embudo comercial<Etiqueta tipo="exacto" /></p>
      <div className="space-y-2">{pasos.map((p, i) => (
        <div key={p.l} className="flex items-center gap-3 text-xs">
          <span className="w-40 shrink-0 text-gray-400">{p.l}</span>
          <div className="flex-1 h-5 rounded bg-gray-800 overflow-hidden"><div className="h-full rounded bg-violet-600/70" style={{ width: `${(p.v / max) * 100}%` }} /></div>
          <span className="w-24 text-right tabular-nums text-gray-300">{p.v}{i > 0 && <span className="text-gray-500"> · {pct(p.v, pasos[i - 1].v)}</span>}</span>
        </div>
      ))}</div>
    </div>
  );
}

// ── Detalle de una sesión, contado en palabras (2026-11-02) ─────────────────
// Ubicación del anuncio (utm_source de Meta), conjunto de anuncios, qué
// secciones vio, qué tocó, cuánto estuvo y hasta dónde bajó. Los eventos
// anteriores al 2/11 llegaban agrupados con la misma hora; desde entonces
// cada uno trae la hora real en que pasó.
type EventoDet = { evento: string; path: string | null; at: string; valor?: number | null; detalle?: string | null };

const UBICACION_META: Record<string, { l: string; aviso?: string }> = {
  an: { l: "Audience Network", aviso: "apps y juegos de terceros: suele ser tráfico de baja calidad" },
  fb: { l: "Facebook" }, ig: { l: "Instagram" }, msg: { l: "Messenger" }, messenger: { l: "Messenger" }, th: { l: "Threads" },
};
const SECCION: Record<string, string> = {
  header: "el encabezado", hero: "el inicio (título, precio y botón)", que_incluye: "«Qué incluye»", asi_se_vive: "«Así vivís la experiencia»",
  como_funciona: "«Cómo funciona»", por_tema: "«Lecturas según lo que te preocupa»", testimonios: "los testimonios", dudas: "«Dudas frecuentes»",
  cta_final: "el cierre con el botón final", sticky: "el botón fijo de abajo",
};
const CAMPO: Record<string, string> = {
  nombre: "nombre", telefono: "WhatsApp", email: "email", tema: "tema", pregunta: "pregunta", acepta_terminos: "casilla de términos",
  fecha_nacimiento: "fecha de nacimiento", fecha_nacimiento_dia: "día de nacimiento", fecha_nacimiento_mes: "mes de nacimiento", fecha_nacimiento_anio: "año de nacimiento",
};
const PAGINA: Record<string, string> = { "/": "la home", "/tarot": "/tarot", "/tarot/checkout": "el checkout", "/gracias": "la página de gracias" };
const pagina = (p: string | null) => (p ? PAGINA[p] ?? p : "—");
// "a" + "el checkout" → "al checkout".
const aPagina = (p: string | null) => { const t = pagina(p); return t.startsWith("el ") ? `al ${t.slice(3)}` : `a ${t}`; };
const seccion = (d?: string | null) => (d ? SECCION[d] ?? d : "?");
const campo = (d?: string | null) => (d ? CAMPO[d] ?? d.replace(/_/g, " ") : "?");

function describirEvento(e: EventoDet): { texto: string; tono: "pagina" | "accion" | "info" | "alerta" | "bien" } | null {
  const d = e.detalle ?? null;
  switch (e.evento) {
    case "page_view": return { texto: `Abrió ${pagina(e.path)}`, tono: "pagina" };
    case "landing_viewed": return null; // redundante con page_view
    case "product_viewed": return { texto: `Vio el producto${e.valor ? ` ($U ${e.valor})` : ""}`, tono: "info" };
    case "checkout_started": return { texto: "Entró al checkout", tono: "bien" };
    case "section_view": return { texto: `Vio ${seccion(d)}`, tono: "info" };
    case "scroll_depth": return { texto: `Bajó hasta el ${e.valor ?? "?"}% de la página`, tono: "info" };
    case "time_on_page": return { texto: `Lleva ${e.valor ?? "?"} s con la página a la vista`, tono: "info" };
    case "cta_click": return { texto: `Tocó «Quiero mi lectura» (en ${seccion(d)})`, tono: "bien" };
    case "faq_open": return { texto: `Abrió la pregunta frecuente n.º ${d?.split(":")[1] ?? "?"}`, tono: "accion" };
    case "form_started": return { texto: `Empezó a completar el formulario (por ${campo(d)})`, tono: "accion" };
    case "form_field_done": return { texto: `Completó ${campo(d)}`, tono: "accion" };
    case "form_invalid": return { texto: `El formulario lo frenó: falta o está mal ${campo(d)}`, tono: "alerta" };
    case "form_submit": return { texto: `Tocó «Pagar»${d === "con_codigo" ? " (con código)" : ""}`, tono: "bien" };
    case "form_error": return { texto: `Error al enviar: ${d ?? "?"}`, tono: "alerta" };
    case "coupon_opened": return { texto: "Abrió «¿Tenés un código de descuento?»", tono: "accion" };
    case "coupon_result": return { texto: `Probó un código: ${d === "ok" ? "aplicado" : d === "cortesia" ? "cortesía" : d === "invalido" ? "inválido" : d ?? "?"}`, tono: d === "ok" || d === "cortesia" ? "bien" : "alerta" };
    case "mp_redirect": return { texto: `Fue a pagar a Mercado Pago${e.valor ? ` ($U ${e.valor})` : ""}`, tono: "bien" };
    case "checkout_back": return { texto: "Volvió a /tarot desde el checkout", tono: "alerta" };
    case "help_click": return { texto: "Pidió ayuda por WhatsApp", tono: "accion" };
    case "page_exit": return { texto: `Dejó ${pagina(e.path)} (salió, cambió de app o de pestaña): ${e.valor ?? 0} s a la vista, había visto el ${d?.replace("vio_", "") ?? "?"}%`, tono: "alerta" };
    default: return { texto: e.evento.replace(/_/g, " "), tono: "info" };
  }
}

const TONO: Record<string, string> = { pagina: "text-gray-100 font-medium", accion: "text-sky-300", info: "text-violet-300", alerta: "text-amber-300", bien: "text-emerald-300" };

function resumenSesion(s: Record<string, unknown>, ev: EventoDet[], ordenes: { pagada: boolean; tipo: string }[]): string[] {
  const frases: string[] = [];
  const ubic = UBICACION_META[String(s.utm_source ?? "").toLowerCase()];
  const origen = s.fuente === "Meta Ads"
    ? `un anuncio de Meta${ubic ? ` en ${ubic.l}` : ""}${s.utm_content ? ` («${s.utm_content}»)` : ""}`
    : s.fuente ? String(s.fuente) : "origen desconocido";
  frases.push(`Llegó desde ${origen} ${aPagina((s.landing_path as string) ?? (s.first_path as string) ?? null)}${s.es_recurrente ? ", y ya había venido antes" : ", por primera vez"}.`);

  const paginas = Array.from(new Set(ev.filter((e) => e.evento === "page_view").map((e) => e.path)));
  if (paginas.length > 1) frases.push(`Recorrió ${paginas.length} páginas: ${paginas.map(pagina).join(" → ")}.`);
  const vistas = ev.filter((e) => e.evento === "page_view");
  if (vistas.length > paginas.length && vistas.length > 1) {
    const ultima = vistas[vistas.length - 1];
    const mins = Math.round((new Date(ultima.at).getTime() - new Date(vistas[0].at).getTime()) / 60000);
    frases.push(`Abrió páginas ${vistas.length} veces en total: volvió a ${pagina(ultima.path)}${mins >= 1 ? ` ${mins} min después de llegar` : ""} (recargó o regresó desde otra app).`);
  }

  const secc = Array.from(new Set(ev.filter((e) => e.evento === "section_view" && e.detalle).map((e) => e.detalle as string)));
  const scroll = Math.max(0, ...ev.filter((e) => e.evento === "scroll_depth").map((e) => Number(e.valor ?? 0)));
  const salidas = ev.filter((e) => e.evento === "page_exit");
  const vio = Math.max(0, ...salidas.map((e) => Number(e.detalle?.replace("vio_", "") ?? 0)));
  if (secc.length) frases.push(`En /tarot vio ${secc.map(seccion).join(", ")}${scroll ? `, y bajó hasta el ${scroll}% de la página` : ", sin bajar (solo la primera pantalla)"}${vio ? `; llegó a ver el ${vio}% del total` : ""}.`);

  const seg = Math.max(0, ...salidas.map((e) => Number(e.valor ?? 0)));
  const umbral = Math.max(0, ...ev.filter((e) => e.evento === "time_on_page").map((e) => Number(e.valor ?? 0)));
  if (seg) frases.push(`Tuvo la página a la vista ${seg < 60 ? `${seg} segundos` : `${Math.round(seg / 6) / 10} minutos`}.`);
  else if (umbral) frases.push(`Tuvo la página a la vista al menos ${umbral} segundos.`);
  else if (ev.length) frases.push("Se fue antes de los 10 segundos (no llegó a la primera marca de tiempo).");

  const ctas = ev.filter((e) => e.evento === "cta_click");
  const enCheckout = ev.some((e) => e.evento === "checkout_started" || e.path === "/tarot/checkout");
  if (ctas.length) frases.push(`Tocó «Quiero mi lectura» ${ctas.length === 1 ? "una vez" : `${ctas.length} veces`} (${Array.from(new Set(ctas.map((e) => seccion(e.detalle)))).join(", ")}).`);
  else if (!enCheckout) frases.push("No tocó ningún botón de compra.");

  const faqs = ev.filter((e) => e.evento === "faq_open").length;
  if (faqs) frases.push(`Abrió ${faqs} pregunta${faqs > 1 ? "s" : ""} frecuente${faqs > 1 ? "s" : ""}.`);

  if (enCheckout) {
    const completos = Array.from(new Set(ev.filter((e) => e.evento === "form_field_done").map((e) => campo(e.detalle))));
    const frenos = Array.from(new Set(ev.filter((e) => e.evento === "form_invalid").map((e) => campo(e.detalle))));
    const empezo = ev.some((e) => e.evento === "form_started");
    frases.push(!empezo ? "Entró al checkout pero no tocó el formulario."
      : `En el checkout completó ${completos.length ? completos.join(", ") : "ningún campo"}${frenos.length ? `; el formulario lo frenó por ${frenos.join(", ")}` : ""}.`);
    if (ev.some((e) => e.evento === "help_click")) frases.push("Pidió ayuda por WhatsApp antes de pagar.");
    if (ev.some((e) => e.evento === "mp_redirect")) frases.push("Llegó a Mercado Pago.");
    else if (ev.some((e) => e.evento === "form_submit")) frases.push("Tocó «Pagar» pero no llegó a Mercado Pago (revisar errores).");
  }

  const compra = ordenes.find((o) => o.pagada);
  frases.push(compra ? (compra.tipo === "cortesia" ? "Terminó con una lectura de cortesía." : "✅ Terminó comprando.") : ordenes.length ? "Creó una orden pero no la pagó." : "No compró.");
  return frases;
}

function DetalleSesion({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<{ sesion?: Record<string, unknown>; eventos?: EventoDet[]; ordenes?: { id: string; estado: string; tipo: string; monto: number; pagada: boolean; creada: string }[]; otras_sesiones_del_visitante?: number } | null>(null);
  useEffect(() => { fetch(`/api/admin/tarot/visitantes?accion=sesion&id=${encodeURIComponent(id)}`).then((r) => r.json()).then(setD).catch(() => setD({})); }, [id]);
  const s = d?.sesion ?? {};
  const v = (k: string) => (s[k] as string | null) || "—";
  const eventos = d?.eventos ?? [];
  const ubic = UBICACION_META[String(s.utm_source ?? "").toLowerCase()];
  const inicio = eventos[0]?.at ?? (s.started_at as string | undefined);
  const fin = eventos[eventos.length - 1]?.at;
  // Eventos de antes del 2/11: el lote entero quedaba con la misma hora.
  const horasAgrupadas = eventos.length > 2 && new Set(eventos.map((e) => e.at)).size <= Math.ceil(eventos.length / 3);
  const rel = (at: string) => {
    if (!inicio) return "";
    const seg = Math.max(0, Math.round((new Date(at).getTime() - new Date(inicio).getTime()) / 1000));
    return seg < 60 ? `+${seg}s` : `+${Math.floor(seg / 60)}m${String(seg % 60).padStart(2, "0")}s`;
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-gray-950 border-l border-gray-800 overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <p className="text-white font-semibold">Detalle de la sesión</p>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>
        {!d ? <p className="p-5 text-sm text-gray-500 animate-pulse">Cargando…</p> : (
          <div className="p-5 space-y-5 text-xs">
            <div className="rounded-lg border border-violet-900/60 bg-violet-950/30 px-4 py-3">
              <p className="text-violet-200 font-medium mb-1.5">Qué pasó</p>
              <ul className="space-y-1 text-gray-200 leading-relaxed list-disc pl-4">
                {resumenSesion(s, eventos, d.ordenes ?? []).map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>

            <div className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-gray-400">
              <span>Inicio</span><span className="text-gray-200">{fmtFechaHora(s.started_at as string)}{inicio && fin ? ` · duró ${dur(inicio, fin)} (1.º → último evento)` : ""}</span>
              <span>Fuente</span><span className="text-gray-200">{v("fuente")}{s.utm_medium ? ` · ${s.utm_medium}` : ""}{s.fbclid ? " · con clic de Meta (fbclid)" : ""}</span>
              {(s.utm_source as string) && (<>
                <span>Ubicación del anuncio</span>
                <span className={ubic?.aviso ? "text-amber-300" : "text-gray-200"}>{ubic?.l ?? v("utm_source")}{ubic?.aviso ? ` ⚠ ${ubic.aviso}` : ""}</span>
              </>)}
              <span>Campaña</span><span className="text-gray-200">{v("utm_campaign")}</span>
              <span>Conjunto de anuncios</span><span className="text-gray-200">{v("utm_term")}</span>
              <span>Anuncio</span><span className="text-gray-200">{v("utm_content")}</span>
              <span>Llegó a</span><span className="text-gray-200">{v("landing_path")}</span>
              <span>Referencia</span><span className="text-gray-200">{v("referrer_host")}</span>
              <span>Dispositivo</span><span className="text-gray-200">{DISPOSITIVO[(s.device_type as string) ?? ""] ?? "—"} · {v("os")} · {(s.in_app as string) ? `navegador interno de ${s.in_app}` : v("browser")} · pantalla {v("screen_bucket")} px</span>
              <span>Ubicación <Etiqueta tipo="aprox" /></span><span className="text-gray-200">{s.city || s.region ? `${v("city")}, ${nombreRegion(s.region as string, s.country as string)} (${v("country")})` : "No disponible"}</span>
              <span>Visitante</span><span className="text-gray-200">{s.es_recurrente ? `Recurrente (${d.otras_sesiones_del_visitante ?? 0} sesiones previas)` : "Nuevo"} {s.es_interno ? "· prueba interna" : ""}</span>
              <span>Actividad</span><span className="text-gray-200">{Number(s.page_views ?? 0)} página{Number(s.page_views ?? 0) === 1 ? "" : "s"} · {eventos.length} eventos</span>
            </div>

            <div>
              <p className="text-gray-300 font-medium mb-1">Recorrido paso a paso</p>
              {horasAgrupadas && <p className="text-[11px] text-amber-400/80 mb-2">Sesión anterior al 2/11: los eventos llegaban en grupo y comparten la hora; el orden sí es el real.</p>}
              <ol className="space-y-1.5 border-l border-gray-800 pl-3">
                {eventos.map((e, i) => {
                  const desc = describirEvento(e);
                  if (!desc) return null;
                  return (
                    <li key={i} className="flex gap-2 text-gray-400">
                      <span className="tabular-nums text-gray-600 w-[5.6rem] shrink-0 whitespace-nowrap">{new Date(e.at).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      <span className="tabular-nums text-gray-500 w-14 shrink-0 whitespace-nowrap">{rel(e.at)}</span>
                      <span className={TONO[desc.tono]}>{desc.texto}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div>
              <p className="text-gray-300 font-medium mb-2">Órdenes de esta sesión</p>
              {(d.ordenes ?? []).length === 0 ? <p className="text-gray-500">Ninguna.</p> : (d.ordenes ?? []).map((o) => (
                <a key={o.id} href={`/admin/tarot/ordenes/${o.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300">
                  {o.tipo === "cortesia" ? "Cortesía" : o.pagada ? "Compra" : "Orden sin pagar"} · {o.estado} · ${o.monto} <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VisitantesPage() {
  const [dias, setDias] = useState(30);
  const [interno, setInterno] = useState(false);
  const [filtro, setFiltro] = useState<{ fuente?: string; campana?: string; dispositivo?: string; region?: string }>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solo, setSolo] = useState<"todas" | "checkout" | "compra" | "abandono">("todas");
  const [sesiones, setSesiones] = useState<{ total: number; filas: Sesion[] } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const qs = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ dias: String(dias), ...(interno ? { interno: "1" } : {}), ...Object.fromEntries(Object.entries(filtro).filter(([, v]) => v)), ...extra } as Record<string, string>);
    return p.toString();
  }, [dias, interno, filtro]);

  // silencioso: la actualización automática no pisa con un error lo que ya
  // se está viendo (si falla, se reintenta en la próxima vuelta).
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const cargar = useCallback(async (silencioso = false) => {
    setCargando(true); if (!silencioso) setError(null);
    try {
      const [rp, rs] = await Promise.all([
        fetch(`/api/admin/tarot/visitantes?${qs({ accion: "panel" })}`).then((r) => r.json()),
        fetch(`/api/admin/tarot/visitantes?${qs({ accion: "sesiones", solo, limite: "50" })}`).then((r) => r.json()),
      ]);
      if (!rp.ok) { if (!silencioso) setError(rp.detalle ?? rp.motivo ?? "Error"); } else { setPanel(rp); setError(null); }
      if (rs.ok) setSesiones(rs);
      if (rp.ok) setActualizado(new Date());
    } catch (e) { if (!silencioso) setError(e instanceof Error ? e.message : "Error de red"); }
    finally { setCargando(false); }
  }, [qs, solo]);
  useEffect(() => { cargar(); }, [cargar]);

  // Actualización automática (2026-10-31): cada 60 s mientras la pestaña está
  // a la vista, y al volver a ella. Mantiene filtros y el detalle abierto.
  useEffect(() => {
    const AUTO_MS = 60_000;
    const id = setInterval(() => { if (document.visibilityState === "visible") cargar(true); }, AUTO_MS);
    const alVolver = () => { if (document.visibilityState === "visible") cargar(true); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", alVolver); };
  }, [cargar]);

  const r = panel?.resumen;
  const sel = "rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 px-2 py-1.5";

  return (
    <TarotAdminShell>
      <div className="p-6 max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Radar size={18} className="text-violet-400" /> Inteligencia de visitantes</h1>
            <p className="text-xs text-gray-500 mt-1">Sesiones unidas a órdenes: de dónde vienen, qué recorren y quién compra. El tráfico general (todas las visitas, páginas, países) está en Vercel Web Analytics.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500">Tráfico general en Vercel <ExternalLink size={12} /></a>
            <span className="text-[11px] text-gray-500" title="Se actualiza sola cada 1 minuto mientras la pestaña está abierta">
              Auto · 1 min{actualizado ? ` · ${actualizado.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
            <button onClick={() => cargar()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500"><RefreshCw size={12} className={cargando ? "animate-spin" : ""} /> Actualizar</button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {PERIODOS.map((p) => (
            <button key={p.d} onClick={() => setDias(p.d)} className={`text-xs px-3 py-1.5 rounded-lg border ${dias === p.d ? "border-violet-600 bg-violet-950/40 text-violet-200" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>{p.l}</button>
          ))}
          <select className={sel} value={filtro.fuente ?? ""} onChange={(e) => setFiltro({ ...filtro, fuente: e.target.value || undefined })}>
            <option value="">Todas las fuentes</option>{(panel?.filtros.fuentes ?? []).map((f) => <option key={f}>{f}</option>)}
          </select>
          <select className={sel} value={filtro.campana ?? ""} onChange={(e) => setFiltro({ ...filtro, campana: e.target.value || undefined })}>
            <option value="">Todas las campañas</option>{(panel?.filtros.campanas ?? []).map((f) => <option key={f}>{f}</option>)}
          </select>
          <select className={sel} value={filtro.dispositivo ?? ""} onChange={(e) => setFiltro({ ...filtro, dispositivo: e.target.value || undefined })}>
            <option value="">Todos los dispositivos</option><option value="movil">Móvil</option><option value="tablet">Tablet</option><option value="escritorio">Escritorio</option>
          </select>
          <select className={sel} value={filtro.region ?? ""} onChange={(e) => setFiltro({ ...filtro, region: e.target.value || undefined })}>
            <option value="">Todos los departamentos</option>{(panel?.filtros.regiones ?? []).map((f) => <option key={f} value={f}>{nombreRegion(f)}</option>)}
          </select>
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-gray-400"><input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} /> Incluir pruebas internas</label>
        </div>

        {error && <div className="mb-4 flex items-center gap-2 text-sm text-red-400"><AlertCircle size={14} /> {error}</div>}

        {r && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
              <Tarjeta titulo="Sesiones" valor={r.sesiones} sub={`${r.paginas_por_sesion ?? 0} páginas / sesión`} tipo="exacto" />
              <Tarjeta titulo="Visitantes" valor={r.visitantes} sub={`${pct(r.recurrentes, r.sesiones)} de sesiones recurrentes`} tipo="aprox" />
              <Tarjeta titulo="Llegaron al checkout" valor={r.checkout} sub={pct(r.checkout, r.sesiones) + " de las sesiones"} tipo="exacto" />
              <Tarjeta titulo="Compras" valor={r.compras} sub={`conversión ${pct(r.compras, r.sesiones)}${r.cortesias ? ` · ${r.cortesias} cortesías aparte` : ""}`} tipo="exacto" />
              <Tarjeta titulo="Abandonaron el checkout" valor={r.abandono_checkout} sub={pct(r.abandono_checkout, r.checkout) + " de los que llegaron"} tipo="exacto" />
              <Tarjeta titulo="Ingresos" valor={`$ ${Number(r.ingresos).toLocaleString("es-UY")}`} sub={`duración mediana ${r.duracion_mediana_seg != null ? dur("1970-01-01T00:00:00Z", new Date(r.duracion_mediana_seg * 1000).toISOString()) : "—"} (aprox.)`} tipo="exacto" />
            </div>

            <div className="mb-5"><Embudo r={r} /></div>

            <div className="grid lg:grid-cols-2 gap-4 mb-5">
              <Tabla titulo="Fuentes" filas={panel!.por_fuente} columnas={[
                { k: "fuente", l: "Fuente" }, { k: "sesiones", l: "Sesiones", num: true }, { k: "checkout", l: "Checkout", num: true },
                { k: "compras", l: "Compras", num: true }, { k: "conv", l: "Conv.", num: true, f: (_, f) => pct(Number(f.compras), Number(f.sesiones)) },
              ]} nota="Instagram/Facebook sin UTM: por referencia o navegador interno" />
              <Tabla titulo="Campañas" filas={panel!.campanas} columnas={[
                { k: "campana", l: "Campaña", f: (v, f) => `${v}${f.fuentes ? ` (${f.fuentes})` : ""}` }, { k: "sesiones", l: "Sesiones", num: true }, { k: "checkout", l: "Checkout", num: true },
                { k: "compras", l: "Compras", num: true }, { k: "costo", l: "Costo", num: true, f: (v, f) => (v == null ? "—" : `${f.moneda ?? ""} ${v}`) },
                { k: "costo_por_compra", l: "Costo/compra", num: true, f: (v) => (v == null ? "—" : String(v)) },
              ]} nota="Costo: cargado en Adquisición" />
              <Tabla titulo="Anuncios (utm_content)" filas={panel!.anuncios} columnas={[
                { k: "campana", l: "Campaña" }, { k: "anuncio", l: "Anuncio" }, { k: "sesiones", l: "Sesiones", num: true },
                { k: "checkout", l: "Checkout", num: true }, { k: "compras", l: "Compras", num: true },
              ]} />
              <Tabla titulo="Dispositivos" filas={panel!.dispositivos} columnas={[
                { k: "clave", l: "Dispositivo", f: (v) => DISPOSITIVO[String(v)] ?? String(v) }, { k: "sesiones", l: "Sesiones", num: true },
                { k: "checkout", l: "Checkout", num: true }, { k: "compras", l: "Compras", num: true },
                { k: "conv", l: "Conv.", num: true, f: (_, f) => pct(Number(f.compras), Number(f.sesiones)) },
              ]} />
              <Tabla titulo="Navegadores" filas={panel!.navegadores} columnas={[
                { k: "clave", l: "Navegador", f: (v) => (v === "instagram" ? "App de Instagram" : v === "facebook" ? "App de Facebook" : String(v)) },
                { k: "sesiones", l: "Sesiones", num: true }, { k: "checkout", l: "Checkout", num: true }, { k: "compras", l: "Compras", num: true },
              ]} />
              <Tabla titulo="Sistemas operativos" filas={panel!.sistemas} columnas={[
                { k: "clave", l: "Sistema" }, { k: "sesiones", l: "Sesiones", num: true }, { k: "compras", l: "Compras", num: true },
              ]} />
              <Tabla titulo="Departamentos" tipo="aprox" filas={panel!.departamentos} columnas={[
                { k: "clave", l: "Departamento", f: (v, f) => nombreRegion(String(v), f.country as string) }, { k: "sesiones", l: "Sesiones", num: true },
                { k: "checkout", l: "Checkout", num: true }, { k: "compras", l: "Compras", num: true },
              ]} nota="Por IP (no se guarda)" />
              <Tabla titulo="Ciudades" tipo="aprox" filas={panel!.ciudades} columnas={[
                { k: "clave", l: "Ciudad" }, { k: "sesiones", l: "Sesiones", num: true }, { k: "compras", l: "Compras", num: true },
              ]} nota="Datos móviles suelen salir como Montevideo" />
            </div>

            <div className="mb-5">
              <Tabla titulo="Recorridos más frecuentes (primeras 4 páginas)" filas={panel!.recorridos} columnas={[
                { k: "recorrido", l: "Recorrido" }, { k: "sesiones", l: "Sesiones", num: true }, { k: "compras", l: "Compras", num: true },
              ]} />
            </div>
          </>
        )}

        {/* Sesiones */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-2.5 border-b border-gray-800 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-200 mr-2">Sesiones</p>
            {([["todas", "Todas"], ["checkout", "Llegaron al checkout"], ["compra", "Compraron"], ["abandono", "Abandonaron"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSolo(k)} className={`text-[11px] px-2.5 py-1 rounded-md border ${solo === k ? "border-violet-600 text-violet-200" : "border-gray-700 text-gray-400"}`}>{l}</button>
            ))}
            <span className="ml-auto text-[11px] text-gray-500">{sesiones?.total ?? 0} sesiones · se muestran las últimas 50</span>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-900/50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Inicio</th><th className="px-3 py-2 font-medium">Fuente</th><th className="px-3 py-2 font-medium">Campaña</th>
              <th className="px-3 py-2 font-medium">Dispositivo</th><th className="px-3 py-2 font-medium">Ubicación</th><th className="px-3 py-2 font-medium text-right">Páginas</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
            </tr></thead>
            <tbody>{(sesiones?.filas ?? []).map((s) => (
              <tr key={s.sesion} onClick={() => setAbierta(s.sesion)} className="border-t border-gray-800/60 hover:bg-gray-800/30 cursor-pointer">
                <td className="px-3 py-1.5 text-gray-400 tabular-nums">{fmtFechaHora(s.started_at)} <span className="text-gray-600">· {dur(s.started_at, s.last_seen_at)}</span></td>
                <td className="px-3 py-1.5 text-gray-300">{s.fuente ?? "—"}{s.es_recurrente && <span className="ml-1 text-[10px] text-sky-400">recurrente</span>}{s.es_interno && <span className="ml-1 text-[10px] text-gray-500">interna</span>}</td>
                <td className="px-3 py-1.5 text-gray-400">{s.utm_campaign ?? "—"}</td>
                <td className="px-3 py-1.5 text-gray-400">{DISPOSITIVO[s.device_type ?? ""] ?? "—"} · {s.in_app ? `app ${s.in_app}` : s.browser ?? ""}</td>
                <td className="px-3 py-1.5 text-gray-400">{s.city ?? "—"}{s.region ? `, ${nombreRegion(s.region, s.country)}` : ""}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">{s.page_views}</td>
                <td className="px-3 py-1.5">{s.compro ? <span className="text-emerald-400">Compró</span> : s.cortesia ? <span className="text-sky-400">Cortesía</span> : s.checkout ? <span className="text-amber-400">Abandonó checkout</span> : <span className="text-gray-500">Navegó</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!cargando && (sesiones?.filas ?? []).length === 0 && <p className="px-4 py-4 text-xs text-gray-500">Sin sesiones en el período.</p>}
        </div>

        <p className="mt-4 text-[11px] text-gray-600">
          Exacto: sesiones, páginas, checkout, órdenes y compras (vienen de la base). Aproximado: visitantes únicos y recurrentes (se pierden al borrar datos del navegador o cambiar de dispositivo), ubicación (por IP, sin guardarla) y duración (no se mide la última página). No disponible acá: visitas con JavaScript bloqueado y bots (ver Vercel).
        </p>
      </div>
      {abierta && <DetalleSesion id={abierta} onClose={() => setAbierta(null)} />}
    </TarotAdminShell>
  );
}
