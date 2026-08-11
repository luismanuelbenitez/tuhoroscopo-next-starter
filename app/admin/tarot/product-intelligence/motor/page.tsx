// Server Component — reads docs/product/TAROT_NARRATIVE_ENGINE.md and PROMPT_ARCHITECTURE.md.
// Canonical sources: both markdown files in docs/product/ (this page is read-only view).
import { readFileSync } from "fs";
import { join } from "path";
import { Brain, Lock } from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { MotorViewer } from "@/components/admin/product-intelligence/MotorViewer";
import {
  parseMotorSections,
  parsePipelineStages,
} from "@/lib/product-intelligence/parsers";

function readDoc(filename: string): string {
  try {
    return readFileSync(join(process.cwd(), "docs", "product", filename), "utf-8");
  } catch {
    return "";
  }
}

function extractDocMeta(markdown: string) {
  const version = (markdown.match(/\*\*Versión:\*\*\s*(.+?)(?:\n|$)/)?.[1] ?? "—").trim();
  const estado = (markdown.match(/\*\*Estado:\*\*\s*(.+?)(?:\n|$)/)?.[1] ?? "—").trim();
  return { version, estado };
}

export default function MotorPage() {
  const motorMd = readDoc("TAROT_NARRATIVE_ENGINE.md");
  const archMd = readDoc("PROMPT_ARCHITECTURE.md");

  const sections = parseMotorSections(motorMd);
  const pipeline = parsePipelineStages(archMd);
  const { version, estado } = extractDocMeta(motorMd);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb
          segments={[
            { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
            { label: "Motor Narrativo" },
          ]}
        />
        <div className="mt-3 flex items-center gap-2">
          <Brain size={18} className="text-blue-400" />
          <h1 className="text-base font-semibold text-white">Motor Narrativo</h1>
          <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded font-mono">v{version}</span>
          <span className="ml-1 text-xs bg-gray-800/60 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Lock size={9} /> SOLO LECTURA
          </span>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-4xl">
        <ContextBanner variant="info">
          El Motor Narrativo no es el prompt. Es el conocimiento que el prompt implementa.
          Cambiar el prompt sin actualizar el motor rompe la consistencia del producto.
          Para modificar el motor, seguí el{" "}
          <a href="/admin/tarot/product-intelligence/narrative-intelligence" className="text-blue-400 hover:underline">
            ciclo Narrative Intelligence
          </a>.
        </ContextBanner>

        {sections.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
            <p className="text-sm text-gray-500">
              No se pudo cargar TAROT_NARRATIVE_ENGINE.md.
            </p>
            <p className="text-xs text-gray-700 mt-1">
              Verificá que el archivo existe en docs/product/TAROT_NARRATIVE_ENGINE.md
            </p>
          </div>
        ) : (
          <MotorViewer
            sections={sections}
            pipeline={pipeline}
            version={version}
            estado={estado}
          />
        )}
      </div>
    </div>
  );
}
