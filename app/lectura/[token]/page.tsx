import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { resolverLecturaPublica } from "@/lib/tarotLecturaPublica";
import { AmbientAudioControls } from "@/components/lectura/AmbientAudio";
import { Reveal } from "@/components/lectura/Reveal";
import {
  CartaEnMarco, Divisor, FONDO_TERCIOPELO, GOLD as GOLD_TINTA, IMG, INK, PanelPergamino, PlacaTitulo,
} from "@/components/lectura/Marcos";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif-editorial",
});

export function generateMetadata(): Metadata {
  return {
    title: "Tu Tirada — Tu Oráculo",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

const POSICIONES: Record<number, string> = {
  1: "Tu momento actual",
  2: "El desafío",
  3: "Lo que no estás viendo",
  4: "Consejo para avanzar",
  5: "Lo que viene",
};

const GOLD = "#FFCE4D";
const SERIF_FONT = "var(--font-serif-editorial), serif";

// Fondo compartido: terciopelo repetible (public/img/lectura) + halo dorado
// superior — mismo lenguaje visual que el cabezal y el PDF. "El fondo
// acompaña, nunca compite". position:fixed + pointer-events-none.
function FondoCelestial() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={FONDO_TERCIOPELO} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 90% 45% at 50% 0%, rgba(240,197,90,0.10), transparent)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 120% 90% at 50% 50%, transparent 55%, rgba(6,3,14,0.55))" }}
      />
    </div>
  );
}

// Tamaño del nombre dentro del pergamino según su largo (el pergamino tiene
// un ancho fijo de zona de texto).
function tamanoNombre(nombre: string): number {
  const n = nombre.length;
  if (n <= 12) return 32;
  if (n <= 18) return 26;
  if (n <= 24) return 21;
  return 17;
}

