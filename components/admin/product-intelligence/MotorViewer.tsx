"use client";
import { useState } from "react";
import {
  ChevronDown, ChevronUp, CheckCircle2, Square, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { MotorSection, PipelineStage } from "@/lib/product-intelligence/parsers";

export type { MotorSection, PipelineStage };

type Filter = "todas" | "completas" | "vacias";

const NI_BADGE_CLS = "text-xs font-mono px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-800/30 hover:bg-violet-900/60 transition-colors";

function PipelineStep({ stage, active, onClick }: {
  stage: PipelineStage;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all text-center min-w-[88px] ${
        active
          ? "border-amber-700/60 bg-amber-950/40"
          : "border-gray-800/60 bg-gray-900/40 hover:border-gray-700/60"
      }`}
    >
      <span className={`text-xs font-bold ${active ? "text-amber-400" : "text-gray-600"}`}>
        {stage.numero}
      </span>
      <span className={`text-xs font-medium leading-tight ${active ? "text-white" : "text-gray-400"}`}>
        {stage.titulo}
      </span>
    </button>
  );
}

function SectionRow({ section, niLinkBase }: { section: MotorSection; niLinkBase: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border-b border-gray-800/40 last:border-b-0 ${section.isEmpty ? "opacity-70" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-900/30 transition-colors text-left"
      >
        <span className="shrink-0 mt-0.5">
          {section.isEmpty ? (
            <Square size={14} className="text-gray-700" />
          ) : (
            <CheckCircle2 size={14} className="text-emerald-500" />
          )}
        </span>
        <span className={`text-sm flex-1 ${section.isEmpty ? "text-gray-600" : "text-gray-200"}`}>
          {section.titulo}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {!section.isEmpty && section.niRefs.map((ref) => (
            <span key={ref} className={NI_BADGE_CLS}>{ref}</span>
          ))}
          {section.isEmpty && (
            <span className="text-xs text-gray-700">Sin contenido</span>
          )}
          {open ? (
            <ChevronUp size={13} className="text-gray-600 ml-1" />
          ) : (
            <ChevronDown size={13} className="text-gray-600 ml-1" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-800/30">
          {section.isEmpty ? (
            <div className="rounded-lg bg-gray-900/30 border border-gray-800/30 p-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Esta sección todavía no está formalizada en el Motor Narrativo.
                El Prompt activo puede contener reglas relacionadas, pero el conocimiento
                aún no fue consolidado en esta sección.
              </p>
              <p className="text-xs text-gray-700 mt-2">
                Para completarla, seguí el ciclo NI: observar una lectura, detectar un patrón,
                codificarlo como regla, actualizar el Motor.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {section.contenido}
              </p>
              {section.niRefs.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800/30">
                  <span className="text-xs text-gray-600">Reglas NI:</span>
                  {section.niRefs.map((ref) => (
                    <Link
                      key={ref}
                      href={`${niLinkBase}` as Route<string>}
                      className={NI_BADGE_CLS}
                    >
                      {ref} →
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MotorViewer({
  sections,
  pipeline,
  version,
  estado,
}: {
  sections: MotorSection[];
  pipeline: PipelineStage[];
  version: string;
  estado: string;
}) {
  const [filter, setFilter] = useState<Filter>("todas");
  const [activeStage, setActiveStage] = useState<number | null>(null);

  const completas = sections.filter((s) => !s.isEmpty);
  const vacias = sections.filter((s) => s.isEmpty);
  const total = sections.length;

  const filtered =
    filter === "completas" ? completas : filter === "vacias" ? vacias : sections;

  const porcentaje = total > 0 ? Math.round((completas.length / total) * 100) : 0;

  const niLinkBase = "/admin/tarot/product-intelligence/narrative-intelligence";

  const filterCls = (f: Filter) =>
    `px-3 py-1.5 text-xs rounded-lg transition-colors ${
      filter === f ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
    }`;

  const selectedStage = pipeline.find((s) => s.numero === activeStage);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Progreso general</span>
          <span className="text-sm font-semibold text-gray-300">
            {completas.length} / {total} secciones
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-600 rounded-full transition-all duration-500"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-amber-500">{porcentaje}% completo</span>
          <span className="text-xs text-gray-600">v{version} · {estado}</span>
        </div>
      </div>

      {/* Pipeline */}
      {pipeline.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60">
            <span className="text-sm font-semibold text-gray-200">Pipeline de razonamiento</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Secuencia mental que Tu Oráculo ejecuta antes de redactar cada lectura.
              Cada etapa es condición necesaria para la siguiente.
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              {pipeline.map((stage, idx) => (
                <div key={stage.numero} className="flex items-center gap-1.5">
                  <PipelineStep
                    stage={stage}
                    active={activeStage === stage.numero}
                    onClick={() =>
                      setActiveStage(activeStage === stage.numero ? null : stage.numero)
                    }
                  />
                  {idx < pipeline.length - 1 && (
                    <ArrowRight size={13} className="text-gray-700 shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {selectedStage && (
              <div className="mt-4 rounded-lg border border-gray-800/60 bg-gray-900/40 p-4">
                <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">
                  Etapa {selectedStage.numero} — {selectedStage.titulo}
                </p>
                {selectedStage.objetivo && (
                  <p className="text-sm text-gray-300 mb-2">
                    <span className="text-gray-500">Objetivo:</span> {selectedStage.objetivo}
                  </p>
                )}
                {selectedStage.bullets.length > 0 && (
                  <ul className="space-y-1">
                    {selectedStage.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-xs text-gray-400">
                        <span className="text-gray-700 mt-1">·</span> {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
          <span className="text-sm font-semibold text-gray-200">Secciones del Motor</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setFilter("todas")} className={filterCls("todas")}>
              Todas ({total})
            </button>
            <button onClick={() => setFilter("completas")} className={filterCls("completas")}>
              ✅ Completas ({completas.length})
            </button>
            <button onClick={() => setFilter("vacias")} className={filterCls("vacias")}>
              ⬜ Vacías ({vacias.length})
            </button>
          </div>
        </div>
        <div>
          {filtered.map((section) => (
            <SectionRow key={section.titulo} section={section} niLinkBase={niLinkBase} />
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-600">No hay secciones en este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}
