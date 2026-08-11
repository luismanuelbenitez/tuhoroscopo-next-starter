"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { BookOpen, Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { PIABreadcrumb } from "@/components/admin/product-intelligence/PIABreadcrumb";
import { NarrativeReviewForm, type NarrativeReview } from "@/components/admin/product-intelligence/NarrativeReviewForm";

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "long", timeStyle: "short" });
}

function fmtCosto(v: number | string | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `USD ${n.toFixed(6)} (~$${(n * 1000).toFixed(3)}/1k)`;
}

function Campo({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="w-44 text-xs text-gray-500 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-300">{value ?? "—"}</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800/60">
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </div>
      <div className="px-4 divide-y divide-gray-800/30">{children}</div>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string | undefined | null }) {
  if (!text) return null;
  return (
    <div className="py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export default function LecturaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [data, setData] = useState<{
    lectura: Record<string, unknown>;
    orden: Record<string, unknown> | null;
    cliente: Record<string, unknown> | null;
    review: NarrativeReview | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<NarrativeReview | null>(null);
  const [tab, setTab] = useState<"consulta" | "lectura" | "tecnico">("consulta");

  useEffect(() => {
    if (!id) return;
    setLoading(true); setError(null);
    fetch(`/api/admin/tarot/product-intelligence/lecturas/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setData(d); setReview(d.review ?? null); }
        else setError(d.motivo ?? "No encontrada");
      })
      .catch(() => setError("Error de red"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <Loader2 size={20} className="animate-spin text-gray-500" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        <AlertCircle size={14} /> {error ?? "Error desconocido"}
      </div>
    </div>
  );

  const { lectura, orden, cliente } = data;
  const cj = (lectura.contenido_json ?? {}) as Record<string, unknown>;
  const cartas = Array.isArray(cj.cartas) ? cj.cartas as Record<string, string>[] : [];
  const interpretaciones = Array.isArray(cj.interpretaciones) ? cj.interpretaciones as Record<string, string>[] : [];
  const consejos = Array.isArray(cj.consejos) ? cj.consejos as Record<string, string>[] : [];

  const TABS = [
    { id: "consulta" as const, label: "Consulta" },
    { id: "lectura" as const, label: "Lectura" },
    { id: "tecnico" as const, label: "Técnico" },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 px-6 py-4">
        <PIABreadcrumb segments={[
          { label: "Product Intelligence", href: "/admin/tarot/product-intelligence" },
          { label: "Lecturas", href: "/admin/tarot/product-intelligence/lecturas" },
          { label: id.slice(0, 8) + "…" },
        ]} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-purple-400" />
            <h1 className="text-base font-semibold text-white">Lectura</h1>
            <span className="text-xs font-mono text-gray-500">{id.slice(0, 16)}…</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${String(lectura.estado) === "exitosa" ? "bg-emerald-900/50 text-emerald-400" : "bg-gray-800 text-gray-400"}`}>
              {String(lectura.estado ?? "—")}
            </span>
          </div>
          <Link href={"/admin/tarot/product-intelligence/lecturas" as Route<string>}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <ChevronLeft size={13} /> Volver
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-xs transition-colors border-b-2 ${tab === t.id ? "border-amber-500 text-amber-300" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-4xl">

        {/* ── TAB: Consulta ─────────────────────────────────────────────────── */}
        {tab === "consulta" && (
          <div className="space-y-4">
            <SectionCard title="Cliente">
              <Campo label="Nombre" value={String(cliente?.nombre_completo ?? "—")} />
              <Campo label="Fecha de nacimiento" value={String(cliente?.fecha_nacimiento ?? "—")} />
              {!!cliente?.hora_nacimiento && <Campo label="Hora de nacimiento" value={String(cliente.hora_nacimiento)} />}
              {!!cliente?.lugar_nacimiento && <Campo label="Lugar de nacimiento" value={String(cliente.lugar_nacimiento)} />}
            </SectionCard>

            <SectionCard title="Consulta">
              <Campo label="Tema" value={String(orden?.tema ?? "—")} />
              <Campo label="Fecha de consulta" value={fmt(String(orden?.created_at ?? ""))} />
              {!!orden?.pregunta_usuario && (
                <div className="py-3">
                  <p className="text-xs text-gray-500 mb-1.5">Pregunta</p>
                  <p className="text-sm text-amber-200 leading-relaxed italic">&ldquo;{String(orden.pregunta_usuario)}&rdquo;</p>
                </div>
              )}
            </SectionCard>

            {cartas.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Cartas ({cartas.length})</span>
                </div>
                <div className="divide-y divide-gray-800/30">
                  {cartas.map((carta, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-24 shrink-0">{carta.posicion ?? `Carta ${i + 1}`}</span>
                      <span className="text-sm text-gray-200 flex-1">{carta.carta ?? carta.nombre ?? "—"}</span>
                      {carta.orientacion && <span className="text-xs text-gray-500">{carta.orientacion}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Lectura ──────────────────────────────────────────────────── */}
        {tab === "lectura" && (
          <div className="space-y-4">
            {/* Prompt version notice */}
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 px-4 py-2.5">
              <p className="text-xs text-gray-600">
                Versión del prompt al momento de la lectura:{" "}
                <span className="text-gray-500">{review?.prompt_version ?? "no registrada"}</span>
              </p>
            </div>

            {!!cj.descripcion_general && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Descripción general</p>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{String(cj.descripcion_general)}</p>
              </div>
            )}

            {interpretaciones.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <span className="text-sm font-semibold text-gray-200">Interpretaciones</span>
                </div>
                <div className="divide-y divide-gray-800/30">
                  {interpretaciones.map((interp, i) => (
                    <div key={i} className="px-4 py-3">
                      {interp.posicion && <p className="text-xs text-gray-500 mb-1">{interp.posicion}</p>}
                      <p className="text-sm text-gray-300 leading-relaxed">{interp.texto ?? interp.interpretacion ?? JSON.stringify(interp)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {consejos.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/60"><span className="text-sm font-semibold text-gray-200">Consejos</span></div>
                <div className="divide-y divide-gray-800/30">
                  {consejos.map((c, i) => (
                    <div key={i} className="px-4 py-3">
                      {c.posicion && <p className="text-xs text-gray-500 mb-1">{c.posicion}</p>}
                      <p className="text-sm text-gray-300 leading-relaxed">{c.texto ?? c.consejo ?? JSON.stringify(c)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!(cj.resumen_lectura ?? lectura.resumen_lectura) && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <TextBlock label="Resumen" text={String(cj.resumen_lectura ?? lectura.resumen_lectura ?? "")} />
              </div>
            )}

            {!!(cj.mensaje_final ?? lectura.mensaje_final) && (
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
                <p className="text-xs text-amber-600 uppercase tracking-wider mb-2">Mensaje final</p>
                <p className="text-sm text-amber-200 leading-relaxed font-medium">{String(cj.mensaje_final ?? lectura.mensaje_final ?? "")}</p>
              </div>
            )}

            {/* Narrative Review */}
            <NarrativeReviewForm
              lecturaId={id}
              existing={review}
              onSaved={(r) => setReview(r)}
            />
          </div>
        )}

        {/* ── TAB: Técnico ──────────────────────────────────────────────────── */}
        {tab === "tecnico" && (
          <div className="space-y-4">
            <SectionCard title="Modelo y rendimiento">
              <Campo label="Modelo IA" value={String(lectura.ia_modelo ?? "—")} />
              <Campo label="Tokens entrada" value={String(lectura.ia_tokens_entrada ?? "—")} />
              <Campo label="Tokens salida" value={String(lectura.ia_tokens_salida ?? "—")} />
              <Campo label="Costo" value={fmtCosto(lectura.ia_costo_usd as number)} />
              <Campo label="Generado en" value={fmt(String(lectura.generado_at ?? ""))} />
              <Campo label="Número de intento" value={String(lectura.numero_intento ?? 1)} />
            </SectionCard>

            {!!lectura.error_codigo && (
              <SectionCard title="Error">
                <Campo label="Código" value={String(lectura.error_codigo)} />
                <Campo label="Mensaje" value={String(lectura.error_mensaje ?? "—")} />
                {!!lectura.error_detalle && <TextBlock label="Detalle" text={String(lectura.error_detalle)} />}
              </SectionCard>
            )}

            <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
                <span className="text-sm font-semibold text-gray-200">contenido_json</span>
                <span className="text-xs text-gray-600">{JSON.stringify(cj).length} chars</span>
              </div>
              <div className="p-4 overflow-auto max-h-96">
                <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{JSON.stringify(cj, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
