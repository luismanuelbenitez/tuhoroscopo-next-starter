"use client";
import { useState, useEffect } from "react";
import { X, AlertCircle, RotateCcw, Check, AlertTriangle } from "lucide-react";

interface Lectura {
  id: string;
  orden_id: string;
  estado: string;
  numero_intento: number;
  es_vigente: boolean;
  ia_modelo: string | null;
  ia_tokens_entrada: number | null;
  ia_tokens_salida: number | null;
  ia_costo_usd: number | null;
  contenido_json: unknown;
  resumen_lectura: string | null;
  mensaje_final: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  error_detalle: unknown;
  generado_at: string | null;
  created_at: string;
}

interface Orden { id: string; estado: string }

const ESTADO_CLS: Record<string, string> = {
  pendiente:        "bg-gray-800 text-gray-400",
  generando:        "bg-amber-900/50 text-amber-300",
  generada:         "bg-emerald-900/50 text-emerald-300",
  error_generacion: "bg-red-900/50 text-red-300",
  invalidada:       "bg-gray-800 text-gray-500",
};

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-40 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function ContenidoJson({ data }: { data: unknown }) {
  if (!data) return <p className="text-xs text-gray-500 italic">Sin contenido generado.</p>;

  let obj: Record<string, unknown> = {};
  if (typeof data === "string") {
    try { obj = JSON.parse(data); } catch { return <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">{data}</pre>; }
  } else if (typeof data === "object" && !Array.isArray(data)) {
    obj = data as Record<string, unknown>;
  }

  const entries = Object.entries(obj);
  if (entries.length === 0) return <p className="text-xs text-gray-500 italic">Sin campos.</p>;

  return (
    <div className="space-y-3">
      {entries.map(([key, val]) => (
        <div key={key} className="rounded-lg border border-gray-800 bg-gray-800/20 p-3">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1.5">
            {key.replace(/_/g, " ")}
          </p>
          {typeof val === "object" && val !== null ? (
            <div className="space-y-1.5">
              {Object.entries(val as Record<string, unknown>).map(([k2, v2]) => (
                <div key={k2}>
                  <span className="text-xs text-gray-500 uppercase">{k2.replace(/_/g, " ")}: </span>
                  <span className="text-xs text-gray-300">{String(v2 ?? "—")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{String(val ?? "—")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function TarotLecturaDetalle({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accionEstado, setAccionEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [accionMsg, setAccionMsg] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/admin/tarot/lecturas/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) { setErrorMsg(json.motivo ?? "Error"); return; }
        setLectura(json.lectura);
        setOrden(json.orden ?? null);
      })
      .catch(() => setErrorMsg("Error de red"))
      .finally(() => setCargando(false));
  }, [id]);

  async function reintentar() {
    if (!lectura || accionEstado === "enviando") return;
    setAccionEstado("enviando");
    setAccionMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/ordenes/${lectura.orden_id}/accion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reintentar_lectura" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setAccionEstado("ok");
        setAccionMsg("Lectura encolada. El proceso puede tardar 30-60 segundos.");
      } else {
        setAccionEstado("error");
        setAccionMsg(json.detalle ?? json.motivo ?? `Error ${res.status}`);
      }
    } catch (e: unknown) {
      setAccionEstado("error");
      setAccionMsg(e instanceof Error ? e.message : "Error de red");
    }
  }

  const puedeReintentar =
    lectura?.estado === "error_generacion" &&
    (orden?.estado === "error_lectura" || orden?.estado === "pago_confirmado");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-white">Detalle lectura</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {cargando && <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Cargando…</p>}
          {!cargando && errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} className="shrink-0" />{errorMsg}
            </div>
          )}

          {!cargando && lectura && (
            <>
              {/* Datos generales */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Datos de la lectura</h3>
                <DataRow label="Estado" value={
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CLS[lectura.estado] ?? "bg-gray-800 text-gray-400"}`}>
                    {lectura.estado}
                  </span>
                } />
                <DataRow label="Orden ID" value={<span className="font-mono text-xs">{lectura.orden_id}</span>} />
                <DataRow label="Intento N°" value={lectura.numero_intento} />
                <DataRow label="Vigente" value={lectura.es_vigente ? "Sí" : "No"} />
                <DataRow label="Modelo IA" value={lectura.ia_modelo ?? "—"} />
                <DataRow label="Tokens entrada" value={lectura.ia_tokens_entrada ?? "—"} />
                <DataRow label="Tokens salida" value={lectura.ia_tokens_salida ?? "—"} />
                <DataRow label="Costo USD" value={lectura.ia_costo_usd != null ? `$${Number(lectura.ia_costo_usd).toFixed(4)}` : "—"} />
                <DataRow label="Generado" value={fmtFecha(lectura.generado_at)} />
                <DataRow label="Creado" value={fmtFecha(lectura.created_at)} />
              </div>

              {/* Error info */}
              {lectura.estado === "error_generacion" && (
                <div className="mb-5 rounded-lg border border-red-800/50 bg-red-950/20 p-3">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Error</p>
                  {lectura.error_codigo && <p className="text-xs text-red-300 mb-1"><span className="text-gray-500">Código:</span> {lectura.error_codigo}</p>}
                  {lectura.error_mensaje && <p className="text-xs text-red-200 whitespace-pre-wrap">{lectura.error_mensaje}</p>}
                  {!!lectura.error_detalle && (
                    <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-all">
                      {typeof lectura.error_detalle === "string" ? lectura.error_detalle : JSON.stringify(lectura.error_detalle, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* Resumen */}
              {lectura.resumen_lectura && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Resumen</h3>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{lectura.resumen_lectura}</p>
                </div>
              )}

              {/* Mensaje final */}
              {lectura.mensaje_final && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Mensaje final</h3>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{lectura.mensaje_final}</p>
                </div>
              )}

              {/* Contenido (cartas) */}
              {lectura.contenido_json && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Contenido de la tirada</h3>
                  <ContenidoJson data={lectura.contenido_json} />
                </div>
              )}

              {/* Acción reintentar */}
              <div className="mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Acciones</h3>
                {puedeReintentar ? (
                  <div>
                    <button
                      onClick={reintentar}
                      disabled={accionEstado === "enviando" || accionEstado === "ok"}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      {accionEstado === "enviando" ? "Enviando…" : "Reintentar lectura"}
                    </button>
                    {accionMsg && (
                      <p className={`mt-1.5 text-xs flex items-center gap-1 ${accionEstado === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                        {accionEstado === "ok" ? <Check size={11} /> : <AlertTriangle size={11} />}
                        {accionMsg}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">
                    {lectura.estado === "generada"
                      ? "Lectura generada correctamente. No se necesita acción."
                      : "No disponible en el estado actual de la orden."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
