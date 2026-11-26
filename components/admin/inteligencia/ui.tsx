"use client";
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, BrainCircuit, Check, ChevronDown, Info, Minus, X, type LucideIcon } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Inteligencia comercial · sistema visual (Level Up, 2026-11-25).
//
// Un solo lenguaje para las cinco pantallas del módulo:
//   Superficies: el fondo del admin y tarjetas apenas más claras (blanco al
//     2–4 %), bordes de 7 % de opacidad. Nada de bordes alrededor de todo:
//     dentro de una tarjeta se separa con espacio, divisores o un fondo sutil.
//   Color semántico (nunca decorativo): verde = favorable / comprobado,
//     rosa = pérdida / riesgo, ámbar = atención / incertidumbre, celeste =
//     dato analítico y navegación contextual, violeta = IA, hipótesis y
//     experimentación, gris = secundario. El dorado de la marca queda para la
//     identidad (encabezado y menú activo).
//   Tipografía: Inter con cifras tabulares. Título de pantalla 26–30 px,
//     sección 18–20, tarjeta 15, indicadores 28–32, resultado protagonista
//     40–44, texto 14–15, secundario 13, metadatos 12.
//   Texto secundario en gris 400 como mínimo: lo importante nunca parece
//     deshabilitado.

// ── Formato ─────────────────────────────────────────────────────────────────
export const pesos = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}$ ${Math.round(Math.abs(v)).toLocaleString("es-UY")}`;
export const pesosConSigno = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$ ${Math.round(Math.abs(v)).toLocaleString("es-UY")}`;
export const entero = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("es-UY"));
export const decimal = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d).replace(".", ","));
export const veces = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(2).replace(".", ",")}×`);
export const usd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `US$ ${v.toFixed(2).replace(".", ",")}`);
/** a ÷ b como porcentaje legible ("—" si no hay base). */
export const pct = (a: number, b: number) => (b > 0 ? porcentaje((a / b) * 100) : "—");
export const porcentaje = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(v < 10 && v !== 0 ? 1 : 0).replace(".", ",")} %`);
const TZ = "America/Montevideo";
/** "2026-11-24" → "24/11". */
export const fechaCorta = (ymd: string | null | undefined) => (ymd ? ymd.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "—");
export const fechaDia = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: TZ }) : "—");
export const fechaLarga = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).replace(".", "") : "—");
export const fechaHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "—");
export function haceCuanto(iso: string | null | undefined) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

// ── Tonos semánticos ────────────────────────────────────────────────────────
export type Tono = "neutro" | "positivo" | "negativo" | "alerta" | "info" | "ia" | "marca";
export const TONO: Record<Tono, { texto: string; fuerte: string; fondo: string; anillo: string; punto: string; barra: string; borde: string }> = {
  neutro: { texto: "text-gray-300", fuerte: "text-gray-50", fondo: "bg-white/[0.06]", anillo: "ring-white/10", punto: "bg-gray-400", barra: "bg-gray-400", borde: "border-l-gray-500" },
  positivo: { texto: "text-emerald-200", fuerte: "text-emerald-300", fondo: "bg-emerald-400/10", anillo: "ring-emerald-400/25", punto: "bg-emerald-400", barra: "bg-emerald-400", borde: "border-l-emerald-400" },
  negativo: { texto: "text-rose-200", fuerte: "text-rose-300", fondo: "bg-rose-400/10", anillo: "ring-rose-400/25", punto: "bg-rose-400", barra: "bg-rose-400", borde: "border-l-rose-400" },
  alerta: { texto: "text-amber-100", fuerte: "text-amber-300", fondo: "bg-amber-400/10", anillo: "ring-amber-400/25", punto: "bg-amber-400", barra: "bg-amber-400", borde: "border-l-amber-400" },
  info: { texto: "text-sky-100", fuerte: "text-sky-300", fondo: "bg-sky-400/10", anillo: "ring-sky-400/25", punto: "bg-sky-400", barra: "bg-sky-400", borde: "border-l-sky-400" },
  ia: { texto: "text-violet-100", fuerte: "text-violet-300", fondo: "bg-violet-400/10", anillo: "ring-violet-400/25", punto: "bg-violet-400", barra: "bg-violet-400", borde: "border-l-violet-400" },
  marca: { texto: "text-amber-100", fuerte: "text-amber-300", fondo: "bg-amber-300/10", anillo: "ring-amber-300/25", punto: "bg-amber-300", barra: "bg-amber-300", borde: "border-l-amber-300" },
};
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70";

