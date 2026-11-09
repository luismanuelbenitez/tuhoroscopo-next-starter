import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { REVALIDAR_MARKETING } from "@/lib/fetchSupabase";
import { metadataSeo } from "@/lib/seo/paginasSeo";
import { PaginaSeo } from "@/components/seo/PaginaSeo";
import {
  HeroSeo, Seccion, Lista, PosicionesTarot, FaqSeo, CierreSeo, NotaTransparencia, CtaSeo, checkoutConTema, AsiTeLlega, CtaIntermedio,
} from "@/components/seo/BloquesSeo";

// Pregenerada; precio y testimonios se releen cada 60 s (lib/fetchSupabase).
export const revalidate = 60;

// Intención: una duda sobre un vínculo (pareja, ex, alguien que empieza).
// Lo propio de esta página: cómo leen las 5 posiciones una consulta de amor,
// qué preguntas conviene hacer y qué no puede darte una lectura. CTA con el
// tema "amor" ya elegido en el checkout.

export const metadata = metadataSeo("amor");

const CTA = checkoutConTema("amor");

export default async function TarotAmor() {
  const precioUYU = await getPrecioTarot({ revalidar: REVALIDAR_MARKETING });

  return (
    <PaginaSeo clave="amor" ctaHref={CTA} precioUYU={precioUYU}>
      <HeroSeo
        precioUYU={precioUYU}
        eyebrow="Tarot del amor"
        titulo="Tarot del amor: claridad para tu vínculo"
        cta={<CtaSeo href={CTA} ubicacion="hero" tema="amor">Quiero mi lectura de amor →</CtaSeo>}
      >
        <p>
          Cuando una relación te tiene dando vueltas, una lectura de tarot puede ayudarte a ordenar lo que sentís y a
          mirar el vínculo desde otro lugar. No para que alguien decida por vos, sino para ver con más claridad.
        </p>
      </HeroSeo>

      {/* 2026-11-02: el producto a la vista antes del texto explicativo. */}
      <AsiTeLlega pie="Ejemplo de una lectura de amor" precioUYU={precioUYU} />

      <Seccion titulo="Cómo se lee una consulta de amor">
        <p>Tus 5 cartas recorren el vínculo en cinco momentos:</p>
        <PosicionesTarot
          lecturas={[
            "Cómo está hoy la relación, o tu manera de vivir el amor en este momento.",
            "Lo que tensa el vínculo: miedos, patrones, distancias o expectativas que no coinciden.",
            "Lo que se juega por debajo y no siempre se dice, en vos o en la dinámica entre los dos.",
            "Una actitud o un paso concreto que puede ayudarte a cuidar lo que querés.",
            "Hacia dónde tiende el vínculo si las cosas siguen como están.",
          ]}
        />
      </Seccion>

      <Seccion titulo="Preguntas que funcionan">
        <p>Las mejores preguntas te ponen a vos en el centro y dejan espacio para entender:</p>
        <Lista
          items={[
            "¿Qué necesito ver de esta relación en este momento?",
            "¿Qué está frenando que avancemos?",
            "¿Qué puedo hacer para sentirme más en paz con este vínculo?",
            "¿Es momento de dar el siguiente paso o de esperar?",
          ]}
        />
        <p>
          Preguntas como «¿qué piensa él de mí?» o «¿va a volver?» buscan certezas sobre otra persona. La lectura puede
          mostrarte la dinámica y lo que está en juego, pero las decisiones del otro no están escritas en las cartas.
        </p>
      </Seccion>

      <CtaIntermedio href={CTA} tema="amor">Hacer mi consulta de amor →</CtaIntermedio>

      <Seccion titulo="Para qué te sirve (y para qué no)">
        <p>
          Una lectura de amor es una herramienta de reflexión: te ayuda a nombrar lo que sentís, a ver patrones y a
          pensar tu próximo paso con más calma. Termina con 3 claves prácticas para llevar a tu día a día.
        </p>
        <p>
          No reemplaza una conversación honesta con la otra persona ni el acompañamiento de un profesional si estás
          atravesando un momento difícil.
        </p>
      </Seccion>

      <FaqSeo
        items={[
          {
            q: "¿Puedo consultar por alguien con quien recién empiezo?",
            a: "Sí. Elegís el tema «Amor y vínculos» y, si querés, escribís tu pregunta sobre ese vínculo. La lectura se enfoca en tu momento y en lo que está empezando.",
          },
          {
            q: "¿Y si la relación ya terminó?",
            a: "También. Una lectura puede ayudarte a entender qué dejó ese vínculo, qué te cuesta soltar y qué necesitás para seguir.",
          },
          {
            q: "¿La otra persona se entera?",
            a: "No. Tu consulta y tu lectura te llegan solo a vos, por WhatsApp y, si lo pedís, por email.",
          },
          {
            q: "¿Cómo pago?",
            a: "Con Mercado Pago: tarjeta de crédito, débito o los medios que te ofrezca al pagar. Es un pago único, sin suscripción ni cobros posteriores.",
          },
          {
            q: "¿Y si no me llega?",
            a: "Te llega en menos de 15 minutos desde que se confirma el pago. Si no la recibiste o no podés abrirla, escribinos a hola@tuoraculo.uy con el número de WhatsApp que usaste y te la reenviamos.",
          },
        ]}
      />

      <CierreSeo titulo="Mirá tu vínculo con más claridad" precioUYU={precioUYU} href={CTA} tema="amor">
        El tema «Amor y vínculos» ya queda elegido. Si querés, sumás tu pregunta y en minutos recibís tu lectura.
      </CierreSeo>

      <NotaTransparencia />
    </PaginaSeo>
  );
}
