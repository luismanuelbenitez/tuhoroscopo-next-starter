"use client";

import { BookOpen, Network, Fingerprint, Feather, type LucideIcon } from "lucide-react";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";
import { fluido } from "@/lib/imagen";

// "¿Quién hace la lectura?" contado con fuerza pero sin revelar el cómo:
// plataforma propia + motor narrativo, no "una respuesta automática".
// Solo afirmaciones verificables del producto (5 posiciones, tema,
// consulta, lectura en conjunto); nada de cifras ni controles que no existan.
const PILARES: { icon: LucideIcon; t: string; d: string }[] = [
  {
    icon: BookOpen,
    t: "Un mapa propio del tarot",
    d: "Cada carta, su simbología y lo que significa según la posición en que aparece: tu momento actual, el desafío, lo que no estás viendo, el consejo y lo que viene.",
  },
  {
    icon: Network,
    t: "Las cartas se leen juntas",
    d: "No son cinco definiciones sueltas. El motor busca cómo dialogan entre sí y qué historia cuentan en conjunto.",
  },
  {
    icon: Fingerprint,
    t: "Escrita para tu consulta",
    d: "El tema que elegís y tus palabras orientan cada interpretación. Por eso las mismas cartas no le dicen lo mismo a todos.",
  },
  {
    icon: Feather,
    t: "Tradición en lenguaje claro",
    d: "Respeta el simbolismo clásico del tarot y lo lleva a un relato cálido y práctico, con claves concretas para avanzar.",
  },
];

export function MotorNarrativo() {
  return (
    <section className="relative px-5 md:px-8 py-14 max-w-[960px] mx-auto">
      <div className="text-center max-w-[640px] mx-auto mb-10">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
          Detrás de tu lectura
        </p>
        <h2
          className="mb-4"
          style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.8rem, 4vw, 2.6rem)", lineHeight: 1.12, color: CREMA }}
        >
          Tu lectura no se improvisa: <span className="whitespace-nowrap" style={{ color: GOLD }}>se construye</span>
        </h2>
        <p className="text-white/75 text-[14px] md:text-[15px] leading-relaxed">
          Tu Oráculo es una plataforma propia que une la tradición del tarot con tecnología creada
          para interpretar. Cada tirada pasa por nuestro <strong className="text-white">motor narrativo</strong>,
          que cruza tus cartas, sus posiciones, el tema que elegiste y tu consulta, y los convierte
          en un relato coherente, escrito para vos.
        </p>
      </div>

      {/* motor-cartas.webp 1536×1024; recorte 2:1 (4:3 en mobile) centrado en las cartas */}
      <div
        className="relative overflow-hidden rounded-2xl mb-6 aspect-[4/3] md:aspect-[2/1]"
        style={{ border: "1px solid rgba(240,197,90,0.28)", boxShadow: "0 12px 36px rgba(0,0,0,0.40)" }}
      >
        <img
          {...fluido("/img/home2/motor-cartas.webp", 1536, 1024, "(max-width: 767px) 92vw, 900px")}
          alt="Cinco cartas de Tu Oráculo boca abajo sobre terciopelo, entre velas"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 51%" }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {PILARES.map(({ icon: Icono, t, d }) => (
          <div
            key={t}
            className="flex gap-4 rounded-2xl p-5"
            style={{
              background: "rgba(16,8,30,0.78)",
              border: "1px solid rgba(240,197,90,0.28)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,235,170,0.06)",
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{ width: 44, height: 44, border: "1px solid rgba(240,197,90,0.55)", background: "rgba(240,197,90,0.06)" }}
            >
              <Icono size={20} aria-hidden="true" style={{ color: GOLD }} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold mb-1" style={{ color: CREMA }}>{t}</p>
              <p className="text-[13px] text-white/70 leading-relaxed">{d}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-[13px] text-white/55 mt-8 italic" style={{ fontFamily: SERIF, fontSize: 17 }}>
        No es una respuesta automática: es un oráculo pensado, de punta a punta, por Tu Oráculo.
      </p>
    </section>
  );
}
