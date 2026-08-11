"use client";
import { useState } from "react";
import {
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Lock,
  ArrowRight, Info,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

export interface Principio {
  numero: number;
  titulo: string;
  contenido: string;
}

export interface MedidaExito {
  dimension: string;
  que: string;
}

export interface DnaData {
  mision: string;
  siVende: string[];
  noVende: string[];
  propositoTexto: string;
  principios: Principio[];
  nuncaHace: string[];
  sienteItems: string[];
  sienteFrase: string;
  medimosRows: MedidaExito[];
}

type Tab = "mision" | "vendemos" | "principios" | "restricciones" | "exito";

const TABS: { id: Tab; label: string }[] = [
  { id: "mision", label: "Misión" },
  { id: "vendemos", label: "Qué vendemos" },
  { id: "principios", label: "Principios" },
  { id: "restricciones", label: "Restricciones" },
  { id: "exito", label: "Éxito" },
];

function AccordionItem({ titulo, contenido, index }: { titulo: string; contenido: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-900/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-900/40 text-amber-400 text-xs font-bold shrink-0">
            {index}
          </span>
          <span className="text-sm font-medium text-gray-200">{titulo}</span>
        </div>
        {open ? (
          <ChevronUp size={14} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-gray-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-800/40">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{contenido}</p>
        </div>
      )}
    </div>
  );
}

export function DnaViewer({ data }: { data: DnaData | null }) {
  const [tab, setTab] = useState<Tab>("mision");

  if (!data) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 text-sm">No se pudo cargar PRODUCT_DNA.md.</p>
        <p className="text-gray-700 text-xs mt-1">Verificá que el archivo existe en docs/product/PRODUCT_DNA.md</p>
      </div>
    );
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
      tab === t ? "text-white border-amber-500" : "text-gray-500 hover:text-gray-300 border-transparent"
    }`;

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-800 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tabCls(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4 max-w-3xl">
        {/* ── Misión ─────────────────────────────────────────── */}
        {tab === "mision" && (
          <div className="space-y-4">
            {data.mision && (
              <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 p-6">
                <p className="text-xs text-amber-500 uppercase tracking-widest mb-3">Misión</p>
                <blockquote className="text-lg text-white leading-relaxed font-light">
                  &ldquo;{data.mision}&rdquo;
                </blockquote>
                <div className="mt-4 pt-4 border-t border-amber-800/20">
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <Info size={11} /> El tarot es el medio. La claridad es el beneficio.
                  </p>
                </div>
              </div>
            )}
            {data.propositoTexto && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Propósito de cada lectura</p>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{data.propositoTexto}</p>
                <div className="mt-4 pt-3 border-t border-gray-800/40">
                  <p className="text-xs text-gray-600 flex items-center gap-1">
                    <Info size={11} className="text-gray-600" />
                    Este criterio es la definición operativa de &quot;lectura exitosa&quot;. El Benchmark y el Narrative Review lo miden.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Qué vendemos ───────────────────────────────────── */}
        {tab === "vendemos" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-5">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-4">
                ✓ Vendemos
              </p>
              <ul className="space-y-2.5">
                {data.siVende.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-emerald-200">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-gray-800/40 bg-gray-900/30 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
                ✗ No vendemos
              </p>
              <ul className="space-y-2.5">
                {data.noVende.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <XCircle size={14} className="text-gray-600 shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-500">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── Principios ─────────────────────────────────────── */}
        {tab === "principios" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 pb-1">
              Principios permanentes. No se negocian ni se adaptan por limitaciones técnicas.
              Si la implementación no puede cumplirlos, la implementación debe cambiar.
            </p>
            {data.principios.map((p) => (
              <AccordionItem key={p.numero} titulo={p.titulo} contenido={p.contenido} index={p.numero} />
            ))}
          </div>
        )}

        {/* ── Restricciones ──────────────────────────────────── */}
        {tab === "restricciones" && (
          <div className="space-y-4">
            {data.nuncaHace.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Qué nunca hace Tu Oráculo</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-1.5">
                  {data.nuncaHace.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <XCircle size={12} className="text-red-600 shrink-0" />
                      <span className="text-xs text-gray-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.sienteItems.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Qué debe sentir el cliente</span>
                  <p className="text-xs text-gray-500 mt-0.5">Al terminar una lectura ideal</p>
                </div>
                <div className="p-4 space-y-2">
                  {data.sienteItems.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span className="text-sm text-gray-300">{item}</span>
                    </div>
                  ))}
                  {data.sienteFrase && (
                    <blockquote className="mt-4 pt-4 border-t border-gray-800/40 pl-3 border-l-2 border-amber-700/50">
                      <p className="text-sm text-gray-400 italic">&ldquo;{data.sienteFrase}&rdquo;</p>
                    </blockquote>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Éxito ──────────────────────────────────────────── */}
        {tab === "exito" && (
          <div className="space-y-4">
            {data.medimosRows.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Cómo medimos el éxito</span>
                  <p className="text-xs text-gray-500 mt-0.5">No con métricas técnicas. Con experiencia de lectura.</p>
                </div>
                <div className="divide-y divide-gray-800/40">
                  {data.medimosRows.map(({ dimension, que }) => (
                    <div key={dimension} className="flex items-start gap-4 px-4 py-3">
                      <span className="text-sm font-semibold text-amber-400 w-24 shrink-0">{dimension}</span>
                      <span className="text-sm text-gray-300">{que}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-800/40 bg-gray-900/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/30">
                <span className="text-sm font-semibold text-gray-500">Jerarquía de documentos</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "PRODUCT_DNA.md", desc: "Identidad y principios permanentes", route: null, current: true },
                  { label: "PRODUCT_BIBLE.md", desc: "Experiencia, copy, UX, criterios de calidad", route: null },
                  { label: "TAROT_NARRATIVE_ENGINE.md", desc: "Reglas de interpretación de cartas", route: "/admin/tarot/product-intelligence/motor" },
                  { label: "PROMPT_ARCHITECTURE.md", desc: "Pipeline de razonamiento", route: "/admin/tarot/product-intelligence/motor" },
                  { label: "Prompt V2.1", desc: "Implementación activa", route: "/admin/tarot/product-intelligence/prompt" },
                ].map(({ label, desc, route, current }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`flex items-start gap-2 flex-1 px-3 py-2 rounded-lg ${current ? "bg-amber-950/30 border border-amber-800/30" : "bg-gray-900/40"}`}>
                      <div>
                        <p className={`text-xs font-mono font-semibold ${current ? "text-amber-400" : "text-gray-500"}`}>{label}</p>
                        <p className="text-xs text-gray-600">{desc}</p>
                      </div>
                    </div>
                    {route && (
                      <Link
                        href={route as Route<string>}
                        className="text-xs text-gray-600 hover:text-amber-400 transition-colors flex items-center gap-0.5"
                      >
                        <ArrowRight size={11} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