function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${serif.variable} min-h-screen flex items-center justify-center px-6 py-16 text-center relative`} style={{ background: "#140a24" }}>
      <FondoCelestial />
      <div className="max-w-sm relative">{children}</div>
    </main>
  );
}

function ExpiradoView() {
  return (
    <ErrorShell>
      <p className="text-xs tracking-[0.25em] uppercase mb-6" style={{ color: GOLD }}>
        Tu Oráculo
      </p>
      <h1 className="text-2xl font-semibold text-[#F0F1F5] mb-4" style={{ fontFamily: SERIF_FONT }}>
        Este acceso online expiró
      </h1>
      <p className="text-sm text-[#c9c4d6] leading-relaxed">
        El acceso web a esta tirada estuvo disponible durante 30 días y ya no está activo.
        Si guardaste el PDF, tu lectura sigue disponible ahí para siempre.
      </p>
    </ErrorShell>
  );
}

function NoEncontradoView() {
  return (
    <ErrorShell>
      <p className="text-xs tracking-[0.25em] uppercase mb-6" style={{ color: GOLD }}>
        Tu Oráculo
      </p>
      <h1 className="text-2xl font-semibold text-[#F0F1F5] mb-4" style={{ fontFamily: SERIF_FONT }}>
        No encontramos esta tirada
      </h1>
      <p className="text-sm text-[#c9c4d6] leading-relaxed">
        Revisá que el enlace esté completo, tal como lo recibiste por WhatsApp.
      </p>
    </ErrorShell>
  );
}

export default async function LecturaPage({ params }: { params: { token: string } }) {
  const resultado = await resolverLecturaPublica(params.token);

  if (!resultado.ok) {
    if (resultado.motivo === "expirado") return <ExpiradoView />;
    return <NoEncontradoView />;
  }

  const nombreCompleto = resultado.nombre?.trim() ?? "";
  const primerNombre = nombreCompleto.split(" ")[0] ?? "";

  return (
    <main className={`${serif.variable} min-h-screen text-[#F0F1F5] relative`} style={{ background: "#140a24" }}>
      <FondoCelestial />

      <div className="relative max-w-md mx-auto px-4 pb-10">
        {/* Portada: marca + pergamino con el nombre (texto HTML sobre la imagen) */}
        <header className="pt-5 pb-6 text-center relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG}/sol.png`} alt="" aria-hidden="true" width={72} height={72} className="absolute left-0 top-3" style={{ width: 72, height: 72 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG}/luna.png`} alt="" aria-hidden="true" width={72} height={72} className="absolute right-0 top-3" style={{ width: 72, height: 72 }} />

          <div className="flex justify-center pt-2 px-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/marca-isotipo-dorada.svg`} alt="Tu Oráculo" width={190} height={25} style={{ width: 190, height: "auto" }} />
          </div>

          <div className="relative mx-auto mt-5" style={{ width: "100%", maxWidth: 360 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/pergamino-titulo.png`} alt="" aria-hidden="true" width={512} height={189} style={{ width: "100%", height: "auto", display: "block" }} />
            <h1
              className="absolute inset-0 flex items-center justify-center text-center font-bold px-[17%] leading-tight"
              style={{ fontFamily: SERIF_FONT, color: INK, fontSize: tamanoNombre(nombreCompleto || primerNombre) }}
            >
              {nombreCompleto || primerNombre}
            </h1>
          </div>
          <p className="mt-3 text-[12px] tracking-[0.3em] uppercase" style={{ color: GOLD_TINTA }}>
            Tu tirada
          </p>
        </header>

        {/* Pregunta + audio ambiental */}
        <section className="text-center mb-6 px-1">
          {resultado.pregunta && (
            <div className="mb-6">
              <p className="text-[11px] tracking-[0.25em] uppercase mb-2.5" style={{ color: GOLD, opacity: 0.9 }}>
                Tu pregunta
              </p>
              <p
                className="text-[16px] text-[#d9d3e6] italic leading-relaxed max-w-[300px] mx-auto"
                style={{ fontFamily: SERIF_FONT }}
              >
                &ldquo;{resultado.pregunta}&rdquo;
              </p>
            </div>
          )}
          <AmbientAudioControls />
        </section>

        {/* Tira de las 5 cartas: índice tocable */}
        <nav aria-label="Tus cartas" className="mb-2">
          <ul className="flex justify-between gap-2 px-1">
            {resultado.cartas.map((c) => (
              <li key={`nav-${c.posicion}`} className="flex-1 text-center">
                <a href={`#carta-${c.posicion}`} className="block py-1">
                  {c.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imagen_url}
                      alt={c.nombre_carta}
                      width={60}
                      height={90}
                      loading="eager"
                      className={`mx-auto rounded-[3px] ${c.orientacion === "invertida" ? "rotate-180" : ""}`}
                      style={{ width: "100%", maxWidth: 58, height: "auto", aspectRatio: "2 / 3", objectFit: "cover", border: `1.5px solid ${GOLD_TINTA}` }}
                    />
                  ) : (
                    <div className="mx-auto rounded-[3px]" style={{ width: 58, aspectRatio: "2 / 3", border: `1.5px solid ${GOLD_TINTA}` }} />
                  )}
                  <span
                    className="mx-auto mt-1.5 flex items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ width: 26, height: 26, background: "#2a1424", border: `1.5px solid ${GOLD_TINTA}`, color: "#F3DFA5", fontFamily: SERIF_FONT, fontVariantNumeric: "lining-nums", lineHeight: 1 }}
                  >
                    {c.posicion}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Divisor />

        {/* Las 5 cartas, con ritmo entre posiciones */}
        <section className="mb-2">
          {resultado.cartas.flatMap((c, idx) => {
            const nodos: React.ReactNode[] = [
              <Reveal key={`carta-${c.posicion}`}>
                <article
                  id={`carta-${c.posicion}`}
                  className="rounded-2xl px-4 pt-6 pb-7 scroll-mt-4"
                  style={{ background: "rgba(10,6,20,0.55)", border: "1px solid rgba(240,197,90,0.14)" }}
                >
                  <PlacaTitulo className="mb-5">
                    {POSICIONES[c.posicion] ?? `Carta ${c.posicion}`}
                  </PlacaTitulo>

                  <CartaEnMarco
                    src={c.imagen_url ?? null}
                    alt={c.nombre_carta}
                    invertida={c.orientacion === "invertida"}
                    eager={idx === 0}
                  />

                  <h2
                    className="text-[1.5rem] text-center mt-5 mb-1 font-semibold tracking-wide"
                    style={{ fontFamily: SERIF_FONT, color: "#F8F2E0" }}
                  >
                    {c.nombre_carta}
                    {c.orientacion === "invertida" && (
                      <span className="text-sm font-normal text-[#a79fbd]"> · invertida</span>
                    )}
                  </h2>

                  <p className="text-[16px] leading-[1.75] text-[#e6e2f0] mt-3">
                    {c.interpretacion}
                  </p>
                </article>
              </Reveal>,
            ];
            if (idx < resultado.cartas.length - 1) {
              nodos.push(<Divisor key={`orn-${c.posicion}`} />);
            }
            return nodos;
          })}
        </section>

        <Divisor />

        {/* Resumen — pergamino claro, como el PDF */}
        <Reveal className="block">
          <section className="mt-2 mb-9">
            <PlacaTitulo className="relative z-10 -mb-5">Resumen de tu tirada</PlacaTitulo>
            <PanelPergamino className="px-4 pb-8 pt-11">
              <p className="text-[16.5px] leading-[1.8] whitespace-pre-line" style={{ fontFamily: SERIF_FONT, fontWeight: 500 }}>
                {resultado.resumen_lectura}
              </p>
            </PanelPergamino>
          </section>
        </Reveal>

        {/* Mensaje personal — cierre humano */}
        <Reveal className="block">
          <section className="mb-10">
            <PlacaTitulo className="relative z-10 -mb-5">Mensaje personal</PlacaTitulo>
            <PanelPergamino className="px-4 pb-8 pt-11">
              <p className="text-[17px] leading-[1.8] text-center" style={{ fontFamily: SERIF_FONT, fontWeight: 600 }}>
                {resultado.mensaje_final}
              </p>
            </PanelPergamino>
          </section>
        </Reveal>

        {/* Claves / próximos pasos */}
        {resultado.proximos_pasos?.length > 0 && (
          <Reveal className="block">
            <section className="mb-10">
              <PlacaTitulo className="mb-6">Claves para avanzar</PlacaTitulo>
              <ol className="space-y-4">
                {resultado.proximos_pasos.map((paso, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: "#2a1424", border: `1.5px solid ${GOLD_TINTA}`, color: "#F3DFA5", fontFamily: SERIF_FONT, fontVariantNumeric: "lining-nums", lineHeight: 1 }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[16px] leading-relaxed text-[#e6e2f0]">{paso}</p>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>
        )}

        {/* Cierre / PDF — utilidad, no CTA comercial */}
        <Reveal className="block">
          <section className="text-center relative pb-4">
            <Divisor />
            <p className="text-[13px] tracking-[0.2em] uppercase mt-1 mb-1.5" style={{ color: GOLD }}>
              Guardá tu tirada
            </p>
            <p className="text-[14px] text-[#b4adc7] mb-6">
              Tu PDF queda como tu versión para conservar.
            </p>
            <a
              href={`/api/lectura/${params.token}/pdf`}
              className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] text-[15px] font-semibold transition-colors"
              style={{ border: `1.5px solid ${GOLD_TINTA}`, background: "rgba(240,197,90,0.10)", color: "#F8F2E0" }}
            >
              📜 Ver / descargar PDF
            </a>

            <p className="mt-6 text-center text-xs text-[#a79fbd]">
              Este acceso online estará disponible durante 30 días.
            </p>

            <div className="relative mt-8" style={{ height: 132 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/marca-dorada.svg`} alt="Tu Oráculo" width={150} height={17} loading="lazy" className="mx-auto block" style={{ width: 150, height: "auto" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/cristales-izq.png`} alt="" aria-hidden="true" width={88} height={88} loading="lazy" className="absolute left-0 bottom-0" style={{ width: 88, height: 88 }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/cristales-der.png`} alt="" aria-hidden="true" width={88} height={88} loading="lazy" className="absolute right-0 bottom-0" style={{ width: 88, height: 88 }} />
            </div>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
