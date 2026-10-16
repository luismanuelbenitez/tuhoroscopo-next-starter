"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CTA_GRADIENT } from "@/components/home/theme";

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
        background: "rgba(8,5,20,0.97)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid rgba(240,197,90,0.18)",
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-white/90 m-0 truncate">
          Tarot{precioTexto ? ` · ${precioTexto}` : ""}
        </p>
      </div>
      <Link
        href="/tarot/checkout"
        className="shrink-0 rounded-xl text-center font-bold whitespace-nowrap"
        style={{ padding: "9px 18px", fontSize: 13, background: CTA_GRADIENT, color: "#180e00" }}
      >
        Quiero mi Tarot →
      </Link>
    </div>
  );
}
