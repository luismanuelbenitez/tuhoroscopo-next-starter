import type { ReactNode } from "react";
import { MedicionLandingTarot } from "../MedicionLandingTarot";
import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";
import { TarotBackgroundStage } from "@/components/tarot/TarotBackgroundStage";
import { HeaderTarot } from "@/components/tarot/HeaderTarot";
import { HeroTarot, BAJADA_HERO_TAROT } from "@/components/tarot/HeroTarot";
import { QueIncluyeTarot } from "@/components/tarot/QueIncluyeTarot";
import { AsiSeViveSoloEscritorio } from "@/components/tarot/SoloEscritorio";
import { ComoFuncionaTarot } from "@/components/tarot/ComoFuncionaTarot";
import { TestimoniosTarot } from "@/components/tarot/TestimoniosTarot";
import type { TestimonioTarot } from "@/lib/getTestimoniosTarot";
import { CtaFinalTarot } from "@/components/tarot/CtaFinalTarot";
import { StickyCtaTarot } from "@/components/tarot/StickyCtaTarot";
import { PieMarca } from "@/components/marca/PieMarca";
import { LecturasPorTema } from "@/components/tarot/LecturasPorTema";
import { BloqueTiradaDeTarot } from "@/components/tarot/BloqueTiradaDeTarot";
import { DudasTarot, type DudaTarot } from "@/components/tarot/DudasTarot";

// /tarot/tirada-de-tarot (2026-11-17, regla G14 "una página por búsqueda",
// pedido de Manuel: "copiate la página tarot… y ajustale los textos para
// enamorar a Google"). Es /tarot (mismo diseño, mismo checkout, misma
// medición) con la frase "tirada de tarot" — la que más vende en Google Ads —
// en el title, el H1, la portada, un bloque propio, las dudas y el cierre.
// /tarot no cambia: los componentes compartidos reciben textos opcionales.

function Seccion({ id, children }: { id: string; children: ReactNode }) {
  return <div data-seccion={id} style={{ display: "contents" }}>{children}</div>;
}

const ESTILOS_PAGINA = `
  body { background-image: none !important; background-color: #0b0818 !important; }
  body::before { display: none !important; }
  header { display: none !important; }
  footer { display: none !important; }
`;

const DUDAS_TIRADA: DudaTarot[] = [
  {
    q: "¿Qué es una tirada de tarot?",
    a: "Es una forma de sacar y ordenar las cartas para responder una consulta: cada carta ocupa un lugar con un significado propio. Tu tirada de tarot es de 5 cartas (momento actual, desafío, lo que no ves, consejo y lo que viene) y se interpreta para tu nombre, tu tema y, si la escribís, tu pregunta.",
  },
  {
    q: "¿Cómo hago mi tirada de tarot online?",
    a: "Tocás el botón, elegís el tema (amor, trabajo y dinero, una decisión o tu momento general), escribís tu pregunta si querés y pagás con Mercado Pago. En minutos te llega tu tirada por WhatsApp, explicada carta por carta, con resumen en audio y PDF.",
  },
];

export default function TiradaDeTarotContent({ precioUYU, testimonios, waNumero = "" }: { precioUYU: number | null; testimonios: TestimonioTarot[]; waNumero?: string }) {
  return (
    <>
      <MedicionLandingTarot precioUYU={precioUYU} />
      <GlobalHomeStyles />
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_PAGINA }} />

      <div
        className="min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)" }}
      >
        <div className="max-w-[960px] mx-auto">
          <TarotBackgroundStage>
            <Seccion id="header"><HeaderTarot mostrarTestimonios={testimonios.length > 0} precioUYU={precioUYU} /></Seccion>
            <Seccion id="hero">
              <HeroTarot
                precioUYU={precioUYU}
                textos={{
                  h1: "Tirada de tarot online",
                  titulo: "Tu tirada de tarot,",
                  tituloDorado: "lista en minutos en tu WhatsApp.",
                  // Igual que el checkout: primero se elige el tema; la pregunta es opcional (Manuel, 22/11).
                  bajada: BAJADA_HERO_TAROT,
                }}
              />
            </Seccion>
            <Seccion id="que_incluye"><div id="bloque-2" className="scroll-mt-16" /><QueIncluyeTarot variante="a" precioUYU={precioUYU} bajadaRevela="Elegís tu tema y, si querés, sumás una pregunta. Tus 5 cartas se revelan una a una y cada una responde algo distinto de tu momento." /></Seccion>
            <Seccion id="asi_se_vive"><AsiSeViveSoloEscritorio /></Seccion>
            {/* Una sola versión del recorrido: los mismos 4 pasos en celular y escritorio (22/11). */}
            <Seccion id="como_funciona"><ComoFuncionaTarot cuatroPasos /></Seccion>
            <Seccion id="por_tema"><BloqueTiradaDeTarot precioUYU={precioUYU} /><LecturasPorTema precioUYU={precioUYU} /></Seccion>
            <Seccion id="testimonios"><TestimoniosTarot testimonios={testimonios} /></Seccion>
            <Seccion id="dudas"><DudasTarot waNumero={waNumero} primeras={DUDAS_TIRADA} /></Seccion>
            <Seccion id="cta_final">
              <CtaFinalTarot
                precioUYU={precioUYU}
                titulo="Tu tirada de tarot te está esperando."
                bajada="Elegí tu tema, sumá una pregunta si querés y recibí tu tirada de tarot personalizada en minutos."
              />
            </Seccion>
            <PieMarca />
          </TarotBackgroundStage>
        </div>
      </div>

      <Seccion id="sticky"><StickyCtaTarot precioUYU={precioUYU} precioEnBoton /></Seccion>
    </>
  );
}
