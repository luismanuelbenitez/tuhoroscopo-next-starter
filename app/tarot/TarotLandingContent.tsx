import type { ReactNode } from "react";
import { MedicionLandingTarot } from "./MedicionLandingTarot";
import { GlobalHomeStyles } from "@/components/home/GlobalHomeStyles";
import { TarotBackgroundStage } from "@/components/tarot/TarotBackgroundStage";
import { HeaderTarot } from "@/components/tarot/HeaderTarot";
import { HeroTarot } from "@/components/tarot/HeroTarot";
import { HeroTarotAnterior } from "@/components/tarot/HeroTarotAnterior";
import { QueIncluyeTarot, type VarianteQueIncluye } from "@/components/tarot/QueIncluyeTarot";
import { AsiSeViveTarot } from "@/components/tarot/AsiSeViveTarot";
import { AsiSeViveSoloEscritorio } from "@/components/tarot/SoloEscritorio";
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

// respaldo: /tarot-anterior (portada sin video). prueba: /pruebas/tarot
// (variantes del bloque 2). Ninguno de los dos mide nada, para no
// ensuciar el embudo ni las señales de Meta.
//
// Componente de servidor (2026-11-05, objetivo LCP móvil 2,5 s): las
// secciones sin interacción llegan armadas y el celular no ejecuta su JS.
// La medición vive en MedicionLandingTarot (cliente).
const ESTILOS_PAGINA = `
  body { background-image: none !important; background-color: #0b0818 !important; }
  body::before { display: none !important; }
  header { display: none !important; }
  /* Sin footer global en esta landing: cierra con la línea de copyright propia. */
  footer { display: none !important; }
`;

export default function TarotLandingContent({ precioUYU, testimonios, waNumero = "", respaldo = false, prueba = false, variante }: { precioUYU: number | null; testimonios: TestimonioTarot[]; waNumero?: string; respaldo?: boolean; prueba?: boolean; variante?: VarianteQueIncluye }) {
  const sinMedicion = respaldo || prueba;

  return (
    <>
      {!sinMedicion && <MedicionLandingTarot precioUYU={precioUYU} />}
      <GlobalHomeStyles />
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_PAGINA }} />

      <div
        className="min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)" }}
      >
        <div className="max-w-[960px] mx-auto">
          <TarotBackgroundStage>
            <Seccion id="header"><HeaderTarot mostrarTestimonios={testimonios.length > 0} /></Seccion>
            <Seccion id="hero">{respaldo ? <HeroTarotAnterior precioUYU={precioUYU} /> : <HeroTarot precioUYU={precioUYU} />}</Seccion>
            <Seccion id="que_incluye"><div id="bloque-2" className="scroll-mt-16" />{/* Móvil: variante A elegida por Manuel (2026-11-03). /tarot-anterior conserva el bloque viejo; en /pruebas/tarot se elige. */}<QueIncluyeTarot variante={prueba ? variante : respaldo ? undefined : "a"} /></Seccion>
            {/* Móvil (auditoría 2026-11-04): "Así vivís la experiencia" repetía
                lo que el bloque 2 ya muestra en vivo (lectura online, audio,
                PDF); queda solo en escritorio, donde el bloque 2 es otro. */}
            <Seccion id="asi_se_vive">{respaldo ? <AsiSeViveTarot /> : <AsiSeViveSoloEscritorio />}</Seccion>
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
