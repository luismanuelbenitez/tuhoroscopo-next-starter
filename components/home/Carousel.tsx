"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GOLD } from "./theme";

// Carrusel horizontal genérico con scroll-snap nativo (sin librería): cada
// hijo es una "página" (card, o grupo de cards) que encastra al hacer
// swipe. En desktop se agregan flechas prev/next; en mobile alcanza con
// el swipe táctil nativo + dots. Reutilizado por Bloque 3 (Experiencias),
// Bloque 4 en mobile (Cómo funciona) y Bloque 5 en mobile (Confianza).
export function Carousel({ children, showArrows = true }: { children: ReactNode[]; showArrows?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);
  const total = children.length;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const children2 = Array.from(track.children) as HTMLElement[];
      const centro = track.scrollLeft + track.clientWidth / 2;
      let cercano = 0;
      let distMin = Infinity;
      children2.forEach((child, i) => {
        const childCentro = child.offsetLeft + child.clientWidth / 2;
        const dist = Math.abs(childCentro - centro);
        if (dist < distMin) { distMin = dist; cercano = i; }
      });
      setActivo(cercano);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  function irA(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[i] as HTMLElement | undefined;
    if (child) track.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
  }

  return (
    <div className="relative">
      {showArrows && total > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => irA(Math.max(0, activo - 1))}
            className="hidden md:flex items-center justify-center absolute"
            style={{
              left: -18, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%",
              background: "rgba(14,9,26,0.85)", border: "1px solid rgba(240,197,90,0.3)", zIndex: 5,
              opacity: activo === 0 ? 0.35 : 1, pointerEvents: activo === 0 ? "none" : "auto",
            }}
          >
            <ChevronLeft size={18} style={{ color: GOLD }} />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => irA(Math.min(total - 1, activo + 1))}
            className="hidden md:flex items-center justify-center absolute"
            style={{
              right: -18, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%",
              background: "rgba(14,9,26,0.85)", border: "1px solid rgba(240,197,90,0.3)", zIndex: 5,
              opacity: activo === total - 1 ? 0.35 : 1, pointerEvents: activo === total - 1 ? "none" : "auto",
            }}
          >
            <ChevronRight size={18} style={{ color: GOLD }} />
          </button>
        </>
      )}

      <div
        ref={trackRef}
        className="flex overflow-x-auto no-scrollbar"
        style={{
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          gap: "1rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children.map((child, i) => (
          <div key={i} style={{ scrollSnapAlign: "start", flexShrink: 0 }}>
            {child}
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className="flex justify-center gap-2 mt-5">
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir a ${i + 1}`}
              onClick={() => irA(i)}
              style={{
                width: i === activo ? 18 : 7, height: 7, borderRadius: 4,
                background: i === activo ? GOLD : "rgba(255,255,255,0.25)",
                transition: "all 0.2s ease", border: "none", padding: 0, cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
