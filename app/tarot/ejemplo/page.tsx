import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { Info } from "lucide-react";
import { LecturaVista } from "@/components/lectura/vista/LecturaVista";
import { GOLD, SERIF, CREMA } from "@/components/lectura/vista/Base";
import { LECTURA_EJEMPLO, AUDIO_EJEMPLO } from "@/lib/tarot/lecturaEjemplo";
import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { CTA_GRADIENT } from "@/components/home/theme";

// Lectura de ejemplo (2026-11-03): la misma vista que recibe un cliente en
// /lectura/[token], con la lectura de "Paula". A pedido de Manuel, tiene que
// quedar bien claro que Paula NO existe: aviso fijo arriba mientras se baja,
// presentación al principio y cierre sin PDF ni datos precargados. Fuera de
// Google (noindex): se llega desde /tarot.

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif-editorial",
});

export const metadata: Metadata = {
  title: "Lectura de ejemplo | Tu Oráculo",
  description: "Así se ve una lectura de Tarot de Tu Oráculo. Ejemplo hecho para una persona ficticia.",
  robots: { index: false, follow: true },
};

const BOTON = { background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 4px 16px rgba(240,197,90,0.30)" } as const;

function Aviso() {
  return (
    <div
      role="note"
      className="sticky top-0 z-40"
      style={{ background: "rgba(16,9,32,0.94)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(240,197,90,0.45)" }}
    >
      <div className="mx-auto max-w-[960px] flex items-center gap-3 px-4 md:px-8 py-2.5">
        <Info size={18} className="shrink-0" style={{ color: GOLD }} />
        <p className="flex-1 min-w-0 text-[12.5px] md:text-[13.5px] leading-snug text-white/90">
          <strong style={{ color: GOLD }}>Lectura de ejemplo.</strong>{" "}
          Paula es un personaje ficticio: esta persona no existe.
        </p>
        <Link href="/tarot/checkout" className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-bold" style={BOTON}>
          Quiero la mía →
        </Link>
      </div>
    </div>
  );
}

function Presentacion() {
  return (
    <div className="relative mx-auto max-w-[960px] px-4 md:px-10 pt-5">
      <div className="rounded-2xl px-5 py-4 md:py-5 text-center" style={{ background: "rgba(12,7,24,0.82)", border: "1px solid rgba(240,197,90,0.35)" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: GOLD }}>Así se ve una lectura</p>
        <p className="text-[14px] md:text-[15px] leading-relaxed text-white/85 max-w-[620px] mx-auto">
          Creamos a <strong className="text-white">Paula</strong>, una persona que <strong className="text-white">no existe</strong>, para mostrarte
          una lectura completa: consultó por <em>amor y vínculos</em> y estas son las 5 cartas que le salieron, con el texto tal
          cual lo recibiría. Tu lectura parte de <strong className="text-white">tu</strong> consulta y de <strong className="text-white">tus</strong> cartas.
        </p>
      </div>
    </div>
  );
}

function Cierre({ precioUYU }: { precioUYU: number | null }) {
  return (
    <div className="rounded-3xl px-6 py-8 text-center" style={{ background: "rgba(12,7,24,0.85)", border: "1px solid rgba(240,197,90,0.35)" }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: GOLD }}>Fin del ejemplo</p>
      <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(26px, 5vw, 34px)", lineHeight: 1.15, color: CREMA }}>
        Ahora, tu propia lectura.
      </h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-white/80 max-w-[520px] mx-auto">
        Paula es ficticia; tu lectura no. Te llega en minutos por WhatsApp, con tus 5 cartas, el resumen en audio y tu PDF para guardar.
      </p>
      <Link href="/tarot/checkout" className="mt-6 inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-[16px] font-bold w-full sm:w-auto" style={BOTON}>
        Quiero mi lectura →
      </Link>
      {precioUYU !== null && <p className="mt-2.5 text-[12.5px] text-white/60">$U {precioUYU} · Pago único con Mercado Pago</p>}
      <p className="mt-5">
        <Link href="/tarot" className="text-[13px] underline underline-offset-4" style={{ color: GOLD }}>← Volver a Tarot</Link>
      </p>
    </div>
  );
}

export default async function LecturaEjemplo() {
  const precioUYU = await getPrecioTarot();
  return (
    <LecturaVista
      lectura={LECTURA_EJEMPLO}
      audioResumenUrl={AUDIO_EJEMPLO}
      pdfHref="#"
      fontClass={serif.variable}
      aviso={<><Aviso /><Presentacion /></>}
      cierre={<Cierre precioUYU={precioUYU} />}
    />
  );
}
