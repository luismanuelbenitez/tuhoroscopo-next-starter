import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { resolverLecturaPublica } from "@/lib/tarotLecturaPublica";
import { AmbientAudioControls } from "@/components/lectura/AmbientAudio";
import { Reveal } from "@/components/lectura/Reveal";

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
const MOON = "#EDE6D6";
const SERIF_FONT = "var(--font-serif-editorial), serif";

// Fondo compartido — mismo lenguaje visual (gradiente, dorado, grano,
// estrellas discretas) que el cabezal dinámico de WhatsApp/email
// (_shared/tarot-imagen-whatsapp.ts): "el fondo acompaña, nunca compite".
// Todo position:fixed + pointer-events-none, una sola vez por página.
function FondoCelestial() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {/* Halo dorado superior — eco del cabezal */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(251,191,36,0.08), transparent)",
        }}
      />
      {/* Insinuación celestial baja, hacia el cierre de la lectura */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% 68%, rgba(148,110,255,0.05), transparent)",
        }}
      />
      {/* Estrellas discretas — misma técnica que --stars-1 en globals.css */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "170px 170px",
          opacity: 0.35,
        }}
      />
      {/* Grano casi imperceptible */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "140px 140px",
          opacity: 0.025,
        }}
      />
    </div>
  );
}

function Ornamento() {
  return (
    <div className="flex items-center justify-center gap-3 py-6" aria-hidden="true">
      <span className="h-px w-9" style={{ background: "linear-gradient(90deg, transparent, rgba(255,206,77,0.4))" }} />
      <span className="h-[5px] w-[5px] rotate-45" style={{ background: "rgba(255,206,77,0.55)" }} />
      <span className="h-px w-9" style={{ background: "linear-gradient(90deg, rgba(255,206,77,0.4), transparent)" }} />
    </div>
  );
}

function OrnamentoCierre() {
  return (
    <div className="flex items-center justify-center gap-4 py-2" aria-hidden="true">
      <span className="h-px w-16" style={{ background: "linear-gradient(90deg, transparent, rgba(255,206,77,0.45))" }} />
      <span className="text-[13px]" style={{ color: GOLD, opacity: 0.7 }}>✦</span>
      <span className="h-px w-16" style={{ background: "linear-gradient(90deg, rgba(255,206,77,0.45), transparent)" }} />
    </div>
  );
}

