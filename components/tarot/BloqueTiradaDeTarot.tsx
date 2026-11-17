import { GOLD, SERIF, CREMA } from "@/components/home/theme";
import { pesosUY } from "@/lib/ctaTarot";
import { POSICIONES } from "@/components/seo/BloquesSeo";

// Bloque propio de /tarot/tirada-de-tarot (2026-11-17, regla G14 "una página
// por búsqueda"): explica QUÉ es la tirada que recibe quien buscó "tirada de
// tarot" — las 5 posiciones, sobre qué temas y cómo llega — con la frase en
// texto real. Ocupa el lugar del bloque "Tarot online en Uruguay" de /tarot y
// conserva lo que promete el anuncio (Montevideo, Uruguay, precio, pago único).
// Celular primero: texto ≥15 px sobre panel oscuro (regla de contraste).
const QUE_MIRA = [
  "Cómo estás hoy frente a tu pregunta.",
  "Lo que se interpone o te cuesta ahora.",
  "Lo que está en juego y no estás mirando.",
  "Un paso o una actitud concreta para tu momento.",
  "Hacia dónde tiende la situación si sigue así.",
];

const ROMANOS = ["I", "II", "III", "IV", "V"];

export function BloqueTiradaDeTarot({ precioUYU }: { precioUYU: number | null }) {
  return (
    <section aria-labelledby="tirada-de-tarot-5-cartas" className="relative px-5 md:px-8 py-6 md:py-10 max-w-[760px] mx-auto">
      <div className="rounded-2xl px-5 py-6 md:px-8 md:py-7" style={{ background: "rgba(12,7,24,0.82)", border: "1px solid rgba(240,197,90,0.32)" }}>
        <p className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Cómo es tu tirada de tarot</p>
        <h2 id="tirada-de-tarot-5-cartas" className="mb-3" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.6rem, 4vw, 2.1rem)", lineHeight: 1.15, color: CREMA }}>
          Una tirada de tarot de 5 cartas, leída para tu pregunta
        </h2>
        <p className="text-[15.5px] md:text-[16px] leading-relaxed text-white/90">
          En tu tirada de tarot cada carta ocupa un lugar y responde a una parte de tu consulta.
          Así, la lectura de cartas no queda en frases sueltas: arma un recorrido completo, de tu momento actual a lo que viene.
        </p>

        <ol className="mt-5 space-y-3.5">
          {POSICIONES.map((pos, i) => (
            <li key={pos} className="flex gap-3.5">
              <span
                aria-hidden="true"
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold"
                style={{ fontFamily: SERIF, color: GOLD, border: "1px solid rgba(240,197,90,0.55)", background: "rgba(240,197,90,0.06)" }}
              >
                {ROMANOS[i]}
              </span>
              <span className="text-[15.5px] leading-snug">
                <span className="block font-semibold" style={{ color: CREMA }}>{pos}</span>
                <span className="block text-white/80">{QUE_MIRA[i]}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-[15.5px] md:text-[16px] leading-relaxed text-white/90">
          Podés hacer tu tirada de tarot sobre amor y pareja, trabajo y dinero, una decisión o tu momento en general.
          Es online: la pedís desde el celular, desde Montevideo o cualquier parte de Uruguay, y te llega por WhatsApp en minutos,
          con resumen en audio y PDF para guardar.
        </p>
        <p className="mt-3 text-[15.5px] md:text-[16px] font-semibold" style={{ color: CREMA }}>
          {precioUYU !== null ? `${pesosUY(precioUYU)}, pago único` : "Pago único"} con Mercado Pago. Sin suscripción.
        </p>
      </div>
    </section>
  );
}
