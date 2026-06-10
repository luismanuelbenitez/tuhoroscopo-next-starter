"use client";
import { useEffect, useState } from "react";
import { X, ExternalLink, AlertCircle } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface Orden {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string;
  estado: string;
  external_reference: string;
  pregunta_usuario: string;
  tema: string;
  precio_cobrado: number;
  moneda: string;
  origen_canal: string;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
  estado_resumen: string;
  warnings: string[];
}

interface Lectura {
  id: string;
  estado: string;
  numero_intento: number;
  es_vigente: boolean;
  ia_modelo: string;
  ia_tokens_entrada: number;
  ia_tokens_salida: number;
  ia_costo_usd: number;
  resumen_lectura: string | null;
  mensaje_final: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  created_at: string;
  warnings: string[];
}

interface Pdf {
  id: string;
  estado: string;
  numero_intento: number;
  storage_url: string | null;
  tamano_bytes: number | null;
  paginas: number | null;
  plantilla_usada: string;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  url_expira_at: string | null;
  warnings: string[];
}

interface Pago {
  id: string;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  mp_payment_type: string | null;
  monto: number | null;
  moneda: string | null;
  webhook_received_at: string | null;
  warnings: string[];
}

// ============================================================================
// Helpers
// ============================================================================

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
}

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-44 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const ESTADO_ORDEN: Record<string, { label: string; cls: string }> = {
  formulario_completo:  { label: "Formulario",    cls: "bg-gray-800 text-gray-400" },
  pago_iniciado:        { label: "Pago iniciado", cls: "bg-amber-900/50 text-amber-300" },
  pago_confirmado:      { label: "Pago ok",       cls: "bg-sky-900/50 text-sky-300" },
  pago_rechazado:       { label: "Rechazado",     cls: "bg-red-900/50 text-red-300" },
  pago_expirado:        { label: "Expirado",      cls: "bg-red-900/50 text-red-300" },
  generando_lectura:    { label: "Generando IA",  cls: "bg-amber-900/50 text-amber-300" },
  lectura_lista:        { label: "Lectura lista", cls: "bg-sky-900/50 text-sky-300" },
  generando_pdf:        { label: "Generando PDF", cls: "bg-amber-900/50 text-amber-300" },
  pdf_listo:            { label: "PDF listo",     cls: "bg-violet-900/50 text-violet-300" },
  enviando_whatsapp:    { label: "Enviando WA",   cls: "bg-amber-900/50 text-amber-300" },
  entregado:            { label: "Entregado",     cls: "bg-emerald-900/50 text-emerald-300" },
  error_lectura:        { label: "Error lectura", cls: "bg-red-900/50 text-red-300" },
  error_pdf:            { label: "Error PDF",     cls: "bg-red-900/50 text-red-300" },
  error_whatsapp:       { label: "Error WA",      cls: "bg-red-900/50 text-red-300" },
  error_critico:        { label: "Error crítico", cls: "bg-red-900/50 text-red-400 font-bold" },
  cancelado:            { label: "Cancelado",     cls: "bg-gray-800 text-gray-400" },
};

const ESTADO_LECTURA: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: "Pendiente",   cls: "bg-gray-800 text-gray-400" },
  generando:   { label: "Generando",  cls: "bg-amber-900/50 text-amber-300" },
  completada:  { label: "Completada", cls: "bg-emerald-900/50 text-emerald-300" },
  error:       { label: "Error",      cls: "bg-red-900/50 text-red-300" },
};

const ESTADO_PDF: Record<string, { label: string; cls: string }> = {
  pendiente:        { label: "Pendiente",      cls: "bg-gray-800 text-gray-400" },
  generando:        { label: "Generando",      cls: "bg-amber-900/50 text-amber-300" },
  generado:         { label: "Generado",       cls: "bg-emerald-900/50 text-emerald-300" },
  error_generacion: { label: "Error",          cls: "bg-red-900/50 text-red-300" },
  invalidado:       { label: "Invalidado",     cls: "bg-gray-800 text-gray-400" },
};

