"use client";

import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";
import { HeaderHome } from "@/components/home/HeaderHome";
import { HomeBackgroundStage } from "@/components/home/HomeBackgroundStage";
import { HeroExperiencias } from "@/components/home/HeroExperiencias";
import { ProductoDestacado } from "@/components/home/ProductoDestacado";
import { BloqueExperiencias } from "@/components/home/BloqueExperiencias";
import { ComoFunciona } from "@/components/home/ComoFunciona";
import { BloqueConfianza } from "@/components/home/BloqueConfianza";

// Un único escenario visual (HomeBackgroundStage) envuelve TODOS los
// bloques de la home, hasta antes del footer (que queda afuera, en el
// layout). El escenario ya no tiene alto fijo: lo da el flujo normal de
// sus hijos, y el fondo (dos <img> mobile/desktop, position:absolute) se
// estira a ese alto. Nada de márgenes negativos ni posicionamiento
// absoluto para "superponer" bloques — cada bloque fluye normal, uno
// debajo del otro, como una página común.
export default function HomePage() {
  return (
    <>
      <GlobalHomeStyles />
      <style jsx global>{`
        body { background-image: none !important; background-color: #0b0818 !important; }
        body::before { display: none !important; }
        header { display: none !important; }
      `}</style>

      <div
        className="min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)" }}
      >
        <div className="max-w-[960px] mx-auto">
          <HomeBackgroundStage>
            <HeaderHome />
            <HeroExperiencias />
            <div className="relative px-5 md:px-8 mt-10 md:mt-14">
              <ProductoDestacado />
            </div>
            <BloqueExperiencias />
            <ComoFunciona />
            <BloqueConfianza />
          </HomeBackgroundStage>
        </div>
      </div>
    </>
  );
}
