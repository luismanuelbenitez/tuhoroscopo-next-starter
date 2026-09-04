import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { resolverLecturaPublica } from "@/lib/tarotLecturaPublica";

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

function ExpiradoView() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 text-center bg-[#0d0820]">
      <div className="max-w-sm">
        <p className="text-xs tracking-[0.25em] uppercase mb-6" style={{ color: GOLD }}>
          Tu Oráculo
        </p>
        <h1 className="text-2xl font-semibold text-[#F0F1F5] mb-4" style={{ fontFamily: "var(--font-serif-editorial), serif" }}>
          Este acceso online expiró
        </h1>
        <p className="text-sm text-[#c9c4d6] leading-relaxed">
          El acceso web a esta tirada estuvo disponible durante 30 días y ya no está activo.
          Si guardaste el PDF, tu lectura sigue disponible ahí para siempre.
        </p>
      </div>
    </main>
  );
}

function NoEncontradoView() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 text-center bg-[#0d0820]">
      <div className="max-w-sm">
        <p className="text-xs tracking-[0.25em] uppercase mb-6" style={{ color: GOLD }}>
          Tu Oráculo
        </p>
        <h1 className="text-2xl font-semibold text-[#F0F1F5] mb-4" style={{ fontFamily: "var(--font-serif-editorial), serif" }}>
          No encontramos esta tirada
        </h1>
        <p className="text-sm text-[#c9c4d6] leading-relaxed">
          Revisá que el enlace esté completo, tal como lo recibiste por WhatsApp.
        </p>
      </div>
    </main>
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
    <main className={`${serif.variable} min-h-screen bg-[#0d0820] text-[#F0F1F5]`}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(251,191,36,0.07), transparent)",
        }}
      />

      <div className="relative max-w-md mx-auto px-5 pb-20">
        {/* Branding */}
        <header className="pt-10 pb-8 text-center">
          <p className="text-[11px] tracking-[0.3em] uppercase" style={{ color: GOLD }}>
            Tu Oráculo
          </p>
          <p className="mt-1 text-[11px] tracking-[0.2em] uppercase text-[#8b84a3]">Tu Tirada</p>
        </header>

        {/* Saludo + pregunta */}
        <section className="text-center mb-10">
          <h1
            className="text-3xl leading-tight font-semibold mb-3"
            style={{ fontFamily: "var(--font-serif-editorial), serif" }}
          >
            Hola, {primerNombre}
          </h1>
          {resultado.pregunta && (
            <p className="text-[15px] text-[#c9c4d6] italic leading-relaxed">
              &ldquo;{resultado.pregunta}&rdquo;
            </p>
          )}
        </section>

        {/* Las 5 cartas */}
        <section className="space-y-6 mb-10">
          {resultado.cartas.map((c) => (
            <article
              key={c.posicion}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <p className="text-[11px] tracking-[0.15em] uppercase mb-3" style={{ color: GOLD }}>
                {POSICIONES[c.posicion] ?? `Carta ${c.posicion}`}
              </p>

              <div className="flex justify-center mb-4">
                {c.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imagen_url}
                    alt={c.nombre_carta}
                    className={`h-64 w-auto rounded-lg shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${
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
                className="text-xl text-center mb-1 font-semibold"
                style={{ fontFamily: "var(--font-serif-editorial), serif" }}
              >
                {c.nombre_carta}
                {c.orientacion === "invertida" && (
                  <span className="text-sm font-normal text-[#8b84a3]"> · invertida</span>
                )}
              </h2>

              <p className="text-[15px] leading-relaxed text-[#dcd8e8] mt-3">
                {c.interpretacion}
              </p>
            </article>
          ))}
        </section>

        {/* Resumen */}
        <section className="mb-10">
          <h2
            className="text-xs tracking-[0.2em] uppercase mb-3"
            style={{ color: GOLD }}
          >
            Resumen de tu tirada
          </h2>
          <p className="text-[15px] leading-relaxed text-[#dcd8e8] whitespace-pre-line">
            {resultado.resumen_lectura}
          </p>
        </section>

        {/* Mensaje personal */}
        <section className="mb-10 rounded-2xl border border-[rgba(251,191,36,0.18)] bg-[rgba(251,191,36,0.05)] p-5">
          <h2 className="text-xs tracking-[0.2em] uppercase mb-3" style={{ color: GOLD }}>
            Mensaje personal
          </h2>
          <p className="text-[15px] leading-relaxed text-[#F0F1F5]">
            {resultado.mensaje_final}
          </p>
        </section>

        {/* Claves / próximos pasos */}
        {resultado.proximos_pasos?.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xs tracking-[0.2em] uppercase mb-4" style={{ color: GOLD }}>
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
        )}

        {/* CTA PDF */}
        <a
          href={`/api/lectura/${params.token}/pdf`}
          className="block text-center rounded-full py-4 font-bold text-[15px] mb-6"
          style={{
            background: `linear-gradient(135deg, #c49008 0%, ${GOLD} 55%, #f2cc44 100%)`,
            color: "#0c0618",
          }}
        >
          Descargar mi PDF
        </a>

        <p className="text-center text-xs text-[#8b84a3]">
          Este acceso online estará disponible durante 30 días.
        </p>
      </div>
    </main>
  );
}
