import type { Metadata } from "next";
import TarotLandingContent from "../../tarot/TarotLandingContent";
import { getPrecioTarot } from "@/lib/getPrecioTarot";
import { getTestimoniosTarot } from "@/lib/getTestimoniosTarot";
import { numeroWhatsApp } from "@/lib/contacto";
import type { VarianteQueIncluye } from "@/components/tarot/QueIncluyeTarot";
import { SelectorPrueba } from "./SelectorPrueba";

// Página de pruebas de /tarot (2026-11-03): la landing de producción con el
// bloque 2 ("¿Qué incluye?") cambiable desde el selector de abajo (?v=a|b|c).
// Fuera del índice y sin medición: solo para que Manuel compare bloque a bloque.
export const metadata: Metadata = {
  title: "Tu Oráculo — Pruebas /tarot",
  robots: { index: false, follow: false },
};

const VALIDAS = new Set(["a", "b", "c"]);

export default async function Page({ searchParams }: { searchParams: { v?: string } }) {
  const v = VALIDAS.has(searchParams.v ?? "") ? (searchParams.v as VarianteQueIncluye) : undefined;
  const [precioUYU, testimonios] = await Promise.all([getPrecioTarot(), getTestimoniosTarot()]);
  return (
    <>
      <TarotLandingContent precioUYU={precioUYU} testimonios={testimonios} waNumero={numeroWhatsApp()} prueba variante={v} />
      <SelectorPrueba actual={v ?? "actual"} />
    </>
  );
}
