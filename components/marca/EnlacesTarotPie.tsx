import Link from "next/link";
import type { Route } from "next";
import { GOLD } from "@/components/home/theme";

// Enlaces del pie hacia las páginas de Tarot por intención (2026-10-21,
// Paquete SEO 1). Una sola pieza para todos los cierres del sitio: el footer
// global (home) y las líneas de cierre propias de /tarot, las institucionales
// y las landings SEO (que ocultan el footer global). Discreto a propósito:
// misma tipografía y opacidad que la línea de copyright.
const ENLACES = [
  { href: "/tarot", label: "Tarot personalizado online" },
  { href: "/tarot/amor", label: "Tarot del amor" },
  { href: "/tarot/trabajo-y-dinero", label: "Trabajo y dinero" },
  { href: "/tarot/decisiones", label: "Decisiones" },
  { href: "/tarot/online-uruguay", label: "Tarot online en Uruguay" },
  { href: "/tarot/lectura-personalizada", label: "Qué incluye la lectura" },
];

export function EnlacesTarotPie({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Tarot" className={`relative px-5 mx-auto max-w-[760px] text-center ${className}`}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: GOLD, opacity: 0.85, textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}>Tarot</p>
      {/* Sombra: en las institucionales/SEO el pie cae sobre la escena (velas) */}
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-white/65" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)" }}>
        {ENLACES.map((e) => (
          <li key={e.href}>
            <Link href={e.href as Route<string>} className="hover:text-white/85 transition-colors">{e.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
