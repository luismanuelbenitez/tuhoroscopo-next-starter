"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Primitivas visuales de los campos del checkout. Solo presentación: el
// estado, las validaciones y el envío siguen en TarotCheckoutContent.

export const inputCheckout =
  "w-full rounded-xl px-4 py-3 h-12 ring-1 ring-white/15 text-white text-[14.5px] placeholder:text-white/40 " +
  "focus:outline-none focus:ring-2 focus:ring-[#F0C55A]/55 disabled:opacity-60 transition-shadow";

export const inputBg = { background: "rgba(255,255,255,0.045)" } as const;

export function Etiqueta({ htmlFor, texto, nota, children }: { htmlFor?: string; texto: string; nota?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
      <label htmlFor={htmlFor} className="text-[14px] font-medium text-white/90">
        {texto} {nota && <span className="text-[12px] font-normal text-white/45">({nota})</span>}
      </label>
      {children}
    </div>
  );
}

// Ícono a la izquierda del input. `arriba` para textarea (ícono alineado
// a la primera línea en vez de centrado).
// `iconoClase`: clases extra del ícono (ej. "md:hidden" en campos angostos).
export function ConIcono({ Icon, arriba, iconoClase = "", children }: { Icon: LucideIcon; arriba?: boolean; iconoClase?: string; children: ReactNode }) {
  return (
    <div className="relative">
      <Icon
        size={17}
        aria-hidden="true"
        className={`absolute left-4 text-white/45 pointer-events-none ${arriba ? "top-[15px]" : "top-1/2 -translate-y-1/2"} ${iconoClase}`}
      />
      {children}
    </div>
  );
}

// Encabezado de cada paso del formulario (1 Tus datos · 2 Tu consulta ·
// 3 Tu compra): número dorado + título serif + bajada.
export function Paso({ n, titulo, bajada, separado = false }: { n: number; titulo: string; bajada: string; separado?: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${separado ? "pt-5 border-t border-white/10" : ""}`}>
      <span
        className="shrink-0 flex items-center justify-center rounded-full text-[15px] font-bold"
        style={{ width: 32, height: 32, color: "#180e00", background: "linear-gradient(135deg, #c8980e 0%, #FFCE4D 60%, #e8bc3a 100%)", boxShadow: "0 0 12px rgba(240,197,90,0.30)", fontVariantNumeric: "lining-nums" }}
      >
        {n}
      </span>
      <div>
        <p className="text-[21px] leading-tight" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, color: "#F5EFE0" }}>{titulo}</p>
        <p className="text-[12.5px] text-white/55 mt-0.5">{bajada}</p>
      </div>
    </div>
  );
}
