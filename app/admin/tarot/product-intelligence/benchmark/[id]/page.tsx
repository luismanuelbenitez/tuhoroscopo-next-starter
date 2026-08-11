// Server Component — reads docs/product/READING_BENCHMARK.md and serves case definition to Client.
import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { BenchmarkCaseView } from "@/components/admin/product-intelligence/BenchmarkCaseView";
import { parseBenchmarkCases } from "@/lib/product-intelligence/parsers";

function readDoc(filename: string): string {
  try { return readFileSync(join(process.cwd(), "docs", "product", filename), "utf-8"); }
  catch { return ""; }
}

export default function BenchmarkCasePage({ params }: { params: { id: string } }) {
  const md = readDoc("READING_BENCHMARK.md");
  const cases = parseBenchmarkCases(md);
  const caso = cases.find((c) => c.id === params.id);

  if (!caso) notFound();

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[
          { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
          { label: "Benchmark", href: "/admin/tarot/product-intelligence/benchmark" },
          { label: `CASO ${caso.id} — ${caso.titulo}` },
        ]} />
        <div className="mt-3 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-400" />
          <h1 className="text-base font-semibold text-white">CASO {caso.id} — {caso.titulo}</h1>
        </div>
      </div>

      <div className="p-6 max-w-4xl">
        <BenchmarkCaseView caso={caso} />
      </div>
    </div>
  );
}
