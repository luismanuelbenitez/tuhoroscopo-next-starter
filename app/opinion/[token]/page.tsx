import type { Metadata } from "next";
import { resolverFeedback } from "@/lib/feedbackPublico";
import { PaginaMarca } from "@/components/marca/PaginaMarca";
import { HeaderMarca } from "@/components/marca/HeaderMarca";
import { PieMarca } from "@/components/marca/PieMarca";
import { FormularioOpinion } from "@/components/opinion/FormularioOpinion";
import { EstadoOpinion } from "@/components/opinion/EstadoOpinion";

// Mini web de feedback de la campaña "Feedback de experiencia" (2026-10-19).
// Acceso por posesión del link (token aleatorio, solo su hash en la base),
// sin login, no indexable. Ver lib/feedbackPublico.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu experiencia · Tu Oráculo",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default async function OpinionPage({ params }: { params: { token: string } }) {
  const ctx = await resolverFeedback(params.token);

  return (
    <PaginaMarca>
      <HeaderMarca variante="minimo" />
      <main className="relative px-4 pb-16 pt-2 mx-auto w-full max-w-[560px]">
        {ctx.estado === "ok" && ctx.consentimientos && ctx.identidadPublica ? (
          <FormularioOpinion
            token={params.token}
            nombrePila={ctx.nombrePila ?? ""}
            identidadPublica={ctx.identidadPublica}
            consentimientos={ctx.consentimientos}
          />
        ) : (
          <EstadoOpinion estado={ctx.estado === "ok" ? "error" : ctx.estado} nombrePila={ctx.nombrePila} />
        )}
      </main>
      <PieMarca minimo />
    </PaginaMarca>
  );
}
