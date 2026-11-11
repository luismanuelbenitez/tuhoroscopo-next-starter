import { GOLD, SERIF, CREMA } from "@/components/home/theme";

// Coincidencia anuncio ↔ página (2026-11-10, auditoría de Google Ads): todos
// los anuncios llevan a /tarot y prometen "tirada de tarot", "lectura de
// cartas", "tarot de amor", "Montevideo", "Uruguay" y "$690". Google mide la
// "experiencia en la página de destino" (salía por debajo del promedio) por si
// la página dice lo mismo que el anuncio; este bloque lo dice en texto real.
// Celular primero: texto ≥15 px sobre panel oscuro (regla de contraste).
export function ConsultaTarotUruguay({ precioUYU }: { precioUYU: number | null }) {
  return (
    <section aria-labelledby="consulta-tarot-uruguay" className="relative px-5 md:px-8 py-6 md:py-10 max-w-[760px] mx-auto">
      <div className="rounded-2xl px-5 py-6 md:px-8 md:py-7" style={{ background: "rgba(12,7,24,0.82)", border: "1px solid rgba(240,197,90,0.32)" }}>
        <p className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Tarot online en Uruguay</p>
        <h2 id="consulta-tarot-uruguay" className="mb-3" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.6rem, 4vw, 2.1rem)", lineHeight: 1.15, color: CREMA }}>
          Tu consulta de tarot, desde Montevideo o cualquier parte del país
        </h2>
        <p className="text-[15.5px] md:text-[16px] leading-relaxed text-white/90">
          Es una tirada de tarot de 5 cartas para tu pregunta: tarot de amor y pareja, de trabajo y dinero o para una decisión.
          La lectura de cartas es online: la pedís desde el celular y te llega por WhatsApp en minutos, con resumen en audio y PDF.
        </p>
        <p className="mt-3 text-[15.5px] md:text-[16px] font-semibold" style={{ color: CREMA }}>
          {precioUYU !== null ? `$U ${precioUYU}, pago único` : "Pago único"} con Mercado Pago. Sin suscripción.
        </p>
      </div>
    </section>
  );
}
