import type { Metadata } from "next";
import Link from "next/link";
import { PaginaInstitucional, EncabezadoInstitucional } from "@/components/marca/PaginaInstitucional";
import { GOLD, CTA_GRADIENT } from "@/components/home/theme";

// 404 propia (auditoría UX 2026-10-30, N1): antes caía la página por
// defecto de Next, en inglés. Llegan acá links viejos de anuncios o de
// Google: se les da salida a la home y al producto.
export const metadata: Metadata = {
  title: "Página no encontrada | Tu Oráculo",
  robots: { index: false, follow: true },
};

export default function NoEncontrada() {
  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Error 404" titulo="No encontramos esta página">
        <p className="max-w-md mx-auto">
          Puede que el enlace esté mal escrito o que la página ya no exista. Desde acá podés seguir.
        </p>
      </EncabezadoInstitucional>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-[420px] sm:max-w-none mx-auto">
        <Link
          href="/tarot"
          className="text-center text-[16px] font-bold rounded-xl px-6 py-3.5 transition-all hover:brightness-105"
          style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 24px rgba(240,197,90,0.30)" }}
        >
          Conocer el Tarot
        </Link>
        <Link
          href="/"
          className="text-center text-[16px] font-semibold rounded-xl px-6 py-3.5 transition-colors hover:bg-[#F0C55A]/10"
          style={{ border: "1px solid rgba(240,197,90,0.45)", color: GOLD }}
        >
          Ir al inicio
        </Link>
      </div>
      <p className="mt-8 text-center text-[14px] text-white/60">
        ¿Buscabas tu lectura? Abrí el enlace que te llegó por WhatsApp o escribinos a{" "}
        <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-4" style={{ color: GOLD }}>hola@tuoraculo.uy</a>.
      </p>
    </PaginaInstitucional>
  );
}
