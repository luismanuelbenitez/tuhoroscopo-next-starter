import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";

// Dudas antes de comprar, junto al CTA final (Paquete SEO 2, 2026-10-21).
// Solo las 4 objeciones reales que frenan la compra; el resto vive en /faq.
// Respuestas alineadas con /faq, Términos y Política de privacidad — sin
// prometer nada que el producto no haga. <details> nativo: sin JS y con el
// texto siempre en el HTML. Sin imágenes (cero peso extra).
const DUDAS = [
  {
    q: "¿La lectura la hace una IA o un tarotista?",
    a: "Las cartas se sortean para vos y la interpretación la genera inteligencia artificial, aplicando la simbología del tarot clásico a tu nombre, tu tema y tu pregunta. No hay un tarotista humano detrás, y no es un texto genérico: cada tirada de tarot se escribe para tu consulta.",
  },
  {
    q: "¿Mi consulta es privada?",
    a: "Sí. Tu lectura te llega solo a vos, por WhatsApp y/o email. Tus datos se usan únicamente para generar y entregarte la lectura: no se publican, no se venden ni se comparten con fines publicitarios.",
    politica: true,
  },
  {
    q: "¿Cuánto tarda en llegar?",
    a: "Menos de 15 minutos desde que se confirma tu pago. Si pasado ese tiempo no la recibiste, escribinos a hola@tuoraculo.uy y te la enviamos.",
  },
  {
    q: "¿Qué puede y qué no puede hacer el Tarot?",
    a: "Te ofrece una mirada simbólica sobre tu momento, para pensarlo con más claridad y ver opciones que quizás no estabas mirando. No predice el futuro ni reemplaza el consejo de un profesional (de salud, legal, financiero o psicológico).",
  },
];

export function DudasTarot() {
  return (
    <section aria-labelledby="dudas-tarot" className="relative px-5 md:px-8 pt-10 pb-4 md:pt-12 max-w-[680px] mx-auto">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2 text-center" style={{ color: GOLD }}>Antes de pedir tu lectura</p>
      <h2
        id="dudas-tarot"
        className="mb-6 text-center"
        style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.7rem, 4vw, 2.3rem)", lineHeight: 1.2, color: CREMA }}
      >
        Dudas frecuentes
      </h2>
      <div className="flex flex-col gap-2.5">
        {DUDAS.map((d) => (
          <details
            key={d.q}
            className="group rounded-2xl overflow-hidden"
            style={{ background: "rgba(12,7,24,0.72)", border: "1px solid rgba(240,197,90,0.28)" }}
          >
            <summary className="flex items-center justify-between gap-4 cursor-pointer select-none px-5 py-4 transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden" style={{ listStyle: "none" }}>
              <h3 className="m-0 text-[15px] font-semibold leading-snug" style={{ color: CREMA }}>{d.q}</h3>
              <ChevronDown size={15} aria-hidden="true" className="shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: GOLD }} />
            </summary>
            <p className="px-5 pb-4 text-[14px] text-white/65 leading-relaxed">
              {d.a}
              {d.politica && (
                <>
                  {" "}
                  <Link href="/politica-de-privacidad" className="underline underline-offset-2 hover:text-white/85" style={{ color: "rgba(240,197,90,0.9)" }}>
                    Política de privacidad
                  </Link>
                  .
                </>
              )}
            </p>
          </details>
        ))}
      </div>
      <p className="mt-5 text-center text-[13.5px] text-white/55">
        ¿Otra duda?{" "}
        <Link href="/faq" className="underline underline-offset-2 hover:text-white/85" style={{ color: "rgba(240,197,90,0.9)" }}>
          Ver todas las preguntas frecuentes
        </Link>
      </p>
    </section>
  );
}
