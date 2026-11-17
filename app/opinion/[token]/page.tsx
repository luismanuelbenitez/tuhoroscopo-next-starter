import type { Metadata } from "next";
import { resolverFeedback } from "@/lib/feedbackPublico";
import { numeroWhatsApp } from "@/lib/contacto";
import { PaginaMarca } from "@/components/marca/PaginaMarca";
import { HeaderMarca } from "@/components/marca/HeaderMarca";
import { PieMarca } from "@/components/marca/PieMarca";
import { FondoCheckout } from "@/components/tarot/checkout/FondoCheckout";
import { FormularioOpinion } from "@/components/opinion/FormularioOpinion";
import { EstadoOpinion } from "@/components/opinion/EstadoOpinion";

// Mini web de feedback de la campaña "Feedback de experiencia" (2026-10-19).
// Acceso por posesión del link (token aleatorio, solo su hash en la base),
// sin login, no indexable. Ver lib/feedbackPublico.ts.
// 2026-11-16: rediseño (fondo de marca, flujo por pasos según la nota).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu experiencia · Tu Oráculo",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default async function OpinionPage({ params }: { params: { token: string } }) {
  const ctx = await resolverFeedback(params.token);

  return (
    <PaginaMarca fondo={<FondoCheckout angosto />}>
      <HeaderMarca variante="minimo" />
      <main className="relative px-4 pb-16 pt-2 mx-auto w-full max-w-[560px] min-h-[72vh]">
        {ctx.estado === "ok" && ctx.consentimientos && ctx.identidadPublica ? (
          <FormularioOpinion
            token={params.token}
            nombrePila={ctx.nombrePila ?? ""}
            temaTexto={ctx.temaTexto ?? ""}
            identidadPublica={ctx.identidadPublica}
            consentimientos={ctx.consentimientos}
            waNumero={numeroWhatsApp()}
          />
        ) : (
          <EstadoOpinion estado={ctx.estado === "ok" ? "error" : ctx.estado} nombrePila={ctx.nombrePila} />
        )}
      </main>
      <PieMarca minimo />
    </PaginaMarca>
  );
}
