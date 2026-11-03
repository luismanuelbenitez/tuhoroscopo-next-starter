"use client";

import { useEffect, useRef, useState } from "react";
import { urlOptimizada } from "@/lib/imagen";

// Video corto de la portada de /tarot (2026-11-03): 14 s del anuncio V6
// (tuoraculo_general_v6.mp4, de "Hacé tu consulta" al PDF, sin el cierre con
// precio), 540×960, sin audio, 1,3 MB. Muestra en concreto qué se recibe.
// Primero se pinta la imagen fija (no compite con la carga de la página); el
// video se pide recién cuando la tarjeta está en pantalla y la página ya
// cargó. Con "ahorro de datos" o movimiento reducido queda la imagen fija.
const DIR = "/img/tarot/video";
const POSTER = urlOptimizada(`${DIR}/tarot-demo-poster.webp`, 640);

export function VideoDemoTarot({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [cargar, setCargar] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conexion?.saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let obs: IntersectionObserver | null = null;
    const empezar = () => {
      obs = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { setCargar(true); obs?.disconnect(); }
      }, { rootMargin: "200px" });
      obs.observe(v);
    };
    if (document.readyState === "complete") empezar();
    else window.addEventListener("load", empezar, { once: true });
    return () => { window.removeEventListener("load", empezar); obs?.disconnect(); };
  }, []);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: "9 / 16", borderRadius: 22, border: "1px solid rgba(240,197,90,0.45)", boxShadow: "0 18px 50px rgba(0,0,0,0.55), 0 0 0 4px rgba(10,7,20,0.55)", background: "#0b0818" }}
    >
      <video
        ref={ref}
        className="absolute inset-0 w-full h-full object-cover"
        poster={POSTER}
        muted
        loop
        playsInline
        autoPlay
        preload="none"
        aria-label="Video: así llega tu lectura de Tarot por WhatsApp, carta por carta, con resumen en audio y PDF"
        src={cargar ? `${DIR}/tarot-demo.mp4` : undefined}
      />
    </div>
  );
}
