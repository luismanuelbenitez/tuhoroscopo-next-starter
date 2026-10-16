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
export function ConIcono({ Icon, arriba, children }: { Icon: LucideIcon; arriba?: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      <Icon
        size={17}
        aria-hidden="true"
        className={`absolute left-4 text-white/45 pointer-events-none ${arriba ? "top-[15px]" : "top-1/2 -translate-y-1/2"}`}
      />
      {children}
    </div>
  );
}
