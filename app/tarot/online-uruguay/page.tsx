import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { getTestimoniosAutorizados } from "@/lib/seo/testimoniosAutorizados";
import { metadataSeo } from "@/lib/seo/paginasSeo";
import { PaginaSeo } from "@/components/seo/PaginaSeo";
import {
  HeroSeo, Seccion, Lista, Destacado, FaqSeo, CierreSeo, TestimoniosSeo, NotaTransparencia,
  CtaSeo, CHECKOUT, precioTexto,
} from "@/components/seo/BloquesSeo";

// Intención: alguien en Uruguay que busca tarot online y está comparando
// opciones. Prioriza lo práctico y local: cómo funciona a distancia, pago en
// pesos, entrega, privacidad, qué esperar.

export const metadata = metadataSeo("uruguay");

export default async function TarotOnlineUruguay() {
  const [precioUYU, testimonios] = await Promise.all([getPrecioTarot(), getTestimoniosAutorizados()]);
  const precio = precioTexto(precioUYU);

  return (
    <PaginaSeo clave="uruguay" precioUYU={precioUYU} ctaHref={CHECKOUT}>
      <HeroSeo
        eyebrow="Tarot online · Uruguay"
        titulo="Tarot online en Uruguay, desde tu celular"
        cta={<CtaSeo href={CHECKOUT} ubicacion="hero">Hacer mi consulta</CtaSeo>}
      >
        <p>
          Hacés tu consulta en un par de minutos, pagás en pesos con Mercado Pago y en menos de 15 minutos te llega
          tu lectura de 5 cartas por WhatsApp. Sin turnos, sin videollamadas y sin moverte de tu casa.
        </p>
      </HeroSeo>

      <Seccion titulo="Cómo funciona un tarot online">
        <p>
          No hace falta coordinar con nadie. Completás un formulario corto con tu nombre, tu WhatsApp, tu fecha de
          nacimiento y el tema que querés mirar: amor, trabajo, dinero, salud, una decisión o tu situación general.
          Si querés, sumás una pregunta puntual.
        </p>
        <p>
          Después de pagar, se sortean tus 5 cartas y se interpretan para tu consulta. Lo recibís como un link personal a
          tu lectura online, pensada para leer en el celular, y un PDF de 3 páginas para guardar.
        </p>
      </Seccion>

      <Seccion titulo="Pensado para Uruguay">
        <Lista
          items={[
            <>
              <Destacado>Precio en pesos uruguayos</Destacado>
              {precio ? `: ${precio}, un solo pago.` : ", un solo pago."} Sin suscripción y sin cargos futuros.
            </>,
            <>
              <Destacado>Pago con Mercado Pago</Destacado>: tarjeta, saldo o transferencia. Tus datos bancarios no pasan por
              nuestros servidores.
            </>,
            <>
              <Destacado>Entrega por WhatsApp</Destacado>, el canal que ya usás todos los días, y también por email si lo
              pedís.
            </>,
            <>
              <Destacado>En español rioplatense</Destacado>, con un lenguaje cercano y claro, sin tecnicismos esotéricos.
            </>,
            <>
              <Destacado>Atención desde acá</Destacado>: si algo no te llega, escribís a hola@tuoraculo.uy y lo resolvemos.
            </>,
          ]}
        />
      </Seccion>

      <Seccion titulo="Qué te llega exactamente">
        <p>
          Una lectura completa, no una frase suelta: la interpretación de cada una de tus 5 cartas según su posición, un
          resumen que las une (con versión en audio para escucharlo), un mensaje personal enfocado en tu consulta y 3
          claves prácticas para llevar lo que apareció a tu día a día.
        </p>
        <p>
          La lectura online queda disponible 30 días desde tu link. El PDF es tuyo para siempre.
        </p>
      </Seccion>

      <Seccion titulo="Tu consulta queda entre vos y tus cartas">
        <p>
          Nadie más ve tu pregunta ni tu lectura: te llega directo a tu WhatsApp y a tu email. No pedimos explicaciones
          ni compartimos lo que consultás. Tu lectura se abre con un link personal que solo tenés vos.
        </p>
      </Seccion>

      <TestimoniosSeo testimonios={testimonios} />

      <FaqSeo
        items={[
          {
            q: "¿Necesito estar en Uruguay para hacer la consulta?",
            a: "No. Todo es online y te llega por WhatsApp o email. El precio está en pesos uruguayos y el pago se hace con Mercado Pago.",
          },
          {
            q: "¿Hablo con una tarotista?",
            a: "No es una sesión en vivo. La interpretación de tus cartas se genera con inteligencia artificial a partir de tu consulta, y te llega lista para leer y escuchar cuando quieras.",
          },
          {
            q: "¿Cuánto tarda en llegar?",
            a: "Menos de 15 minutos desde que se confirma el pago. Si pasado ese tiempo no la recibiste, escribinos a hola@tuoraculo.uy y te la reenviamos.",
          },
          {
            q: "¿Es una suscripción?",
            a: "No. Es un pago único por una lectura. No hay renovaciones ni cargos automáticos.",
          },
        ]}
      />

      <CierreSeo titulo="Tu lectura, en tu WhatsApp" precioUYU={precioUYU} href={CHECKOUT}>
        Elegís el tema, pagás con Mercado Pago y en minutos tenés tus 5 cartas interpretadas para vos.
      </CierreSeo>

      <NotaTransparencia />
    </PaginaSeo>
  );
}
