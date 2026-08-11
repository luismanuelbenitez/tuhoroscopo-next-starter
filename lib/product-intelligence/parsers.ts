// Pure parsing utilities for product knowledge documents.
// No Node.js imports — call from Server Components after reading files with fs.

export interface MotorSection {
  titulo: string;
  contenido: string;
  isEmpty: boolean;
  niRefs: string[];
}

export interface PipelineStage {
  numero: number;
  titulo: string;
  objetivo: string;
  bullets: string[];
}

export interface NiRule {
  id: string;
  titulo: string;
  fuente?: string;
  problemaObservado: string;
  reglaNarrativa: string;
  justificacion: string;
  impactoEsperado: string;
  estado: "Propuesta" | "Aprobada" | "Implementada" | "Deprecada";
  versionPrompt?: string;
}

export function parseMotorSections(markdown: string): MotorSection[] {
  const idx = markdown.indexOf("\n## ");
  if (idx < 0) return [];
  const parts = markdown.slice(idx).split(/\n## /).slice(1);
  return parts.map((part) => {
    const nl = part.indexOf("\n");
    const titulo = nl >= 0 ? part.slice(0, nl).trim() : part.trim();
    const raw = nl >= 0 ? part.slice(nl + 1).trim() : "";
    // Strip trailing --- separators and leading NI annotation
    const contenido = raw
      .replace(/\n\n---\s*$/, "")
      .replace(/\n---\s*$/, "")
      .trim()
      .replace(/^\*\(NI-[^)]+\)\*\n+/, "");
    const isEmpty = contenido.length === 0;
    const niRefs = [
      ...new Set(
        [...(raw.matchAll(/\bNI-\d{3}\b/g) ?? [])].map((m) => m[0])
      ),
    ];
    return { titulo, contenido, isEmpty, niRefs };
  });
}

export function parsePipelineStages(markdown: string): PipelineStage[] {
  const pipelineIdx = markdown.indexOf("## Pipeline Mental");
  if (pipelineIdx < 0) return [];
  const section = markdown.slice(pipelineIdx);
  const parts = section.split(/\n### Etapa (\d+) — /).slice(1);
  const stages: PipelineStage[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10);
    const body = i + 1 < parts.length ? parts[i + 1] : "";
    const nl = body.indexOf("\n");
    const titulo = nl >= 0 ? body.slice(0, nl).trim() : body.trim();
    const content = nl >= 0 ? body.slice(nl + 1).trim() : "";
    const objetivo = (content.match(/\*\*Objetivo:\*\*\s*(.+?)(?:\n|$)/)?.[1] ?? "").trim();
    const bullets = content
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim())
      .filter(Boolean);
    stages.push({ numero: num, titulo, objetivo, bullets });
  }
  return stages;
}

export interface BenchmarkCase {
  id: string;          // "001"
  casoId: string;      // "CASO_001"
  titulo: string;      // "Cambio laboral"
  subtitulo: string;   // "Llevan 14 años..."
  edad: string;
  contexto: string;
  pregunta: string;
  conflicto: string;
  excelente: string[];
  riesgos: string[];
  prohibiciones: string[];
}

export function parseBenchmarkCases(markdown: string): BenchmarkCase[] {
  const casosIdx = markdown.indexOf("## Casos de referencia");
  if (casosIdx < 0) return [];
  const tablaSect = markdown.indexOf("## Tabla de evaluación");
  const section = tablaSect > casosIdx
    ? markdown.slice(casosIdx, tablaSect)
    : markdown.slice(casosIdx);

  const parts = section.split(/\n### (CASO \d{3}) — /);
  const cases: BenchmarkCase[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const header = parts[i].trim();        // "CASO 001"
    const body = i + 1 < parts.length ? parts[i + 1] : "";

    const id = header.replace("CASO ", "");   // "001"
    const casoId = `CASO_${id}`;

    const firstNl = body.indexOf("\n");
    const titulo = firstNl >= 0 ? body.slice(0, firstNl).trim() : body.trim();
    const rest = firstNl >= 0 ? body.slice(firstNl + 1) : "";

    const getField = (label: string): string => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\*\\*${escaped}\\*\\*\\s*(?::\\s*)?\\n?([\\s\\S]*?)(?=\\n\\n\\*\\*|\\n\\n---|\\n\\n### |$)`);
      return (rest.match(re)?.[1] ?? "").trim().replace(/^[""]|[""]$/g, "").trim();
    };

    const getBullets = (label: string): string[] => {
      const text = getField(label);
      return text.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter(Boolean);
    };

    const subtitulo = (rest.match(/\*\*Título:\*\*\s*(.+)/)?.[1] ?? "").trim();
    const edad = (rest.match(/\*\*Edad aproximada:\*\*\s*(.+)/)?.[1] ?? "").trim();
    const contexto = getField("Contexto");
    const pregunta = getField("Pregunta");
    const conflicto = getField("Conflicto humano esperado");
    const excelente = getBullets("Qué debería lograr una excelente lectura");
    const riesgos = getBullets("Riesgos si la IA interpreta mal");
    const prohibiciones = getBullets("Qué NO debería hacer nunca la IA");

    cases.push({ id, casoId, titulo, subtitulo, edad, contexto, pregunta, conflicto, excelente, riesgos, prohibiciones });
  }
  return cases;
}

export function parseNiRules(markdown: string): NiRule[] {
  const catalogoIdx = markdown.indexOf("## Catálogo de reglas narrativas");
  if (catalogoIdx < 0) return [];
  const catalogoContent = markdown.slice(catalogoIdx);
  const parts = catalogoContent.split(/\n### (NI-\d{3}) — /);
  const rules: NiRule[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i].trim();
    const body = i + 1 < parts.length ? parts[i + 1] : "";
    const nl = body.indexOf("\n");
    const titulo = nl >= 0 ? body.slice(0, nl).trim() : body.trim();
    const content = nl >= 0 ? body.slice(nl + 1) : "";

    const getField = (name: string): string => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `\\*\\*${escaped}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n\\*\\*|\\n\\n---|\\n\\n### |$)`
      );
      return (content.match(re)?.[1] ?? "").trim();
    };

    const estadoRaw = getField("Estado");
    const versionMatch = estadoRaw.match(/(V[\d.]+)/);
    let estado: NiRule["estado"] = "Propuesta";
    if (estadoRaw.toLowerCase().includes("implementada")) estado = "Implementada";
    else if (estadoRaw.toLowerCase().includes("aprobada")) estado = "Aprobada";
    else if (estadoRaw.toLowerCase().includes("deprecada")) estado = "Deprecada";

    const fuente = getField("Fuente");
    rules.push({
      id,
      titulo,
      fuente: fuente || undefined,
      problemaObservado: getField("Problema observado"),
      reglaNarrativa: getField("Regla narrativa"),
      justificacion: getField("Justificación"),
      impactoEsperado: getField("Impacto esperado"),
      estado,
      versionPrompt: versionMatch?.[1],
    });
  }
  return rules;
}