function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${serif.variable} min-h-screen flex items-center justify-center px-6 py-16 text-center relative`} style={{ background: "linear-gradient(160deg, #130a2e 0%, #0d0820 55%, #0c0618 100%)" }}>
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

  const primerNombre = resultado.nombre?.trim().split(" ")[0] ?? "";

  return (
    <main
      className={`${serif.variable} min-h-screen text-[#F0F1F5] relative`}
      style={{ background: "linear-gradient(160deg, #130a2e 0%, #0d0820 55%, #0c0618 100%)" }}
    >
      <FondoCelestial />

      <div className="relative max-w-md mx-auto px-5 pb-16">
        {/* Branding */}
        <header className="pt-12 pb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2" aria-hidden="true">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: MOON, opacity: 0.6 }} />
            <p className="text-[11px] tracking-[0.35em] uppercase" style={{ color: GOLD }}>
              Tu Oráculo
            </p>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: GOLD, opacity: 0.75 }} />
          </div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#8b84a3]">Tu Tirada</p>
          <div
            className="mx-auto mt-5 h-px w-14"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,206,77,0.5), transparent)" }}
          />
        </header>

        {/* Saludo + pregunta + audio ambiental */}
        <section className="text-center mb-11 px-1">
          <h1
            className="text-[2.05rem] leading-[1.15] font-semibold mb-4"
            style={{ fontFamily: SERIF_FONT }}
          >
            Hola, {primerNombre}
          </h1>
          {resultado.pregunta && (
            <div className="mb-7">
              <p className="text-[11px] tracking-[0.25em] uppercase mb-2.5" style={{ color: GOLD, opacity: 0.85 }}>
                Tu pregunta
              </p>
              <p
                className="text-[15.5px] text-[#c9c4d6] italic leading-relaxed max-w-[300px] mx-auto"
                style={{ fontFamily: SERIF_FONT }}
              >
                &ldquo;{resultado.pregunta}&rdquo;
              </p>
            </div>
          )}
          <AmbientAudioControls />
        </section>

        {/* Las 5 cartas, con ritmo entre posiciones */}
        <section className="mb-2">
          {resultado.cartas.flatMap((c, idx) => {
            const nodos: React.ReactNode[] = [
              <Reveal key={`carta-${c.posicion}`}>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-7">
                  <div className="flex items-center justify-center gap-2.5 mb-5" aria-hidden="true">
                    <span className="h-px w-5" style={{ background: "rgba(255,206,77,0.4)" }} />
                    <p className="text-[11px] tracking-[0.15em] uppercase" style={{ color: GOLD }}>
                      {POSICIONES[c.posicion] ?? `Carta ${c.posicion}`}
                    </p>
                    <span className="h-px w-5" style={{ background: "rgba(255,206,77,0.4)" }} />
                  </div>

                  <div className="flex justify-center mb-5">
                    {c.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imagen_url}
                        alt={c.nombre_carta}
                        loading={idx === 0 ? "eager" : "lazy"}
                        className={`h-64 w-auto rounded-lg shadow-[0_14px_36px_rgba(0,0,0,0.5)] ${
                          c.orientacion === "invertida" ? "rotate-180" : ""
                        }`}
                      />
                    ) : (
                      <div className="h-64 w-44 rounded-lg bg-white/5 flex items-center justify-center text-xs text-[#8b84a3]">
                        {c.nombre_carta}
                      </div>
                    )}
                  </div>

                  <h2
                    className="text-[1.4rem] text-center mb-2 font-semibold tracking-wide"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {c.nombre_carta}
                    {c.orientacion === "invertida" && (
                      <span className="text-sm font-normal text-[#8b84a3]"> · invertida</span>
                    )}
                  </h2>

                  <p className="text-[15px] leading-[1.75] text-[#dcd8e8] mt-3">
                    {c.interpretacion}
                  </p>
                </article>
              </Reveal>,
            ];
            if (idx < resultado.cartas.length - 1) {
              nodos.push(<Ornamento key={`orn-${c.posicion}`} />);
            }
            return nodos;
          })}
        </section>

        {/* Transición editorial hacia el cierre */}
        <OrnamentoCierre />

        {/* Resumen — más presencia visual que una interpretación individual */}
        <Reveal className="block">
          <section className="mt-6 mb-8">
            <div
              className="rounded-2xl border px-6 py-8"
              style={{
                borderColor: "rgba(255,206,77,0.22)",
                background: "linear-gradient(165deg, rgba(255,206,77,0.07), rgba(255,206,77,0.01) 60%)",
              }}
            >
              <h2 className="text-center text-[13px] tracking-[0.25em] uppercase mb-4 font-semibold" style={{ color: GOLD }}>
                Resumen de tu tirada
              </h2>
              <p className="text-[16px] leading-[1.85] text-[#eae7f2] whitespace-pre-line">
                {resultado.resumen_lectura}
              </p>
            </div>
          </section>
        </Reveal>

        {/* Mensaje personal — cierre humano de la experiencia */}
        <Reveal className="block">
          <section className="mb-11">
            <div
              className="rounded-2xl border px-6 py-8"
              style={{
                borderColor: "rgba(251,191,36,0.24)",
                background: "linear-gradient(160deg, rgba(251,191,36,0.09), rgba(251,191,36,0.02))",
              }}
            >
              <p className="text-center text-[13px] tracking-[0.25em] uppercase mb-4 font-semibold" style={{ color: GOLD }}>
                Mensaje personal
              </p>
              <p
                className="text-[16.5px] leading-[1.85] text-[#F8F5FF] text-center"
                style={{ fontFamily: SERIF_FONT }}
              >
                {resultado.mensaje_final}
              </p>
            </div>
          </section>
        </Reveal>

        {/* Claves / próximos pasos */}
        {resultado.proximos_pasos?.length > 0 && (
          <Reveal className="block">
            <section className="mb-12">
              <h2 className="text-xs tracking-[0.2em] uppercase mb-5 text-center" style={{ color: GOLD }}>
                Claves para avanzar
              </h2>
              <ol className="space-y-4">
                {resultado.proximos_pasos.map((paso, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                      style={{ background: "rgba(251,191,36,0.15)", color: GOLD }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[15px] leading-relaxed text-[#dcd8e8]">{paso}</p>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>
        )}

        {/* Cierre / PDF — utilidad, no CTA comercial */}
        <Reveal className="block">
          <section className="text-center">
            <Ornamento />
            <p className="text-[13px] tracking-[0.2em] uppercase mt-2 mb-1.5" style={{ color: GOLD }}>
              Guardá tu tirada
            </p>
            <p className="text-[13px] text-[#9891ad] mb-6">
              Tu PDF queda como tu versión para conservar.
            </p>
            <a
              href={`/api/lectura/${params.token}/pdf`}
              className="inline-block rounded-full px-8 py-3.5 text-[14px] font-semibold border border-white/15 bg-white/5 text-[#f0e9d8] transition-colors hover:bg-white/10 hover:border-white/25"
            >
              📜 Ver / descargar PDF
            </a>

            <p className="mt-6 text-center text-xs text-[#8b84a3]">
              Este acceso online estará disponible durante 30 días.
            </p>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
