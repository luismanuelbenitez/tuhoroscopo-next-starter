"use client";

// Selector flotante de /pruebas/tarot: cambia la variante del bloque 2 y
// lleva directo a ese bloque. Arriba del botón fijo de compra.
const OPCIONES = [
  { v: "actual", t: "Hoy" },
  { v: "a", t: "A" },
  { v: "b", t: "B" },
  { v: "c", t: "C" },
];

export function SelectorPrueba({ actual }: { actual: string }) {
  return (
    <nav
      aria-label="Variantes del bloque 2"
      className="fixed left-1/2 -translate-x-1/2 bottom-[86px] z-50 flex items-center gap-1 rounded-full px-2 py-1.5"
      style={{ background: "rgba(8,4,16,0.94)", border: "1px solid rgba(240,197,90,0.6)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
    >
      <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-white/70">Bloque 2</span>
      {OPCIONES.map((o) => (
        <a
          key={o.v}
          href={`/pruebas/tarot${o.v === "actual" ? "" : `?v=${o.v}`}#bloque-2`}
          className="rounded-full px-3 py-1.5 text-[13px] font-bold"
          style={o.v === actual ? { background: "#F0C55A", color: "#180e00" } : { color: "#F6EAD2" }}
        >
          {o.t}
        </a>
      ))}
    </nav>
  );
}
