import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { metadataSeo } from "@/lib/seo/paginasSeo";
import { PaginaSeo } from "@/components/seo/PaginaSeo";
import {
  HeroSeo, Seccion, Lista, Destacado, PosicionesTarot, FaqSeo, CierreSeo, NotaTransparencia, CtaSeo, checkoutConTema,
} from "@/components/seo/BloquesSeo";

// Intención: alguien que tiene que elegir entre caminos (incluye a quien
// busca "tarot sí o no"). Lo propio: por qué una lectura aporta más que un sí
// o un no, cómo formular la pregunta y cómo usar las claves. CTA con el tema
// "decision" ya elegido.

export const metadata = metadataSeo("decisiones");

const CTA = checkoutConTema("decision");

export default async function TarotDecisiones() {
  const precioUYU = await getPrecioTarot();

  return (
    <PaginaSeo clave="decisiones" ctaHref={CTA}>
      <HeroSeo
        eyebrow="Tarot para tomar una decisión"
        titulo="Tarot para tomar una decisión"
        cta={<CtaSeo href={CTA} ubicacion="hero" tema="decision">Consultar sobre mi decisión</CtaSeo>}
      >
        <p>
          Cuando tenés que elegir y no terminás de decidirte, una lectura de tarot te ayuda a ver qué está en juego en
          cada camino. La decisión sigue siendo tuya; la lectura te da un lugar para pensarla con más claridad.
        </p>
      </HeroSeo>

      <Seccion titulo="Más que un sí o un no">
        <p>
          Las tiradas de «sí o no» dan una respuesta rápida, pero no te dicen por qué. Cuando una decisión importa, lo
          útil es entender qué te empuja, qué te frena y qué no estás viendo. Por eso tu lectura usa 5 cartas:
        </p>
        <PosicionesTarot
          lecturas={[
            "Desde dónde estás decidiendo hoy: tu estado y tus motivos.",
            "Lo que hace difícil elegir: dudas, presiones o miedos.",
            "Lo que pesa sin que lo notes y puede cambiar cómo ves las opciones.",
            "Una orientación concreta para avanzar con la decisión.",
            "Hacia dónde tiende la situación si seguís por el camino actual.",
          ]}
        />
      </Seccion>

      <Seccion titulo="Cómo formular tu pregunta">
        <p>Una buena pregunta te deja el poder de decisión a vos. Algunos ejemplos:</p>
        <Lista
          items={[
            "¿Qué necesito tener en cuenta antes de decidir si me mudo?",
            "¿Qué me está frenando para dar este paso?",
            "¿Qué camino está más alineado con lo que quiero para mí ahora?",
          ]}
        />
        <p>
          Si tenés dos opciones concretas, podés nombrarlas en tu pregunta: «¿Qué tengo que ver para elegir entre
          quedarme en mi trabajo o empezar mi proyecto?».
        </p>
      </Seccion>

      <Seccion titulo="Después de la lectura">
        <p>
          Tu lectura cierra con un resumen (también en audio), un mensaje personal y <Destacado>3 claves prácticas</Destacado>.
          Usalas como punto de partida: anotá lo que te resonó, mirá qué clave podés aplicar esta semana y date tiempo
          antes de decidir.
        </p>
        <p>
          Para decisiones de salud, legales o financieras, la lectura no reemplaza el consejo de un profesional.
        </p>
      </Seccion>

      <FaqSeo
        items={[
          {
            q: "¿Las cartas me van a decir qué hacer?",
            a: "No deciden por vos. Te muestran lo que está en juego y te dan una orientación; la elección y sus razones siguen siendo tuyas.",
          },
          {
            q: "¿Sirve si mi decisión es sobre amor o trabajo?",
            a: "Sí. Podés elegir el tema «Decisión personal» o, si preferís, el tema específico (amor, trabajo, dinero) y escribir tu decisión en la pregunta.",
          },
        ]}
      />

      <CierreSeo titulo="Pensá tu decisión con más claridad" precioUYU={precioUYU} href={CTA} tema="decision">
        El tema «Decisión personal» ya queda elegido. Escribí tu pregunta y en minutos recibís tu lectura.
      </CierreSeo>

      <NotaTransparencia />
    </PaginaSeo>
  );
}
