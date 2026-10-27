"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Solo mobile (md:hidden), aparece recién después de scrollear un poco
// (pasado el Hero, que ya tiene su propio CTA) y es compacto a propósito:
// una línea de precio + un botón, nunca tapa contenido de forma agresiva.
export function StickyCtaTarot({ precioUYU }: { precioUYU: number | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const precioTexto = precioUYU !== null ? `$U ${precioUYU}` : null;

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-center gap-3"
      role="complementary"
      aria-label="Acción de compra fija"
      style={{
        zIndex: 200,
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
        background: "rgba(8,5,20,0.88)",
        WebkitBackdropFilter: "blur(14px)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid rgba(240,197,90,0.12)",
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold m-0 truncate" style={{ color: "rgba(246,234,210,0.75)" }}>
          Tu Tirada{precioTexto ? ` · ${precioTexto}` : ""}
        </p>
      </div>
      {/* Discreto a propósito (2026-10-27): contorno dorado en vez de botón
          lleno, para acompañar la lectura de la página sin interrumpirla. */}
      <Link
        href="/tarot/checkout"
        className="shrink-0 rounded-full text-center font-semibold whitespace-nowrap"
        style={{ padding: "8px 16px", fontSize: 13, color: "#F0C55A", border: "1px solid rgba(240,197,90,0.6)", background: "rgba(240,197,90,0.08)" }}
      >
        Quiero mi tirada →
      </Link>
    </div>
  );
}
