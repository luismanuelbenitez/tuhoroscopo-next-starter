"use client";

import { useEffect, type ReactNode } from "react";
import { trackViewItem, trackLandingViewed, medirSecciones } from "@/lib/analytics";
import { metaViewContent } from "@/lib/metaPixel";
import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";
import { TarotBackgroundStage } from "@/components/tarot/TarotBackgroundStage";
import { HeaderTarot } from "@/components/tarot/HeaderTarot";
import { HeroTarot } from "@/components/tarot/HeroTarot";
import { HeroTarotAnterior } from "@/components/tarot/HeroTarotAnterior";
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

// Marcador de sección para el Analista de conversión (2026-11-01): qué
// secciones se ven y desde cuál se hace clic al checkout. display:contents
// no genera caja, así que el diseño queda idéntico.
function Seccion({ id, children }: { id: string; children: ReactNode }) {
  return <div data-seccion={id} style={{ display: "contents" }}>{children}</div>;
}

// respaldo: /tarot-anterior (portada sin video). No mide nada, para no
// ensuciar el embudo ni las señales de Meta.
export default function TarotLandingContent({ precioUYU, testimonios, waNumero = "", respaldo = false }: { precioUYU: number | null; testimonios: TestimonioTarot[]; waNumero?: string; respaldo?: boolean }) {
  useEffect(() => {
    if (respaldo) return;
    trackViewItem("tarot", precioUYU ?? undefined);
    trackLandingViewed("tarot");
    metaViewContent(precioUYU ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!respaldo) return medirSecciones(document.body); }, [respaldo]);

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
            <Seccion id="header"><HeaderTarot mostrarTestimonios={testimonios.length > 0} /></Seccion>
            <Seccion id="hero">{respaldo ? <HeroTarotAnterior precioUYU={precioUYU} /> : <HeroTarot precioUYU={precioUYU} />}</Seccion>
            <Seccion id="que_incluye"><QueIncluyeTarot /></Seccion>
            <Seccion id="asi_se_vive"><AsiSeViveTarot /></Seccion>
            <Seccion id="como_funciona"><ComoFuncionaTarot /></Seccion>
            <Seccion id="por_tema"><LecturasPorTema /></Seccion>
            <Seccion id="testimonios"><TestimoniosTarot testimonios={testimonios} /></Seccion>
            <Seccion id="dudas"><DudasTarot waNumero={waNumero} /></Seccion>
            <Seccion id="cta_final"><CtaFinalTarot precioUYU={precioUYU} /></Seccion>
            {/* Pie de marca: también Privacidad, Términos y Contacto (es la
                página donde se decide la compra). */}
            <PieMarca />
          </TarotBackgroundStage>
        </div>
      </div>

      <Seccion id="sticky"><StickyCtaTarot precioUYU={precioUYU} /></Seccion>
    </>
  );
}
