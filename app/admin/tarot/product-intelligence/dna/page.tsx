// Server Component — reads docs/product/PRODUCT_DNA.md at render time.
// Canonical source of truth: PRODUCT_DNA.md (this page is read-only view).
import { readFileSync } from "fs";
import { join } from "path";
import { Dna, Lock } from "lucide-react";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { DnaViewer, type DnaData } from "@/components/admin/product-intelligence/DnaViewer";

function readDoc(filename: string): string {
  try {
    return readFileSync(join(process.cwd(), "docs", "product", filename), "utf-8");
  } catch {
    return "";
  }
}

function extractSection(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  return (markdown.match(re)?.[1] ?? "").trim();
}

function parseDna(md: string): DnaData | null {
  if (!md) return null;

  // Mission
  const misionSection = extractSection(md, "Misión");
  const mision = (misionSection.match(/>\s*(.+?)(?:\n\n|$)/s)?.[1] ?? "")
    .replace(/\n>\s*/g, " ")
    .trim();

  // What we sell
  const vendeSection = extractSection(md, "Qué vendemos realmente");
  const vendeLines = vendeSection.split("\n").map((l) => l.trim()).filter(Boolean);
  const siVende = vendeLines
    .filter((l) => /^Vendemos /.test(l) && !l.includes("realmente") && !l.includes("El tarot"))
    .map((l) => l.replace(/^Vendemos\s+/, "").replace(/\.$/, "").trim());
  const noVende = vendeLines
    .filter((l) => /^No vendemos /.test(l))
    .map((l) => l.replace(/^No vendemos\s+/, "").replace(/\.$/, "").trim());

  // Propósito
  const propositoSection = extractSection(md, "Propósito de cada lectura");
  const propositoTexto = propositoSection
    .replace(/\n\n---\s*$/, "")
    .replace(/  \n/g, "\n")
    .trim();

  // Principios
  const principiosSection = extractSection(md, "Principios fundacionales");
  const principioRe = /### Principio (\d+) — (.+?)\n\n([\s\S]+?)(?=\n\n---\n\n### Principio|\n\n### Principio|\n\n## |\s*$)/g;
  const principios: DnaData["principios"] = [];
  let m;
  while ((m = principioRe.exec(principiosSection)) !== null) {
    principios.push({
      numero: parseInt(m[1], 10),
      titulo: m[2].trim(),
      contenido: m[3].replace(/\n\n---\s*$/, "").trim(),
    });
  }

  // Never does
  const nuncaSection = extractSection(md, "Qué nunca hace Tu Oráculo");
  const nuncaHace = nuncaSection
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  // What client feels
  const sienteSection = extractSection(md, "Qué debe sentir el cliente");
  const sienteItems = sienteSection
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());
  const sienteFrase = (sienteSection.match(/>\s*"([^"]+)"/)?.[1] ?? "").trim();

  // Success metrics (table)
  const medimosSection = extractSection(md, "Cómo medimos el éxito");
  const medimosRows: DnaData["medimosRows"] = medimosSection
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.match(/\|[\s-|]+\|/))
    .slice(1) // skip header
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
      return cells.length >= 2
        ? { dimension: cells[0].replace(/\*\*/g, ""), que: cells[1] }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return { mision, siVende, noVende, propositoTexto, principios, nuncaHace, sienteItems, sienteFrase, medimosRows };
}

export default function DnaPage() {
  const md = readDoc("PRODUCT_DNA.md");
  const data = parseDna(md);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb
          segments={[
            { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
            { label: "Product DNA" },
          ]}
        />
        <div className="mt-3 flex items-center gap-2">
          <Dna size={18} className="text-purple-400" />
          <h1 className="text-base font-semibold text-white">Product DNA</h1>
          <span className="ml-1 text-xs bg-gray-800/60 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Lock size={9} /> SOLO LECTURA
          </span>
        </div>
      </div>

      {/* Read-only banner */}
      <div className="mx-6 mt-5 rounded-xl border border-gray-800/40 bg-gray-900/30 px-5 py-4">
        <div className="flex items-start gap-3">
          <Lock size={14} className="text-gray-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-400 font-medium">Solo lectura — identidad permanente del producto</p>
            <p className="text-xs text-gray-600 mt-1">
              Todos los demás módulos — Motor, Prompt, Configuración — deben ser consistentes con lo que está aquí.
              Si hay contradicción, este documento gana.
              Para modificarlo, editá{" "}
              <code className="text-xs bg-gray-800 px-1 rounded">docs/product/PRODUCT_DNA.md</code> en el repositorio.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <DnaViewer data={data} />
      </div>
    </div>
  );
}
