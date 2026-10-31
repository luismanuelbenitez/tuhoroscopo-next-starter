"use client";

import { useEffect } from "react";
import { trackViewItem, trackLandingViewed } from "@/lib/analytics";
import { metaViewContent } from "@/lib/metaPixel";
import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";
import { TarotBackgroundStage } from "@/components/tarot/TarotBackgroundStage";
import { HeaderTarot } from "@/components/tarot/HeaderTarot";
import { HeroTarot } from "@/components/tarot/HeroTarot";
import { QueIncluyeTarot } from "@/components/tarot/QueIncluyeTarot";
import { AsiSeViveTarot } from "@/components/tarot/AsiSeViveTarot";
import { ComoFuncionaTarot } from "@/components/tarot/ComoFuncionaTarot";
import { TestimoniosTarot } from "@/components/tarot/TestimoniosTarot";
import type { TestimonioTarot } from "@/lib/getTestimoniosTarot";
import { CtaFinalTarot } from "@/components/tarot/CtaFinalTarot";
import { StickyCtaTarot } from "@/components/tarot/StickyCtaTarot";
import { PieMarca } from "@/components/marca/PieMarca";
import { LecturasPorTema } from "@/components/tarot/LecturasPorTema";
import { DudasTarot } from "@/components/tarot/DudasTarot";

// Mismo criterio arquitectónico que la Home (app/page.tsx): se oculta el
// header global del layout y se renderiza el propio (HeaderTarot) DENTRO
// del escenario (TarotBackgroundStage), que envuelve todos los bloques
// hasta antes del footer (footer queda afuera, lo pone el layout). Ancho
// maestro 960px, igual que Home, para que ambas páginas se sientan parte
// de la misma experiencia.
export default function TarotLandingContent({ precioUYU, testimonios }: { precioUYU: number | null; testimonios: TestimonioTarot[] }) {
  useEffect(() => {
    trackViewItem("tarot", precioUYU ?? undefined);
    trackLandingViewed("tarot");
    metaViewContent(precioUYU ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <GlobalHomeStyles />
      <style jsx global>{`
        body { background-image: none !important; background-color: #0b0818 !important; }
        body::before { display: none !important; }
        header { display: none !important; }
        /* Sin footer global en esta landing: cierra con la línea de copyright propia. */
        footer { display: none !important; }
      `}</style>

      <div
        className="min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)" }}
      >
        <div className="max-w-[960px] mx-auto">
          <TarotBackgroundStage>
            <HeaderTarot mostrarTestimonios={testimonios.length > 0} />
            <HeroTarot precioUYU={precioUYU} />
            <QueIncluyeTarot />
            <AsiSeViveTarot />
            <ComoFuncionaTarot />
            <LecturasPorTema />
            <TestimoniosTarot testimonios={testimonios} />
            <DudasTarot />
            <CtaFinalTarot precioUYU={precioUYU} />
            {/* Pie de marca: también Privacidad, Términos y Contacto (es la
                página donde se decide la compra). */}
            <PieMarca />
          </TarotBackgroundStage>
        </div>
      </div>

      <StickyCtaTarot precioUYU={precioUYU} />
    </>
  );
}
