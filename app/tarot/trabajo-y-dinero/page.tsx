import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { metadataSeo } from "@/lib/seo/paginasSeo";
import { PaginaSeo } from "@/components/seo/PaginaSeo";
import {
  HeroSeo, Seccion, Lista, Destacado, PosicionesTarot, FaqSeo, CierreSeo, NotaTransparencia, CtaSeo, checkoutConTema,
} from "@/components/seo/BloquesSeo";

// Intención: dudas de trabajo, proyectos o dinero. El checkout tiene "trabajo"
// y "dinero" como temas separados: cada CTA preselecciona el que corresponde a
// su contexto (decisión de Manuel, 2026-10-20). Deja claro que no es
// asesoramiento financiero.

export const metadata = metadataSeo("trabajo");

const CTA_TRABAJO = checkoutConTema("trabajo");
const CTA_DINERO = checkoutConTema("dinero");

export default async function TarotTrabajoYDinero() {
  const precioUYU = await getPrecioTarot();

  return (
    <PaginaSeo clave="trabajo" ctaHref={CTA_TRABAJO} precioUYU={precioUYU}>
      <HeroSeo
        precioUYU={precioUYU}
        eyebrow="Tarot de trabajo y dinero"
        titulo="Tarot para tu trabajo y tu relación con el dinero"
        cta={
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <CtaSeo href={CTA_TRABAJO} ubicacion="hero" tema="trabajo">Consultar sobre trabajo</CtaSeo>
            <CtaSeo href={CTA_DINERO} ubicacion="hero" tema="dinero">Consultar sobre dinero</CtaSeo>
          </div>
        }
      >
        <p>
          Un cambio de trabajo, un proyecto que no arranca, la sensación de que la plata nunca alcanza. Una lectura de 5
          cartas te ayuda a mirar la situación con perspectiva y a encontrar por dónde empezar.
        </p>
      </HeroSeo>

      <Seccion titulo="Trabajo y proyectos">
        <p>
          Sirve cuando estás pensando en cambiar de trabajo, cuando un proyecto propio se estancó o cuando sentís que no
          te reconocen lo que das. Así leen tus cartas una consulta laboral:
        </p>
        <PosicionesTarot
          lecturas={[
            "Cómo estás viviendo hoy tu trabajo o tu proyecto.",
            "Lo que traba el avance: falta de foco, cansancio, condiciones que no cambian.",
            "Lo que influye sin que lo veas: motivaciones, miedos o talentos que no estás usando.",
            "Un paso concreto para mover la situación.",
            "Hacia dónde va tu camino laboral si seguís por esta línea.",
          ]}
        />
        <div className="pt-2">
          <CtaSeo href={CTA_TRABAJO} ubicacion="trabajo" tema="trabajo" className="w-full sm:w-auto">Consultar sobre trabajo</CtaSeo>
        </div>
      </Seccion>

      <Seccion titulo="Dinero y recursos">
        <p>
          Una consulta sobre dinero no te va a decir en qué invertir, pero sí puede mostrarte tu relación con la plata:
          hábitos, bloqueos, miedos o creencias que se repiten y pesan en tus decisiones.
        </p>
        <Lista
          items={[
            "¿Qué está bloqueando que mi situación económica mejore?",
            "¿Qué tengo que mirar antes de asumir este gasto o este compromiso?",
            "¿Cómo puedo ordenar mi relación con el dinero?",
          ]}
        />
        <div className="pt-2">
          <CtaSeo href={CTA_DINERO} ubicacion="dinero" tema="dinero" className="w-full sm:w-auto">Consultar sobre dinero</CtaSeo>
        </div>
      </Seccion>

      <Seccion titulo="Lo que te llevás">
        <p>
          Además de la interpretación de cada carta, tu lectura cierra con un resumen (también en audio), un mensaje
          personal y <Destacado>3 claves prácticas</Destacado>: ideas concretas para llevar lo que apareció a tu semana.
        </p>
        <p>
          Es una herramienta para pensar mejor tu situación. No es asesoramiento financiero, laboral ni legal: para eso,
          lo indicado es consultar a un profesional.
        </p>
      </Seccion>

      <FaqSeo
        items={[
          {
            q: "¿Me va a decir si acepto una oferta de trabajo?",
            a: "No te da un sí o un no, pero te ayuda a ver qué te atrae, qué te frena y qué está en juego en esa decisión. Si lo que necesitás es elegir entre opciones, también podés elegir el tema «Decisión personal».",
          },
          {
            q: "¿Trabajo o dinero: cuál elijo?",
            a: "Si la duda es sobre tu empleo, tu carrera o un proyecto, elegí trabajo. Si es sobre ingresos, gastos o tu relación con la plata, elegí dinero. Podés afinar con tu pregunta.",
          },
        ]}
      />

      <CierreSeo titulo="Mirá tu situación con perspectiva" precioUYU={precioUYU} href={CTA_TRABAJO} tema="trabajo">
        Elegís el tema (podés cambiarlo a «Dinero y recursos» en el formulario), sumás tu pregunta si querés y en minutos
        recibís tu lectura.
      </CierreSeo>

      <NotaTransparencia />
    </PaginaSeo>
  );
}
