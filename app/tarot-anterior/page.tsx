import type { Metadata } from "next";
import TarotLandingContent from "../tarot/TarotLandingContent";
import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { getTestimoniosTarot } from "@/lib/getTestimoniosTarot";
import { numeroWhatsApp } from "@/lib/contacto";

// Respaldo de la portada de /tarot anterior al video (reemplazada el
// 2026-11-03). Fuera del índice y sin medición: solo para comparar o volver
// atrás (en ese caso, TarotLandingContent vuelve a usar <HeroTarotAnterior />).
export const metadata: Metadata = {
  title: "Tu Oráculo — Tarot anterior (respaldo)",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const [precioUYU, testimonios] = await Promise.all([getPrecioTarot(), getTestimoniosTarot()]);
  return <TarotLandingContent precioUYU={precioUYU} testimonios={testimonios} waNumero={numeroWhatsApp()} respaldo />;
}
