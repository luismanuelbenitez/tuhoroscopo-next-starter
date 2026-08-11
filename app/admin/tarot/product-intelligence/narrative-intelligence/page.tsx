// Server Component — NiViewer fetches rules from DB; this page provides the shell.
// Canonical source for rule state: tarot_narrative_rules (seeded from NARRATIVE_INTELLIGENCE.md).
// NARRATIVE_INTELLIGENCE.md remains the reference document for the learning cycle description.
import { Lightbulb } from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { NiViewer } from "@/components/admin/product-intelligence/NiViewer";

export default function NarrativeIntelligencePage() {
  // Last ciclo data is static from doc — NiViewer fetches rules dynamically from DB.
  const lastCiclo = { fecha: "2026-08-07", caso: "CASO 001 (V2.1)", version: "V2.1" };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb
          segments={[
            { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
            { label: "Narrative Intelligence" },
          ]}
        />
        <div className="mt-3 flex items-center gap-2">
          <Lightbulb size={18} className="text-yellow-400" />
          <h1 className="text-base font-semibold text-white">Narrative Intelligence</h1>
          <span className="text-xs text-gray-600 ml-1">El conocimiento narrativo acumulado</span>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-4xl">
        <ContextBanner variant="info">
          El verdadero activo de Tu Oráculo no es el Prompt — es el conocimiento narrativo acumulado.
          Cada regla NI nace de observar lecturas reales y codificar lo aprendido.
          Las reglas mejoran el Motor Narrativo; el Motor Narrativo genera instrucciones más precisas;
          las instrucciones más precisas generan mejores lecturas.
        </ContextBanner>

        <NiViewer lastCiclo={lastCiclo} />

        <div className="rounded-xl border border-gray-800/30 bg-gray-900/20 px-4 py-3">
          <p className="text-xs text-gray-700">
            Las reglas se gobiernan desde esta interfaz (DB).{" "}
            <code className="text-xs bg-gray-800 px-1 rounded">docs/product/NARRATIVE_INTELLIGENCE.md</code>{" "}
            sigue siendo la referencia histórica/conceptual del ciclo de aprendizaje.
          </p>
        </div>
      </div>
    </div>
  );
}
