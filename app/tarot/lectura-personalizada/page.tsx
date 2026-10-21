import Link from "next/link";
import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { getTestimoniosAutorizados } from "@/lib/seo/testimoniosAutorizados";
import { metadataSeo } from "@/lib/seo/paginasSeo";
import { PaginaSeo } from "@/components/seo/PaginaSeo";
import {
  HeroSeo, Seccion, Lista, Destacado, PosicionesTarot, FaqSeo, CierreSeo, TestimoniosSeo, NotaTransparencia,
  CtaSeo, CHECKOUT,
} from "@/components/seo/BloquesSeo";

// Intención (re-enfocada 2026-10-21, Paquete SEO 1): entender QUÉ incluye una
// lectura personalizada y en qué se diferencia de una tirada gratis. La
// intención de compra principal ("tarot online personalizado") es de /tarot:
// esta página la explica en detalle y enlaza hacia allá.

export const metadata = metadataSeo("personalizada");

export default async function LecturaPersonalizada() {
  const [precioUYU, testimonios] = await Promise.all([getPrecioTarot(), getTestimoniosAutorizados()]);

  return (
    <PaginaSeo clave="personalizada" precioUYU={precioUYU} ctaHref={CHECKOUT}>
      <HeroSeo
        eyebrow="Lectura de tarot personalizada"
        titulo="Qué incluye una lectura de tarot personalizada"
        cta={<CtaSeo href={CHECKOUT} ubicacion="hero">Quiero mi lectura personalizada</CtaSeo>}
      >
        <p>
          Una lectura personalizada parte de lo que te está pasando a vos: tu tema, tu pregunta, tu momento. Tus 5 cartas
          se interpretan en ese contexto, no como un texto general que podría leer cualquiera. Acá te contamos qué
          recibís y en qué se diferencia de una tirada gratis.
        </p>
      </HeroSeo>

      <Seccion titulo="Qué la hace personal">
        <Lista
          items={[
            <><Destacado>Tu consulta</Destacado>: elegís el área (amor, trabajo, dinero, salud, una decisión o tu situación general) y, si querés, escribís tu pregunta con tus palabras.</>,
            <><Destacado>Tus cartas</Destacado>: se sortean 5 cartas para vos, y cada una puede salir derecha o invertida, lo que cambia su lectura.</>,
            <><Destacado>Tu nombre y tu fecha de nacimiento</Destacado>: la lectura te habla a vos, en segunda persona y con tu nombre.</>,
            <><Destacado>Un hilo propio</Destacado>: las cartas no se leen sueltas; el resumen las conecta entre sí y con lo que preguntaste.</>,
          ]}
        />
      </Seccion>

      <Seccion titulo="Cómo se ordenan tus 5 cartas">
        <p>Cada carta ocupa una posición con un sentido propio. Juntas arman el recorrido de tu consulta:</p>
        <PosicionesTarot
          lecturas={[
            "Dónde estás hoy respecto de lo que preguntás.",
            "Lo que puede estar frenando o complicando el avance.",
            "Lo que influye desde un lugar menos evidente y vale la pena mirar.",
            "Una orientación práctica para tu momento.",
            "Hacia dónde se mueve la energía si seguís por este camino.",
          ]}
        />
      </Seccion>

      <Seccion titulo="Todo lo que recibís">
        <Lista
          items={[
            <><Destacado>Interpretación carta por carta</Destacado>, según su posición y su orientación.</>,
            <><Destacado>Resumen de tu lectura</Destacado>: la historia que cuentan tus cartas juntas, también en audio para escucharlo.</>,
            <><Destacado>Mensaje personal</Destacado>: una reflexión final enfocada en tu consulta.</>,
            <><Destacado>3 claves para avanzar</Destacado>: ideas concretas para llevar la lectura a tu día a día.</>,
            <><Destacado>Tu lectura online</Destacado>, pensada para el celular, disponible 30 días, y un <Destacado>PDF de 3 páginas</Destacado> que es tuyo para siempre.</>,
          ]}
        />
        <p>Te llega por WhatsApp en menos de 15 minutos y, si lo pedís, también por email.</p>
        <p>
          Podés ver la experiencia completa en{" "}
          <Link href="/tarot" className="underline underline-offset-2" style={{ color: "rgba(240,197,90,0.95)" }}>
            nuestro Tarot online personalizado
          </Link>
          .
        </p>
      </Seccion>

      <Seccion titulo="¿Y el tarot gratis?">
        <p>
          En internet hay tiradas gratuitas que muestran el significado general de una carta. Sirven para curiosear o
          aprender qué representa cada arcano, y está bien usarlas así.
        </p>
        <p>
          Una lectura personalizada es otra cosa: no te da la definición de una carta, sino lo que esas 5 cartas dicen
          juntas sobre tu pregunta, con un resumen, un mensaje y claves para tu situación. Es la diferencia entre leer un
          diccionario y recibir una lectura de tu momento.
        </p>
      </Seccion>

      <TestimoniosSeo testimonios={testimonios} />

      <FaqSeo
        items={[
          {
            q: "¿Tengo que escribir una pregunta?",
            a: "Es opcional. Con elegir el tema alcanza; si escribís tu pregunta, la lectura se enfoca todavía más en lo que te importa.",
          },
          {
            q: "¿Quién interpreta mis cartas?",
            a: "La interpretación se genera con inteligencia artificial a partir de tus cartas, sus posiciones y tu consulta. Por eso podés tenerla en minutos, a cualquier hora.",
          },
          {
            q: "¿Puedo volver a leerla después?",
            a: "Sí. La lectura online queda disponible 30 días desde tu link, y el PDF lo podés guardar para siempre.",
          },
        ]}
      />

      <CierreSeo titulo="Tu lectura, para tu momento" precioUYU={precioUYU} href={CHECKOUT}>
        Elegís tu tema, sumás tu pregunta si querés y recibís tus 5 cartas interpretadas para vos.
      </CierreSeo>

      <NotaTransparencia />
    </PaginaSeo>
  );
}
