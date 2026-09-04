"use client";
import { useState, useEffect } from "react";
import { X, FileText, AlertTriangle, Ban, MessageSquarePlus } from "lucide-react";
import type { RegistroFacturacion } from "@/app/admin/tarot/facturacion/page";

const COMPROBANTE_ERRORES: Record<string, string> = {
  numero_comprobante_requerido: "El número de comprobante es obligatorio.",
  fecha_comprobante_invalida: "La fecha del comprobante es obligatoria y debe tener formato válido.",
  comprobante_duplicado: "Ya existe otro registro activo con esa serie y número de comprobante.",
  registro_anulado: "Este registro está anulado — no admite esta acción.",
  motivo_requerido: "El motivo es obligatorio.",
  observacion_requerida: "La observación no puede estar vacía.",
  ya_anulado: "Este registro ya estaba anulado.",
};

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-40 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function fmtMonto(n: number, moneda: string) {
  return `${moneda} ${n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const MEDIO_PAGO_LABEL: Record<string, string> = { mercado_pago: "Mercado Pago", manual: "Manual" };
const COMPROBANTE_ESTADO_LABEL: Record<string, string> = { no_solicitado: "No solicitado", pendiente: "Pendiente", emitido: "Emitido" };

async function llamarAccion(id: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/admin/tarot/facturacion/${id}/accion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return { ok: res.ok && data.ok === true, motivo: data.motivo as string | undefined };
}

export function TarotFacturacionDetalle({
  registroInicial,
  onClose,
  onSuccess,
}: {
  registroInicial: RegistroFacturacion;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [registro, setRegistro] = useState<RegistroFacturacion>(registroInicial);
  const [orden, setOrden] = useState<{ external_reference: string | null; estado: string } | null>(null);
  const [cargando, setCargando] = useState(true);

  const [modal, setModal] = useState<null | "comprobante" | "anular" | "observacion">(null);
  const [enviando, setEnviando] = useState(false);
  const [errModal, setErrModal] = useState<string | null>(null);

  // Formulario comprobante
  const [tipoComprobante, setTipoComprobante] = useState("");
  const [serieComprobante, setSerieComprobante] = useState("");
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [fechaComprobante, setFechaComprobante] = useState("");
  // Anulación / observación
  const [motivo, setMotivo] = useState("");
  const [observacion, setObservacion] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const res = await fetch(`/api/admin/tarot/facturacion/${registroInicial.id}`);
        const data = await res.json().catch(() => null);
        if (vivo && res.ok && data?.ok) {
          setRegistro(data.registro);
          setOrden(data.orden);
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registroInicial.id]);

  function abrirComprobante() {
    setTipoComprobante(registro.tipo_comprobante ?? "");
    setSerieComprobante(registro.serie_comprobante ?? "");
    setNumeroComprobante(registro.numero_comprobante ?? "");
    setFechaComprobante(registro.fecha_comprobante ?? new Date().toISOString().slice(0, 10));
    setErrModal(null);
    setModal("comprobante");
  }

  async function marcarSolicitado() {
    setEnviando(true);
    const r = await llamarAccion(registro.id, { accion: "marcar_solicitado" });
    setEnviando(false);
    if (r.ok) onSuccess?.(); else setErrModal(COMPROBANTE_ERRORES[r.motivo ?? ""] ?? r.motivo ?? "Error");
  }

  async function confirmarComprobante() {
    if (!numeroComprobante.trim()) { setErrModal(COMPROBANTE_ERRORES.numero_comprobante_requerido); return; }
    if (!fechaComprobante) { setErrModal(COMPROBANTE_ERRORES.fecha_comprobante_invalida); return; }
    setEnviando(true);
    setErrModal(null);
    const esEdicion = registro.estado_comprobante === "emitido";
    const r = await llamarAccion(registro.id, {
      accion: esEdicion ? "corregir_comprobante" : "registrar_comprobante",
      tipo_comprobante: tipoComprobante || null,
      serie_comprobante: serieComprobante || null,
      numero_comprobante: numeroComprobante.trim(),
      fecha_comprobante: fechaComprobante,
    });
    setEnviando(false);
    if (r.ok) { setModal(null); onSuccess?.(); }
    else setErrModal(COMPROBANTE_ERRORES[r.motivo ?? ""] ?? r.motivo ?? "Error");
  }

  async function confirmarObservacion() {
    if (!observacion.trim()) { setErrModal(COMPROBANTE_ERRORES.observacion_requerida); return; }
    setEnviando(true);
    setErrModal(null);
    const r = await llamarAccion(registro.id, { accion: "agregar_observacion", observacion: observacion.trim() });
    setEnviando(false);
    if (r.ok) { setModal(null); onSuccess?.(); }
    else setErrModal(r.motivo ?? "Error");
  }

  async function confirmarAnulacion() {
    if (!motivo.trim()) { setErrModal(COMPROBANTE_ERRORES.motivo_requerido); return; }
    setEnviando(true);
    setErrModal(null);
    const r = await llamarAccion(registro.id, { accion: "anular", motivo: motivo.trim() });
    setEnviando(false);
    if (r.ok) { setModal(null); onSuccess?.(); }
    else setErrModal(COMPROBANTE_ERRORES[r.motivo ?? ""] ?? r.motivo ?? "Error");
  }

  const anulado = registro.estado_registro === "anulado";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">

        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div>
            <span className="text-sm font-medium text-white font-mono">{registro.codigo_interno}</span>
            {anulado && <span className="ml-2 text-xs text-red-400">· ANULADO</span>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {anulado && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-3">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1.5">Registro anulado</p>
              <DataRow label="Motivo" value={registro.anulado_motivo ?? "—"} />
              <DataRow label="Fecha" value={fmtFecha(registro.anulado_at)} />
              <DataRow label="Por" value={registro.anulado_por ?? "—"} />
            </div>
          )}

          {/* 1. Venta */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Venta</h3>
            <DataRow label="N° interno" value={<span className="font-mono">{registro.codigo_interno}</span>} />
            <DataRow label="Fecha" value={fmtFecha(registro.fecha_venta)} />
            <DataRow label="Producto" value={registro.producto_nombre_snapshot} />
            <DataRow label="Concepto" value={registro.concepto} />
            <DataRow label="Importe bruto" value={fmtMonto(registro.importe_bruto, registro.moneda)} />
            <DataRow label="Descuento" value={fmtMonto(registro.descuento, registro.moneda)} />
            <DataRow label="Total (neto)" value={<span className="font-semibold text-amber-300">{fmtMonto(registro.importe_neto, registro.moneda)}</span>} />
          </div>

          {/* 2. Cliente (snapshot) */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Cliente (al momento de la venta)</h3>
            <DataRow label="Nombre" value={registro.datos_cliente_snapshot?.nombre ?? "—"} />
            <DataRow label="Email" value={registro.datos_cliente_snapshot?.email ?? "—"} />
            <DataRow label="Teléfono" value={registro.datos_cliente_snapshot?.telefono ?? "—"} />
          </div>

          {/* 3. Pago */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Pago</h3>
            <DataRow label="Medio" value={MEDIO_PAGO_LABEL[registro.medio_pago] ?? registro.medio_pago} />
            <DataRow label="Proveedor" value={registro.proveedor_pago ?? "—"} />
            <DataRow label="Referencia" value={<span className="font-mono text-xs">{registro.referencia_pago ?? "—"}</span>} />
          </div>

          {/* 4. Orden */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Orden</h3>
            <DataRow label="Orden ID" value={<span className="font-mono text-xs">{registro.orden_id}</span>} />
            {!cargando && orden && (
              <>
                <DataRow label="Referencia externa" value={<span className="font-mono text-xs">{orden.external_reference ?? "—"}</span>} />
                <DataRow label="Estado actual" value={<span className="font-mono text-xs text-gray-400">{orden.estado}</span>} />
              </>
            )}
            <a
              href={`/admin/tarot/ordenes?orden_id=${registro.orden_id}`}
              className="inline-block mt-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              Ver orden en el panel →
            </a>
          </div>

          {/* 5. Comprobante fiscal */}
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Comprobante fiscal</h3>
            <p className="text-xs text-gray-600 mb-3">
              Este registro NO es un comprobante fiscal. Acá solo se anota la boleta/factura que ya se emitió por fuera del sistema.
            </p>
            <DataRow label="Solicitado" value={registro.comprobante_solicitado ? "Sí" : "No"} />
            <DataRow label="Estado" value={COMPROBANTE_ESTADO_LABEL[registro.estado_comprobante] ?? registro.estado_comprobante} />
            {registro.estado_comprobante === "emitido" && (
              <>
                <DataRow label="Tipo" value={registro.tipo_comprobante ?? "—"} />
                <DataRow label="Serie / Número" value={`${registro.serie_comprobante ?? "—"} ${registro.numero_comprobante ?? ""}`.trim()} />
                <DataRow label="Fecha comprobante" value={registro.fecha_comprobante ?? "—"} />
              </>
            )}
            {registro.observaciones && <DataRow label="Observaciones" value={registro.observaciones} />}
          </div>

          {errModal && !modal && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{errModal}</div>
          )}

          {/* Acciones */}
          {!anulado && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
              {!registro.comprobante_solicitado && (
                <button
                  onClick={marcarSolicitado}
                  disabled={enviando}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <FileText size={13} /> Cliente solicitó comprobante
                </button>
              )}
              <button
                onClick={abrirComprobante}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
              >
                <FileText size={13} />
                {registro.estado_comprobante === "emitido" ? "Corregir comprobante" : "Registrar comprobante"}
              </button>
              <button
                onClick={() => { setObservacion(registro.observaciones ?? ""); setErrModal(null); setModal("observacion"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
              >
                <MessageSquarePlus size={13} /> Agregar observación
              </button>
              <button
                onClick={() => { setMotivo(""); setErrModal(null); setModal("anular"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-950/50 hover:bg-red-900/60 text-red-300 rounded-lg transition-colors ml-auto"
              >
                <Ban size={13} /> Anular registro
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal comprobante */}
      {modal === "comprobante" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!enviando) setModal(null); }} />
          <div className="relative z-10 w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">
                {registro.estado_comprobante === "emitido" ? "Corregir comprobante" : "Registrar comprobante"}
              </h3>
              <button onClick={() => { if (!enviando) setModal(null); }} disabled={enviando} className="text-gray-500 hover:text-white p-1 rounded transition-colors disabled:opacity-50">
                <X size={14} />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300 leading-relaxed">
                Solo registrá acá una boleta/factura que YA emitiste por fuera del sistema. Esto no genera ningún número fiscal.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Tipo de comprobante</label>
                <input value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value)} disabled={enviando}
                  placeholder="Ej: Boleta contado"
                  className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 placeholder-gray-600 disabled:opacity-50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Serie</label>
                  <input value={serieComprobante} onChange={(e) => setSerieComprobante(e.target.value)} disabled={enviando}
                    placeholder="A"
                    className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 placeholder-gray-600 disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Número *</label>
                  <input value={numeroComprobante} onChange={(e) => setNumeroComprobante(e.target.value)} disabled={enviando}
                    placeholder="000123"
                    className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 placeholder-gray-600 disabled:opacity-50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Fecha *</label>
                <input type="date" value={fechaComprobante} onChange={(e) => setFechaComprobante(e.target.value)} disabled={enviando}
                  className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50" />
              </div>
            </div>

            {errModal && <div className="mt-3 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{errModal}</div>}

            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => { if (!enviando) setModal(null); }} disabled={enviando} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarComprobante} disabled={enviando} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg transition-colors">
                {enviando ? "Guardando…" : "Guardar comprobante"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal observación */}
      {modal === "observacion" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!enviando) setModal(null); }} />
          <div className="relative z-10 w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Agregar observación</h3>
              <button onClick={() => { if (!enviando) setModal(null); }} disabled={enviando} className="text-gray-500 hover:text-white p-1 rounded transition-colors disabled:opacity-50">
                <X size={14} />
              </button>
            </div>
            <textarea
              value={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={enviando} rows={4} maxLength={1000}
              placeholder="Nota administrativa sobre esta venta…"
              className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 resize-none placeholder-gray-600 disabled:opacity-50"
            />
            {errModal && <div className="mt-3 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{errModal}</div>}
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => { if (!enviando) setModal(null); }} disabled={enviando} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarObservacion} disabled={enviando} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg transition-colors">
                {enviando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal anular */}
      {modal === "anular" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!enviando) setModal(null); }} />
          <div className="relative z-10 w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Anular registro</h3>
              <button onClick={() => { if (!enviando) setModal(null); }} disabled={enviando} className="text-gray-500 hover:text-white p-1 rounded transition-colors disabled:opacity-50">
                <X size={14} />
              </button>
            </div>
            <div className="mb-4 rounded-lg border border-red-700/30 bg-red-950/20 px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300 leading-relaxed">
                No se borra el registro — queda marcado como anulado, con motivo y fecha, siempre visible en el historial. Si el pago
                sigue cobrado en Mercado Pago, esto NO lo reembolsa: es solo una anulación administrativa interna.
              </p>
            </div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Motivo *</label>
            <textarea
              value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={enviando} rows={3} maxLength={500}
              placeholder="Ej: venta duplicada, orden cancelada por el cliente…"
              className="w-full border border-gray-700 rounded-lg bg-gray-800 text-sm text-white px-3 py-2 focus:outline-none focus:border-red-500 resize-none placeholder-gray-600 disabled:opacity-50"
            />
            {errModal && <div className="mt-3 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{errModal}</div>}
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => { if (!enviando) setModal(null); }} disabled={enviando} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarAnulacion} disabled={enviando || !motivo.trim()} className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg transition-colors">
                {enviando ? "Anulando…" : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
