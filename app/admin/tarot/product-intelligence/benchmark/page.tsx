// Server Component — reads docs/product/READING_BENCHMARK.md at render time.
import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";
import type { Route } from "next";
import { BarChart3, CheckCircle2, Clock } from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { ContextBanner } from "@/components/admin/product-intelligence/ContextBanner";
import { parseBenchmarkCases } from "@/lib/product-intelligence/parsers";

function readDoc(filename: string): string {
  try { return readFileSync(join(process.cwd(), "docs", "product", filename), "utf-8"); }
  catch { return ""; }
}

export default function BenchmarkPage() {
  const md = readDoc("READING_BENCHMARK.md");
  const cases = parseBenchmarkCases(md);

  // Parse evaluation table from markdown for quick status overview
  const tableIdx = md.indexOf("## Tabla de evaluación");
  const tableSection = tableIdx >= 0 ? md.slice(tableIdx) : "";
  const evaluatedCases = new Set<string>();
  tableSection.split("\n").forEach((line) => {
    const m = line.match(/CASO (\d{3})/);
    const hasResult = line.includes("Aprobado") || line.includes("Observaciones") || line.includes("Rechazado");
    if (m && hasResult) evaluatedCases.add(m[1]);
  });

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[
          { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
          { label: "Benchmark" },
        ]} />
        <div className="mt-3 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-400" />
          <h1 className="text-base font-semibold text-white">Benchmark</h1>
          <span className="text-xs text-gray-600 ml-1">{cases.length} casos de referencia</span>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-4xl">
        <ContextBanner variant="info">
          El benchmark no mide al modelo de IA. Mide la calidad de la experiencia del cliente.
          Cada cambio significativo al Motor Narrativo o al Prompt debe evaluarse contra estos casos antes de pasar a producción.
        </ContextBanner>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total casos", value: cases.length, cls: "text-white" },
            { label: "Con evaluación (Markdown)", value: evaluatedCases.size, cls: "text-emerald-400" },
            { label: "Pendientes", value: cases.length - evaluatedCases.size, cls: "text-amber-400" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 text-center">
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
              <p className="text-xs text-gray-600 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Case list */}
        {cases.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
            <p className="text-sm text-gray-500">No se pudo cargar READING_BENCHMARK.md.</p>
            <p className="text-xs text-gray-700 mt-1">Verificá que el archivo existe en docs/product/READING_BENCHMARK.md</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/60">
              <span className="text-sm font-semibold text-gray-200">Casos de referencia</span>
            </div>
            <div className="divide-y divide-gray-800/40">
              {cases.map((caso) => {
                const hasEval = evaluatedCases.has(caso.id);
                return (
                  <Link
                    key={caso.id}
                    href={`/admin/tarot/product-intelligence/benchmark/${caso.id}` as Route<string>}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-900/40 transition-colors"
                  >
                    <span className="text-xs font-mono font-bold text-gray-500 shrink-0 w-16">CASO {caso.id}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium">{caso.titulo}</p>
                      {caso.subtitulo && <p className="text-xs text-gray-500 truncate mt-0.5">{caso.subtitulo}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasEval ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle2 size={12} /> Evaluado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <Clock size={12} /> Pendiente
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-800/30 bg-gray-900/20 px-4 py-3">
          <p className="text-xs text-gray-700">
            Fuente canónica:{" "}
            <code className="text-xs bg-gray-800 px-1 rounded">docs/product/READING_BENCHMARK.md</code>.
            Las evaluaciones se guardan en la base de datos. Los casos de referencia viven en el documento.
          </p>
        </div>
      </div>
    </div>
  );
}
