import { urlOptimizada } from "@/lib/imagen";
import { FondoLectura, FONDO_PAGINA, GOLD, CREMA } from "@/components/lectura/vista/Base";
import { CAB } from "@/components/lectura/vista/LecturaVista";

// Pantalla de espera de /lectura (2026-10-30, rendimiento en el celular): la
// lectura tarda unos segundos en resolverse en el servidor y antes se veía la
// página en blanco. Se muestra al instante con la escena del cabezal (mismas
// URLs optimizadas que usa LecturaVista: cuando llega la lectura, la imagen
// ya está en caché). <picture> para que el celular baje solo la suya.
export default function CargandoLectura() {
  return (
    <main className="min-h-screen relative overflow-hidden" style={{ background: FONDO_PAGINA }}>
      <FondoLectura />
      <picture>
        <source media="(min-width: 768px)" srcSet={urlOptimizada(`${CAB}/escenario-hero-desktop.webp`, 1920)} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlOptimizada(`${CAB}/escenario-hero-mobile.webp`, 828)}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "auto", maskImage: "linear-gradient(180deg, #000 70%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, #000 70%, transparent 100%)" }}
        />
      </picture>
      <div className="relative flex flex-col items-center pt-6 px-6 text-center">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo/logo-isotipo-96.webp" alt="" aria-hidden="true" width={38} height={38} style={{ width: 38, height: 38 }} />
          <span className="text-[17px] font-bold uppercase leading-none" style={{ letterSpacing: "0.08em", color: GOLD, fontFamily: "var(--font-cormorant), Georgia, serif" }}>
            Tu Oráculo
          </span>
        </div>
        <div className="mt-[38vh] rounded-2xl px-6 py-4" style={{ background: "rgba(8,4,18,0.62)", backdropFilter: "blur(4px)" }} role="status" aria-live="polite">
          <span aria-hidden="true" className="mx-auto mb-3 block h-7 w-7 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(240,197,90,0.25)", borderTopColor: GOLD }} />
          <p className="text-[17px] font-semibold" style={{ color: CREMA, fontFamily: "var(--font-cormorant), Georgia, serif" }}>Preparando tu lectura…</p>
        </div>
      </div>
    </main>
  );
}