// ── Contexto del negocio (una lectura por sesión) ───────────────────────────
type Negocio = { nombre: string; producto: string; mercado: string; moneda: string };
const MERCADO: Record<string, string> = { UY: "Uruguay", US: "Estados Unidos", ES: "España", AR: "Argentina" };
let negocioCache: Negocio | null = null;
export function useNegocio(): Negocio | null {
  const [n, setN] = useState<Negocio | null>(negocioCache);
  useEffect(() => {
    if (negocioCache) return;
    fetch("/api/admin/tarot/inteligencia?vista=negocio", { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (j.ok) { negocioCache = j.negocio; setN(j.negocio); } }).catch(() => {});
  }, []);
  return n;
}

// ── Página ──────────────────────────────────────────────────────────────────
export function Pagina({ titulo, descripcion, icono: Icono, acciones, filtros, children }: {
  titulo: string; descripcion?: ReactNode; icono?: LucideIcon; acciones?: ReactNode; filtros?: ReactNode; children: ReactNode;
}) {
  const n = useNegocio();
  return (
    <TarotAdminShell>
      <div className="font-[family-name:var(--font-ic)] text-gray-200 antialiased">
        <div className="mx-auto w-full max-w-[1360px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          <header className="mb-6 lg:mb-7">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-gray-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-300"><BrainCircuit size={14} aria-hidden="true" /> Inteligencia comercial</span>
              {n && <>
                <span aria-hidden="true" className="text-gray-600">/</span>
                <span className="text-gray-300">{n.nombre}</span>
                <span aria-hidden="true" className="text-gray-600">·</span><span>{MERCADO[n.mercado] ?? n.mercado}</span>
                <span aria-hidden="true" className="text-gray-600">·</span><span>{n.moneda === "UYU" ? "Pesos uruguayos" : n.moneda}</span>
              </>}
            </p>
            <div className="mt-2.5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2.5 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-gray-50 md:text-[30px]">
                  {Icono && <Icono size={26} strokeWidth={1.75} className="shrink-0 text-gray-400" aria-hidden="true" />}{titulo}
                </h1>
                {descripcion && <p className="mt-1.5 max-w-[72ch] text-[14.5px] leading-relaxed text-gray-400">{descripcion}</p>}
              </div>
              {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
            </div>
            {filtros && <div className="mt-4">{filtros}</div>}
          </header>
          {children}
        </div>
      </div>
    </TarotAdminShell>
  );
}

// ── Estructura ──────────────────────────────────────────────────────────────
export function Seccion({ titulo, descripcion, icono: Icono, accion, children, id, className = "" }: {
  titulo: ReactNode; descripcion?: ReactNode; icono?: LucideIcon; accion?: ReactNode; children: ReactNode; id?: string; className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 space-y-3.5 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.015em] text-gray-50 md:text-[19px]">
            {Icono && <Icono size={18} strokeWidth={1.9} className="shrink-0 text-gray-400" aria-hidden="true" />}{titulo}
          </h2>
          {descripcion && <p className="mt-0.5 max-w-[80ch] text-[13.5px] leading-relaxed text-gray-400">{descripcion}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function Panel({ titulo, subtitulo, accion, children, className = "", cuerpo = "", icono: Icono, id }: {
  titulo?: ReactNode; subtitulo?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string; cuerpo?: string; icono?: LucideIcon; id?: string;
}) {
  const conCabeza = titulo != null || accion != null;
  return (
    <section id={id} className={`min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.02] ${className}`}>
      {conCabeza && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 md:px-5 md:pt-5">
          <div className="min-w-0">
            {titulo != null && <h3 className="flex items-center gap-2 text-[15.5px] font-semibold tracking-[-0.01em] text-gray-50">{Icono && <Icono size={16} className="shrink-0 text-gray-400" aria-hidden="true" />}{titulo}</h3>}
            {subtitulo && <p className="mt-0.5 text-[13px] leading-snug text-gray-400">{subtitulo}</p>}
          </div>
          {accion}
        </div>
      )}
      <div className={cuerpo || (conCabeza ? "px-4 pb-4 pt-3 md:px-5 md:pb-5" : "p-4 md:p-5")}>{children}</div>
    </section>
  );
}

/** Etiqueta pequeña de bloque (dentro de una tarjeta). */
export function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[12px] font-medium uppercase tracking-[0.06em] text-gray-400 ${className}`}>{children}</p>;
}

/** Par etiqueta / valor. */
export function Dato({ etiqueta, valor, sub, tono = "neutro", className = "", ayuda }: { etiqueta: ReactNode; valor: ReactNode; sub?: ReactNode; tono?: Tono; className?: string; ayuda?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="flex items-center gap-1 text-[12.5px] text-gray-400">{etiqueta}{ayuda && <Ayuda texto={ayuda} />}</p>
      <p className={`mt-0.5 text-[15px] font-semibold tabular-nums ${tono === "neutro" ? "text-gray-50" : TONO[tono].fuerte}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-[12.5px] leading-snug text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Indicadores ─────────────────────────────────────────────────────────────
export function Kpi({ etiqueta, valor, tono = "neutro", contexto, delta, ayuda, className = "", icono: Icono }: {
  etiqueta: string; valor: ReactNode; tono?: Tono; contexto?: ReactNode; delta?: ReactNode; ayuda?: string; className?: string; icono?: LucideIcon;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-[18px] ${className}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-400">{Icono && <Icono size={14} aria-hidden="true" />}{etiqueta}{ayuda && <Ayuda texto={ayuda} />}</p>
      <p className={`mt-2 text-[27px] font-semibold leading-none tracking-[-0.025em] tabular-nums md:text-[30px] ${tono === "neutro" ? "text-gray-50" : TONO[tono].fuerte}`}>{valor}</p>
      {delta && <div className="mt-2.5 text-[12.5px]">{delta}</div>}
      {contexto && <div className="mt-1.5 text-[12.5px] leading-snug text-gray-400">{contexto}</div>}
    </div>
  );
}

/** Variación contra el período anterior, solo cuando es comparable. */
export function Delta({ ahora, antes, formato, sentido = "mas", comparable = true }: {
  ahora: number | null; antes: number | null; formato: (v: number) => string; sentido?: "mas" | "menos" | "neutro"; comparable?: boolean;
}) {
  if (!comparable || ahora == null || antes == null) return <span className="text-gray-400">Sin período comparable</span>;
  const d = ahora - antes;
  if (Math.abs(d) < 0.5) return <span className="inline-flex items-center gap-1 text-gray-400"><Minus size={13} aria-hidden="true" /> Igual que el período anterior</span>;
  const bueno = sentido === "neutro" ? null : sentido === "mas" ? d > 0 : d < 0;
  const Icono = d > 0 ? ArrowUpRight : ArrowDownRight;
  const color = bueno == null ? "text-gray-200" : bueno ? "text-emerald-300" : "text-rose-300";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${color}`}><Icono size={14} aria-hidden="true" />{formato(Math.abs(d))}</span>
      <span className="text-gray-400">vs. {formato(antes)} antes</span>
    </span>
  );
}

// ── Insignias y estados ─────────────────────────────────────────────────────
export function Insignia({ tono = "neutro", children, icono: Icono, className = "", title }: { tono?: Tono; children: ReactNode; icono?: LucideIcon; className?: string; title?: string }) {
  const t = TONO[tono];
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-[3px] text-[11.5px] font-medium leading-none ring-1 ring-inset ${t.fondo} ${tono === "neutro" ? "text-gray-200" : t.fuerte} ${t.anillo} ${className}`}>
      {Icono && <Icono size={12} aria-hidden="true" className="shrink-0" />}<span className="truncate">{children}</span>
    </span>
  );
}

