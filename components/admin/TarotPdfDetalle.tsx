"use client";
import { useState, useEffect } from "react";
import { X, AlertCircle, RotateCcw, Check, AlertTriangle, ExternalLink } from "lucide-react";

interface Pdf {
  id: string;
  orden_id: string;
  lectura_id: string;
  estado: string;
  numero_intento: number;
  es_vigente: boolean;
  storage_url: string | null;
  tamano_bytes: number | null;
  paginas: number | null;
  plantilla_usada: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  error_detalle: unknown;
  generado_at: string | null;
  url_expira_at: string | null;
  created_at: string;
}

interface Orden { id: string; estado: string }

const ESTADO_CLS: Record<string, string> = {
  pendiente:        "bg-gray-800 text-gray-400",
  generando:        "bg-amber-900/50 text-amber-300",
  generado:         "bg-emerald-900/50 text-emerald-300",
  error_generacion: "bg-red-900/50 text-red-300",
  invalidado:       "bg-gray-800 text-gray-500",
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

export function TarotPdfDetalle({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accionEstado, setAccionEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [accionMsg, setAccionMsg] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/admin/tarot/pdfs/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) { setErrorMsg(json.motivo ?? "Error"); return; }
        setPdf(json.pdf);
        setOrden(json.orden ?? null);
      })
      .catch(() => setErrorMsg("Error de red"))
      .finally(() => setCargando(false));
  }, [id]);

  async function reintentar() {
    if (!pdf || accionEstado === "enviando") return;
    setAccionEstado("enviando");
    setAccionMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/ordenes/${pdf.orden_id}/accion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reintentar_pdf" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setAccionEstado("ok");
        setAccionMsg("PDF encolado. El proceso puede tardar 30-60 segundos.");
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
    pdf?.estado === "error_generacion" &&
    (orden?.estado === "error_pdf" || orden?.estado === "lectura_lista");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-white">Detalle PDF</span>
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

          {!cargando && pdf && (
            <>
              {/* Ver PDF link */}
              {pdf.storage_url && (
                <a
                  href={pdf.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-5 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors text-sm font-medium"
                >
                  <ExternalLink size={14} />
                  Ver PDF →
                </a>
              )}

              {/* Datos generales */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Datos del PDF</h3>
                <DataRow label="Estado" value={
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CLS[pdf.estado] ?? "bg-gray-800 text-gray-400"}`}>
                    {pdf.estado}
                  </span>
                } />
                <DataRow label="Orden ID" value={<span className="font-mono text-xs">{pdf.orden_id}</span>} />
                <DataRow label="Lectura ID" value={<span className="font-mono text-xs">{pdf.lectura_id}</span>} />
                <DataRow label="Intento N°" value={pdf.numero_intento} />
                <DataRow label="Vigente" value={pdf.es_vigente ? "Sí" : "No"} />
                <DataRow label="Plantilla" value={pdf.plantilla_usada ?? "—"} />
                <DataRow label="Tamaño" value={pdf.tamano_bytes ? `${(pdf.tamano_bytes / 1024).toFixed(0)} KB` : "—"} />
                <DataRow label="Páginas" value={pdf.paginas ?? "—"} />
                <DataRow label="Generado" value={fmtFecha(pdf.generado_at)} />
                <DataRow label="URL expira" value={fmtFecha(pdf.url_expira_at)} />
                <DataRow label="Creado" value={fmtFecha(pdf.created_at)} />
              </div>

              {/* Error info */}
              {pdf.estado === "error_generacion" && (
                <div className="mb-5 rounded-lg border border-red-800/50 bg-red-950/20 p-3">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Error</p>
                  {pdf.error_codigo && <p className="text-xs text-red-300 mb-1"><span className="text-gray-500">Código:</span> {pdf.error_codigo}</p>}
                  {pdf.error_mensaje && <p className="text-xs text-red-200 whitespace-pre-wrap">{pdf.error_mensaje}</p>}
                  {!!pdf.error_detalle && (
                    <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-all">
                      {typeof pdf.error_detalle === "string" ? pdf.error_detalle : JSON.stringify(pdf.error_detalle, null, 2)}
                    </pre>
                  )}
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
                      {accionEstado === "enviando" ? "Enviando…" : "Reintentar PDF"}
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
                    {pdf.estado === "generado"
                      ? "PDF generado correctamente. No se necesita acción."
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