const ESTADO_PAGO: Record<string, { label: string; cls: string }> = {
  pending:      { label: "Pendiente",    cls: "bg-amber-900/50 text-amber-300" },
  approved:     { label: "Aprobado",    cls: "bg-emerald-900/50 text-emerald-300" },
  in_process:   { label: "En proceso",  cls: "bg-sky-900/50 text-sky-300" },
  rejected:     { label: "Rechazado",   cls: "bg-red-900/50 text-red-300" },
  cancelled:    { label: "Cancelado",   cls: "bg-gray-800 text-gray-400" },
  refunded:     { label: "Reembolsado", cls: "bg-orange-900/50 text-orange-300" },
  charged_back: { label: "Contracargo", cls: "bg-red-900/50 text-red-400 font-bold" },
};

// ============================================================================
// Component
// ============================================================================

export function TarotOrdenDetalle({ orden, onClose }: { orden: Orden; onClose: () => void }) {
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [errorRelated, setErrorRelated] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRelated() {
      setLoadingRelated(true);
      setErrorRelated(null);
      try {
        const [rLect, rPdfs, rPagos] = await Promise.all([
          fetch(`/api/admin/tarot/lecturas?orden_id=${orden.id}&limit=10`),
          fetch(`/api/admin/tarot/pdfs?orden_id=${orden.id}&limit=5`),
          fetch(`/api/admin/tarot/pagos?orden_id=${orden.id}&limit=5`),
        ]);
        const [dLect, dPdfs, dPagos] = await Promise.all([
          rLect.json().catch(() => ({})),
          rPdfs.json().catch(() => ({})),
          rPagos.json().catch(() => ({})),
        ]);
        setLecturas(dLect.lecturas ?? []);
        setPdfs(dPdfs.pdfs ?? []);
        setPagos(dPagos.pagos ?? []);
      } catch (e: unknown) {
        setErrorRelated(e instanceof Error ? e.message : "Error al cargar datos relacionados");
      } finally {
        setLoadingRelated(false);
      }
    }
    fetchRelated();
  }, [orden.id]);

  const estadoOrden = ESTADO_ORDEN[orden.estado] ?? { label: orden.estado, cls: "bg-gray-800 text-gray-400" };
  const lectura = lecturas.find((l) => l.es_vigente) ?? lecturas[0];
  const pdf = pdfs[0];
  const pago = pagos.find((p) => p.mp_status === "approved") ?? pagos[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700/60">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-white">Orden Tarot</span>
            <Badge text={estadoOrden.label} cls={estadoOrden.cls} />
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Warnings */}
          {orden.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{orden.warnings.join(" · ")}</span>
            </div>
          )}

          {/* Orden */}
          <Sect title="Orden">
            <DataRow label="ID" value={<span className="font-mono text-xs">{orden.id}</span>} />
            <DataRow label="Referencia MP" value={<span className="font-mono text-xs">{orden.external_reference}</span>} />
            <DataRow label="Estado" value={<Badge text={estadoOrden.label} cls={estadoOrden.cls} />} />
            <DataRow label="Tema" value={orden.tema} />
            <DataRow label="Precio" value={`${orden.moneda} ${orden.precio_cobrado}`} />
            <DataRow label="Canal" value={orden.origen_canal} />
            <DataRow label="Creada" value={fmt(orden.created_at)} />
            <DataRow label="Actualizada" value={fmt(orden.updated_at)} />
            {orden.notas_internas && (
              <DataRow label="Notas internas" value={<span className="text-amber-300">{orden.notas_internas}</span>} />
            )}
          </Sect>

          {/* Pregunta */}
          {orden.pregunta_usuario && (
            <Sect title="Pregunta del cliente">
              <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/40 rounded-lg px-3 py-2">
                {orden.pregunta_usuario}
              </p>
            </Sect>
          )}

          {/* Cliente */}
          <Sect title="Cliente">
            <DataRow label="ID cliente" value={<span className="font-mono text-xs">{orden.cliente_id}</span>} />
            <DataRow label="Nombre" value={orden.cliente_nombre || "—"} />
            <DataRow label="Teléfono" value={<span className="font-mono">{orden.cliente_telefono || "—"}</span>} />
            <DataRow label="Email" value={orden.cliente_email || "—"} />
          </Sect>

          {/* Pago */}
          <Sect title="Pago Mercado Pago">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>
            ) : pago ? (
              <>
                <DataRow label="Estado MP" value={
                  <Badge
                    text={(ESTADO_PAGO[pago.mp_status ?? ""] ?? { label: pago.mp_status ?? "—", cls: "bg-gray-800 text-gray-400" }).label}
                    cls={(ESTADO_PAGO[pago.mp_status ?? ""] ?? { label: "", cls: "bg-gray-800 text-gray-400" }).cls}
                  />
                } />
                <DataRow label="Detalle" value={pago.mp_status_detail ?? "—"} />
                <DataRow label="Monto" value={pago.monto != null ? `${pago.moneda} ${pago.monto}` : "—"} />
                <DataRow label="Tipo" value={pago.mp_payment_type ?? "—"} />
                <DataRow label="MP Payment ID" value={<span className="font-mono text-xs">{pago.mp_payment_id ?? "—"}</span>} />
                <DataRow label="Webhook recibido" value={fmt(pago.webhook_received_at)} />
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin pago registrado.</p>
            )}
          </Sect>

          {/* Lectura IA */}
          <Sect title="Lectura IA">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>
            ) : lectura ? (
              <>
                <DataRow label="Estado" value={
                  <Badge
                    text={(ESTADO_LECTURA[lectura.estado] ?? { label: lectura.estado, cls: "bg-gray-800 text-gray-400" }).label}
                    cls={(ESTADO_LECTURA[lectura.estado] ?? { label: "", cls: "bg-gray-800 text-gray-400" }).cls}
                  />
                } />
                <DataRow label="Modelo IA" value={<span className="font-mono text-xs">{lectura.ia_modelo}</span>} />
                <DataRow label="Tokens entrada" value={lectura.ia_tokens_entrada.toLocaleString()} />
                <DataRow label="Tokens salida" value={lectura.ia_tokens_salida.toLocaleString()} />
                <DataRow label="Costo USD" value={<span className="font-mono text-xs">${Number(lectura.ia_costo_usd).toFixed(6)}</span>} />
                <DataRow label="Intento #" value={lectura.numero_intento} />
                <DataRow label="Generada" value={fmt(lectura.generado_at)} />
                {lectura.error_mensaje && (
                  <DataRow label="Error" value={<span className="text-red-300">{lectura.error_mensaje}</span>} />
                )}
                {lectura.resumen_lectura && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Resumen</p>
                    <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/40 rounded-lg px-3 py-2">
                      {lectura.resumen_lectura}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin lectura generada aún.</p>
            )}
          </Sect>

          {/* PDF */}
          <Sect title="PDF">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>
            ) : pdf ? (
              <>
                <DataRow label="Estado" value={
                  <Badge
                    text={(ESTADO_PDF[pdf.estado] ?? { label: pdf.estado, cls: "bg-gray-800 text-gray-400" }).label}
                    cls={(ESTADO_PDF[pdf.estado] ?? { label: "", cls: "bg-gray-800 text-gray-400" }).cls}
                  />
                } />
                <DataRow label="Plantilla" value={<span className="font-mono text-xs">{pdf.plantilla_usada}</span>} />
                <DataRow label="Páginas" value={pdf.paginas ?? "—"} />
                <DataRow label="Tamaño" value={pdf.tamano_bytes ? `${(pdf.tamano_bytes / 1024).toFixed(1)} KB` : "—"} />
                <DataRow label="Intento #" value={pdf.numero_intento} />
                <DataRow label="Generado" value={fmt(pdf.generado_at)} />
                <DataRow label="URL expira" value={fmt(pdf.url_expira_at)} />
                {pdf.error_mensaje && (
                  <DataRow label="Error" value={<span className="text-red-300">{pdf.error_mensaje}</span>} />
                )}
                {pdf.storage_url && (
                  <div className="mt-3">
                    <a
                      href={pdf.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 transition-colors"
                    >
                      <ExternalLink size={13} />
                      Abrir PDF
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin PDF generado aún.</p>
            )}
          </Sect>

          {/* Error si falla la carga de relacionados */}
          {errorRelated && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
              <AlertCircle size={15} className="shrink-0" />
              {errorRelated}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