export function Punto({ tono = "neutro", className = "" }: { tono?: Tono; className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONO[tono].punto} ${className}`} />;
}

// ── Botones ─────────────────────────────────────────────────────────────────
type Variante = "primario" | "secundario" | "fantasma" | "ia" | "positivo" | "peligro" | "marca";
const VARIANTE: Record<Variante, string> = {
  primario: "bg-gray-50 text-gray-950 hover:bg-white shadow-sm shadow-black/30",
  secundario: "bg-white/[0.06] text-gray-100 ring-1 ring-inset ring-white/[0.1] hover:bg-white/[0.1]",
  fantasma: "text-gray-300 hover:bg-white/[0.06] hover:text-gray-50",
  ia: "bg-violet-500/15 text-violet-100 ring-1 ring-inset ring-violet-400/30 hover:bg-violet-500/25",
  positivo: "bg-emerald-500/15 text-emerald-100 ring-1 ring-inset ring-emerald-400/30 hover:bg-emerald-500/25",
  peligro: "bg-rose-500/10 text-rose-100 ring-1 ring-inset ring-rose-400/30 hover:bg-rose-500/20",
  marca: "bg-amber-300 text-gray-950 hover:bg-amber-200 shadow-sm shadow-black/30",
};
const TAMANO = { md: "min-h-[40px] px-3.5 text-[14px]", sm: "min-h-[36px] px-3 text-[13px]" };
const claseBoton = (v: Variante, t: keyof typeof TAMANO) => `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO} ${VARIANTE[v]} ${TAMANO[t]}`;

export function Boton({ variante = "secundario", tamano = "md", icono: Icono, cargando, children, className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamano?: keyof typeof TAMANO; icono?: LucideIcon; cargando?: boolean }) {
  return (
    <button type="button" {...p} disabled={p.disabled || cargando} className={`${claseBoton(variante, tamano)} ${className}`}>
      {cargando ? <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : Icono ? <Icono size={tamano === "sm" ? 14 : 15} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function BotonLink({ href, variante = "secundario", tamano = "md", icono: Icono, children, className = "", externo }: { href: string; variante?: Variante; tamano?: keyof typeof TAMANO; icono?: LucideIcon; children: ReactNode; className?: string; externo?: boolean }) {
  const cls = `${claseBoton(variante, tamano)} ${className}`;
  const contenido = <>{Icono && <Icono size={tamano === "sm" ? 14 : 15} aria-hidden="true" />}{children}</>;
  return externo
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{contenido}</a>
    : <Link href={href as Route<string>} className={cls}>{contenido}</Link>;
}

/** Enlace de texto (navegación contextual). */
export function Enlace({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href as Route<string>} className={`rounded font-medium text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline ${FOCO} ${className}`}>{children}</Link>;
}

// ── Controles ───────────────────────────────────────────────────────────────
export function Segmentado<T extends string>({ opciones, valor, onChange, etiqueta, className = "", tamano = "md" }: {
  opciones: { id: T; t: ReactNode; n?: number | null; tono?: Tono }[]; valor: T; onChange: (v: T) => void; etiqueta: string; className?: string; tamano?: "md" | "sm";
}) {
  return (
    <div className={`max-w-full overflow-x-auto [scrollbar-width:none] ${className}`}>
      <div role="tablist" aria-label={etiqueta} className="inline-flex gap-0.5 rounded-lg bg-white/[0.035] p-[3px] ring-1 ring-inset ring-white/[0.07]">
        {opciones.map((o) => {
          const sel = o.id === valor;
          return (
            <button key={o.id} type="button" role="tab" aria-selected={sel} onClick={() => onChange(o.id)}
              className={`inline-flex ${tamano === "sm" ? "min-h-[30px] px-2.5 text-[12.5px]" : "min-h-[34px] px-3 text-[13.5px]"} items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150 ${FOCO} ${sel ? "bg-white/[0.1] text-gray-50 shadow-sm shadow-black/40" : "text-gray-400 hover:text-gray-100"}`}>
              {o.t}
              {o.n != null && <span className={`tabular-nums ${sel ? (o.tono && o.tono !== "neutro" ? TONO[o.tono].fuerte : "text-gray-300") : "text-gray-500"}`}>{o.n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Selector({ valor, onChange, opciones, etiqueta, className = "" }: { valor: string; onChange: (v: string) => void; opciones: { id: string; t: string }[]; etiqueta: string; className?: string }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select aria-label={etiqueta} value={valor} onChange={(e) => onChange(e.target.value)}
        className={`min-h-[38px] w-full appearance-none rounded-lg bg-white/[0.04] py-1.5 pl-3 pr-8 text-[13.5px] font-medium text-gray-100 ring-1 ring-inset ring-white/[0.1] transition-colors hover:bg-white/[0.07] ${FOCO} [&>option]:bg-gray-900`}>
        {opciones.map((o) => <option key={o.id} value={o.id}>{o.t}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </span>
  );
}

export const claseCampo = `w-full rounded-lg bg-white/[0.04] px-3 py-2 text-[14.5px] text-gray-50 ring-1 ring-inset ring-white/[0.1] placeholder:text-gray-500 transition-colors hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-sky-400/60`;

export function Campo({ etiqueta, ayuda, children, className = "" }: { etiqueta: ReactNode; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-[13px] font-medium text-gray-200">{etiqueta}</span>
      <span className="mt-1.5 block">{children}</span>
      {ayuda && <span className="mt-1 block text-[12px] leading-snug text-gray-400">{ayuda}</span>}
    </label>
  );
}

// ── Mensajes ────────────────────────────────────────────────────────────────
export function Aviso({ tono = "info", titulo, children, icono: Icono = Info, className = "", accion }: { tono?: Tono; titulo?: ReactNode; children?: ReactNode; icono?: LucideIcon; className?: string; accion?: ReactNode }) {
  const t = TONO[tono];
  return (
    <div className={`flex gap-3 rounded-lg px-3.5 py-3 ring-1 ring-inset ${t.fondo} ${t.anillo} ${className}`} role={tono === "negativo" ? "alert" : undefined}>
      <Icono size={16} className={`mt-0.5 shrink-0 ${t.fuerte}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-gray-200">
        {titulo && <p className={`font-semibold ${t.texto}`}>{titulo}</p>}
        {children && <div className={titulo ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {accion && <div className="shrink-0 self-center">{accion}</div>}
    </div>
  );
}

