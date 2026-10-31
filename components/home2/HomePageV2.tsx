"use client";

import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";
import { HeaderHome } from "@/components/home/HeaderHome";
import { ProductoDestacado } from "@/components/home/ProductoDestacado";
import { BloqueExperiencias } from "@/components/home/BloqueExperiencias";
import { BloqueConfianza } from "@/components/home/BloqueConfianza";
import { AsiSeViveTarot } from "@/components/tarot/AsiSeViveTarot";
import { CtaFinalTarot } from "@/components/tarot/CtaFinalTarot";
import { DudasTarot } from "@/components/tarot/DudasTarot";
import { StickyCtaTarot } from "@/components/tarot/StickyCtaTarot";
import { EscenarioV2 } from "./EscenarioV2";
import { HeroV2 } from "./HeroV2";
import { ComoFuncionaV2 } from "./ComoFuncionaV2";
import { MotorNarrativo } from "./MotorNarrativo";

// Home v2: "la marca presenta, el Tarot protagoniza". Orden pensado para
// la compra: qué es (Hero) → qué incluye y cuánto sale (Producto) → cómo
// se ve (Así vivís) → cómo funciona → qué hay detrás (Motor) → garantías
// → la marca que crece (Experiencias) → dudas → cierre con CTA.
export function HomePageV2({ precioUYU }: { precioUYU: number | null }) {
  return (
    <>
      <GlobalHomeStyles />
      <style jsx global>{`
        body { background-image: none !important; background-color: #0b0818 !important; }
        body::before { display: none !important; }
        header { display: none !important; }
      `}</style>

      <div
        className="min-h-screen text-white pb-16 md:pb-0"
        // overflowX clip: las escenas de 1280 de EscenarioV2 salen del
        // contenedor de 960 y no deben generar scroll horizontal.
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)", overflowX: "clip" }}
      >
        <div className="max-w-[960px] mx-auto">
          <EscenarioV2>
            <HeaderHome />
            <HeroV2 precioUYU={precioUYU} />
            <div className="relative px-5 md:px-8 mt-10 md:mt-14">
              <ProductoDestacado
                imagen={{
                  src: "/img/home2/momento-lectura.webp", ancho: 1122, alto: 1402,
                  alt: "Una lectura de Tu Oráculo abierta en el celular, de noche, entre velas y cartas",
                  posicion: "52% 58%", altoMovil: 380,
                }}
                precioUYU={precioUYU}
              />
            </div>
            <AsiSeViveTarot />
            <ComoFuncionaV2 />
            <MotorNarrativo />
            <BloqueConfianza />
            <BloqueExperiencias conTarot={false} />
            {/* Mini FAQ (auditoría UX 2026-10-30, H8): las 4 dudas que frenan
                la compra, respondidas sin salir de la Home. */}
            <DudasTarot />
            <CtaFinalTarot precioUYU={precioUYU} />
          </EscenarioV2>
        </div>
      </div>
      <StickyCtaTarot precioUYU={precioUYU} />
    </>
  );
}
