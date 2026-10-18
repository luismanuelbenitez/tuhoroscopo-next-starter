import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { resolverLecturaPublica, resolverUrlAudioResumenPublica } from "@/lib/tarotLecturaPublica";
import { LecturaVista } from "@/components/lectura/vista/LecturaVista";
import { EstadoLectura } from "@/components/lectura/vista/EstadoLectura";

// Lógica de esta página CONGELADA (docs/product/DECISIONS.md 2026-10-17):
// resolución por token, estados y URLs de audio/PDF no se tocan sin
// aprobación de Manuel. La presentación vive en components/lectura/vista/.

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
    title: "Tarot — Tu Oráculo",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

export default async function LecturaPage({ params }: { params: { token: string } }) {
  const resultado = await resolverLecturaPublica(params.token);

  if (!resultado.ok) {
    if (resultado.motivo === "expirado") return <EstadoLectura variante="expirado" fontClass={serif.variable} />;
    return <EstadoLectura variante="no_encontrado" fontClass={serif.variable} />;
  }

  // Best-effort: si tts está apagado o el audio no está listo, esto
  // devuelve ok:false y el botón simplemente no se muestra.
  const audioResumen = await resolverUrlAudioResumenPublica(params.token);
  const audioResumenUrl = audioResumen.ok ? audioResumen.url : null;

  return (
    <LecturaVista
      lectura={resultado}
      audioResumenUrl={audioResumenUrl}
      pdfHref={`/api/lectura/${params.token}/pdf`}
      fontClass={serif.variable}
    />
  );
}