export function Vacio({ icono: Icono = Check, titulo, texto, accion, className = "" }: { icono?: LucideIcon; titulo: string; texto?: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center rounded-xl border border-dashed border-white/[0.1] px-6 py-8 text-center ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-gray-400"><Icono size={18} aria-hidden="true" /></span>
      <p className="mt-3 text-[14.5px] font-medium text-gray-100">{titulo}</p>
      {texto && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-gray-400">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return <Aviso tono="negativo" titulo="No se pudieron cargar los datos" accion={reintentar && <Boton tamano="sm" onClick={reintentar}>Reintentar</Boton>}>{mensaje}</Aviso>;
}

// ── Carga ───────────────────────────────────────────────────────────────────
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`} />;
}
export function EsqueletoPagina({ tarjetas = 4 }: { tarjetas?: number }) {
  return (
    <div className="relative space-y-6" role="status" aria-label="Cargando">
      <Esqueleto className="h-44 rounded-xl" />
      <div className={`grid grid-cols-2 gap-3 ${tarjetas >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {Array.from({ length: tarjetas }, (_, i) => <Esqueleto key={i} className="h-28 rounded-xl" />)}
      </div>
      <Esqueleto className="h-64 rounded-xl" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

// ── Divulgación progresiva ──────────────────────────────────────────────────
export function Desplegable({ titulo, resumen, icono: Icono, children, inicial = false, className = "", plano }: {
  titulo: ReactNode; resumen?: ReactNode; icono?: LucideIcon; children: ReactNode; inicial?: boolean; className?: string; plano?: boolean;
}) {
  const [abierto, setAbierto] = useState(inicial);
  return (
    <div className={`${plano ? "" : "rounded-lg ring-1 ring-inset ring-white/[0.07]"} ${className}`}>
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}
        className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.03] ${FOCO}`}>
        {Icono && <Icono size={15} className="shrink-0 text-gray-400" aria-hidden="true" />}
        <span className="min-w-0 flex-1 text-[14px] font-medium text-gray-100">{titulo}</span>
        {resumen && <span className="hidden shrink-0 text-[12.5px] text-gray-400 sm:inline">{resumen}</span>}
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-gray-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && <div className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">{children}</div>}
    </div>
  );
}

/** Ícono de ayuda con explicación al pasar el mouse o con foco de teclado. */
export function Ayuda({ texto, lado = "centro" }: { texto: string; lado?: "centro" | "izq" | "der" }) {
  const pos = lado === "izq" ? "left-0" : lado === "der" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex align-middle normal-case tracking-normal">
      <button type="button" aria-label={texto} className={`rounded-full text-gray-500 transition-colors hover:text-gray-200 ${FOCO}`}><Info size={13} aria-hidden="true" /></button>
      <span role="tooltip" className={`pointer-events-none invisible absolute bottom-full z-40 mb-2 w-64 max-w-[70vw] rounded-lg bg-gray-900 px-3 py-2 text-left text-[12.5px] font-normal leading-snug text-gray-200 opacity-0 shadow-xl shadow-black/50 ring-1 ring-white/10 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${pos}`}>{texto}</span>
    </span>
  );
}

// ── Progreso ────────────────────────────────────────────────────────────────
export function Barra({ valor, max, tono = "info", className = "", etiqueta }: { valor: number; max: number; tono?: Tono; className?: string; etiqueta?: string }) {
  const p = max > 0 ? Math.min(Math.max(valor / max, 0), 1) : 0;
  return (
    <div role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(valor)} className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07] ${className}`}>
      <div className={`h-full rounded-full ${TONO[tono].barra} transition-[width] duration-500 ease-out`} style={{ width: `${p * 100}%` }} />
    </div>
  );
}

