"use client";

import { useEffect, useRef, useState, type ElementType } from "react";
import { Moon, Heart } from "lucide-react";
import { usePrecioTarot } from "@/lib/usePrecioTarot";
import { GOLD } from "./theme";
import { CtaButton } from "./CtaButton";
import { Carousel } from "./Carousel";

const CARD_BG = "#120b22";

function CardTuTirada() {
  const precioTarot = usePrecioTarot();
  return (
    <div
      className="rounded-3xl overflow-hidden flex flex-col"
      style={{ width: "min(84vw, 320px)", background: CARD_BG, border: "1px solid rgba(240,197,90,0.32)" }}
    >
      <div className="relative" style={{ height: 180 }}>
        <img
          src="/img/home/experiencias/tarot.webp"
          alt="Tu Tirada Tarot"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 55%, ${CARD_BG} 100%)` }} />
        <p
          className="absolute top-3 left-3 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
          style={{ color: "#1a1206", background: GOLD }}
        >
          Disponible ahora
        </p>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-lg font-extrabold mb-1.5">Tu Tirada Tarot</h3>
        <p className="text-white/60 text-[13px] leading-relaxed mb-4 flex-1">
          Una lectura de tarot personalizada, clara y práctica, directo a tu WhatsApp en minutos.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: GOLD }}>
            {precioTarot !== null ? `$U ${precioTarot}` : "Ver precio"}
          </span>
          <CtaButton href="/tarot" className="px-4 py-2 text-[12px]">
            Quiero mi tirada →
          </CtaButton>
        </div>
      </div>
    </div>
  );
}

// Imagen real con fallback a un ícono genérico (Lucide, no una foto
// inventada) por si algún día falta el archivo — mismo criterio que
// IconoConFallback, para la imagen grande de la card. Carpeta real:
// public/img/home/experiencias/.
function ImagenCard({ archivo, Fallback }: { archivo: string; Fallback: ElementType }) {
  const ref = useRef<HTMLImageElement>(null);
  const [falló, setFalló] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFalló(true);
  }, [archivo]);

  if (falló) {
    return (
      <div className="flex items-center justify-center" style={{ height: 180, background: "rgba(255,255,255,0.03)" }}>
        <Fallback size={34} style={{ color: GOLD, opacity: 0.55 }} />
      </div>
    );
  }

  return (
    <img
      ref={ref}
      src={`/img/home/experiencias/${archivo}`}
      alt=""
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setFalló(true)}
    />
  );
}

// Próximamente: "Muy pronto" en vez de un CTA real (no es un producto
// comprable todavía) — mismo armado visual que la referencia.
function CardProximamente({
  archivo, Fallback, titulo, descripcion,
}: { archivo: string; Fallback: ElementType; titulo: string; descripcion: string }) {
  return (
    <div
      className="rounded-3xl overflow-hidden flex flex-col"
      style={{ width: "min(84vw, 320px)", background: CARD_BG, border: "1px solid rgba(240,197,90,0.28)" }}
    >
      <div className="relative" style={{ height: 180 }}>
        <ImagenCard archivo={archivo} Fallback={Fallback} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 55%, ${CARD_BG} 100%)` }} />
        <p
          className="absolute top-3 left-3 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
          style={{ color: "#e8e3f0", background: "rgba(40,32,58,0.75)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          Próximamente
        </p>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-lg font-extrabold mb-1.5">{titulo}</h3>
        <p className="text-white/55 text-[13px] leading-relaxed mb-4 flex-1">{descripcion}</p>
        <button
          type="button"
          disabled
          className="w-fit px-4 py-2 text-[12px] rounded-xl font-semibold"
          style={{ color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", cursor: "default" }}
        >
          Muy pronto
        </button>
      </div>
    </div>
  );
}

export function BloqueExperiencias() {
  return (
    <section className="relative px-5 md:px-8 py-4 md:py-6 max-w-[960px] mx-auto text-center">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
        Un universo en expansión
      </p>
      <h2
        className="mb-3"
        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: "clamp(1.6rem, 3.2vw, 2.3rem)" }}
      >
        Experiencias de Tu Oráculo
      </h2>
      <p className="text-white/55 text-[13px] md:text-[14px] mb-8 md:mb-9 max-w-lg mx-auto">
        Hoy podés vivir Tu Tirada Tarot y muy pronto, nuevas experiencias para seguir explorando tu camino.
      </p>
      <Carousel>
        {[
          <CardTuTirada key="tirada" />,
          <CardProximamente
            key="compatibilidad"
            archivo="compatibilidad-astral.webp"
            Fallback={Heart}
            titulo="Compatibilidad Astral"
            descripcion="Descubrí la energía que los une, sus fortalezas y desafíos, y cómo aprovechar su conexión."
          />,
          <CardProximamente
            key="horoscopo"
            archivo="horoscopo-diario.webp"
            Fallback={Moon}
            titulo="Horóscopo Diario"
            descripcion="Tu guía astrológica para cada día, con energías, consejos y claves para aprovechar el momento."
          />,
        ]}
      </Carousel>
    </section>
  );
}