// ── Notificación breve (feedback al guardar o decidir) ──────────────────────
export function useNotificacion() {
  const [n, setN] = useState<{ texto: string; tono: Tono; id: number } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = useCallback((texto: string, tono: Tono = "positivo") => {
    if (t.current) clearTimeout(t.current);
    setN({ texto, tono, id: Date.now() });
    t.current = setTimeout(() => setN(null), 4500);
  }, []);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const nodo = n ? (
    <div key={n.id} role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6">
      <div className="flex max-w-md items-start gap-2.5 rounded-xl bg-gray-900 px-4 py-3 text-[13.5px] text-gray-100 shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-[ic-entrar_180ms_ease-out]">
        {n.tono === "negativo" ? <X size={16} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" /> : <Check size={16} className={`mt-0.5 shrink-0 ${TONO[n.tono].fuerte}`} aria-hidden="true" />}
        <span>{n.texto}</span>
        <button type="button" onClick={() => setN(null)} aria-label="Cerrar" className={`-mr-1 ml-1 rounded p-0.5 text-gray-400 hover:text-gray-100 ${FOCO}`}><X size={14} /></button>
      </div>
      <style>{"@keyframes ic-entrar{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"}</style>
    </div>
  ) : null;
  return { nodo, avisar };
}

/** POST al módulo con el mensaje de error legible. */
export async function enviarIC<T = { ok: true; aviso?: string | null; id?: string }>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/admin/tarot/inteligencia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.motivo || d.detalle || "No se pudo guardar.");
  return d as T;
}

/** GET de una vista del módulo, con estado de carga y error. */
export function useVista<T>(vista: string | null) {
  const [d, setD] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    if (!vista) return;
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/tarot/inteligencia?vista=${vista}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.detalle || j.motivo || "Error");
      setD(j); setActualizado(new Date().toISOString());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setCargando(false); }
  }, [vista]);
  useEffect(() => { cargar(); }, [cargar]);
  return { d, error, cargando, cargar, actualizado };
}

/** Botón "Actualizar" con la hora de la última lectura. */
export function Actualizar({ cargando, onClick, actualizado }: { cargando: boolean; onClick: () => void; actualizado?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {actualizado && <span className="hidden text-[12.5px] text-gray-400 sm:inline">Datos de las {new Date(actualizado).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}</span>}
      <Boton tamano="sm" onClick={onClick} cargando={cargando} aria-label="Actualizar los datos">{cargando ? "Actualizando" : "Actualizar"}</Boton>
    </span>
  );
}
