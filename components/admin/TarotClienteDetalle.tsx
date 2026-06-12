"use client";
import { useState, useEffect } from "react";
import { X, Check, AlertTriangle, AlertCircle } from "lucide-react";

// ===========================================================================
// Types
// ===========================================================================

interface Cliente {
  id: string;
  nombre_completo: string;
  telefono: string;
  email: string | null;
  fecha_nacimiento: string | null;
  hora_nacimiento: string | null;
  lugar_nacimiento: string | null;
  acepto_terminos: boolean;
  acepto_privacidad: boolean;
  version_terminos: string;
  created_at: string;
  updated_at: string;
}

interface Pago {
  id: string;
  mp_status: string | null;
  mp_payment_type: string | null;
  mp_installments: number | null;
  monto: number | null;
  moneda: string | null;
  created_at: string;
}

interface Orden {
  id: string;
  estado: string;
  tema: string;
  pregunta_usuario: string | null;
  precio_cobrado: number;
  moneda: string;
  created_at: string;
  tarot_pagos: Pago[];
}

interface CuponUso {
  id: string;
  codigo: string;
  estado_uso: string;
  moneda: string | null;
  precio_original: number | null;
  precio_aplicado: number | null;
  descuento_aplicado: number | null;
  fecha_aplicacion: string | null;
}

interface DetalleData {
  ok: boolean;
  cliente: Cliente;
  ordenes: Orden[];
  cupones: CuponUso[];
}

// ===========================================================================
// Helpers
// ===========================================================================

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch { return iso; }
}

function truncar(s: string | null | undefined, max = 60): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ===========================================================================
// Badge helpers
// ===========================================================================

const ORDEN_ESTADO_CLS: Record<string, string> = {
  formulario_completo:  "bg-gray-800 text-gray-400",
  pago_iniciado:        "bg-amber-900/50 text-amber-300",
  pago_confirmado:      "bg-sky-900/50 text-sky-300",
  generando_lectura:    "bg-violet-900/50 text-violet-300",
  lectura_lista:        "bg-blue-900/50 text-blue-300",
  generando_pdf:        "bg-violet-900/50 text-violet-300",
  pdf_listo:            "bg-teal-900/50 text-teal-300",
  enviando_whatsapp:    "bg-teal-900/50 text-teal-300",
  entregado:            "bg-emerald-900/50 text-emerald-300",
  error_lectura:        "bg-red-900/50 text-red-300",
  error_pdf:            "bg-red-900/50 text-red-300",
  error_whatsapp:       "bg-red-900/50 text-red-300",
  error_critico:        "bg-red-900/50 text-red-300",
};

function estadoOrdenCls(estado: string) {
  return ORDEN_ESTADO_CLS[estado] ?? "bg-gray-800 text-gray-400";
}

function mpStatusCls(status: string | null) {
  if (status === "approved") return "bg-emerald-900/40 text-emerald-300";
  if (status === "rejected" || status === "cancelled") return "bg-red-900/40 text-red-300";
  if (status === "pending" || status === "in_process") return "bg-amber-900/40 text-amber-300";
  return "bg-gray-800 text-gray-400";
}

function cuponEstadoCls(estado: string) {
  if (estado === "aplicado") return "bg-emerald-900/40 text-emerald-300";
  if (estado === "reservado") return "bg-amber-900/40 text-amber-300";
  if (estado === "cancelado" || estado === "expirado") return "bg-gray-800 text-gray-400";
  return "bg-gray-800 text-gray-400";
}

// ===========================================================================
// Sub-components
// ===========================================================================

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
      <span className="w-40 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

// ===========================================================================
// EditarDatosForm
// ===========================================================================

interface DatosEditables {
  nombre_completo: string;
  email: string;
  telefono: string;
  fecha_nacimiento: string;
}

function EditarDatosForm({
  cliente,
  onGuardado,
}: {
  cliente: Cliente;
  onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosEditables>({
    nombre_completo: cliente.nombre_completo,
    email: cliente.email ?? "",
    telefono: cliente.telefono,
    fecha_nacimiento: cliente.fecha_nacimiento ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  function abrir() {
    setDatos({
      nombre_completo: cliente.nombre_completo,
      email: cliente.email ?? "",
      telefono: cliente.telefono,
      fecha_nacimiento: cliente.fecha_nacimiento ?? "",
    });
    setResultado(null);
    setAbierto(true);
  }

  function cancelar() {
    if (submitting) return;
    setAbierto(false);
    setResultado(null);
  }

  async function guardar() {
    if (submitting || !datos.nombre_completo.trim()) return;
    setSubmitting(true);
    setResultado(null);

    try {
      const res = await fetch(`/api/admin/tarot/clientes/${cliente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_completo: datos.nombre_completo,
          email: datos.email || null,
          telefono: datos.telefono,
          fecha_nacimiento: datos.fecha_nacimiento || null,
        }),
      });
      let json: Record<string, unknown>;
      try { json = await res.json(); } catch { json = {}; }

      if (!res.ok || !json.ok) {
        setResultado({
          ok: false,
          texto: (json.detalle as string) ?? (json.motivo as string) ?? `Error HTTP ${res.status}`,
        });
      } else {
        setResultado({ ok: true, texto: "Datos guardados correctamente." });
        setTimeout(() => { cancelar(); onGuardado(); }, 1500);
      }
    } catch (e: unknown) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={abrir}
        className="text-xs px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors"
      >
        Editar datos básicos
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-800/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-white">Editar datos básicos</span>
        <button onClick={cancelar} disabled={submitting} className="text-gray-500 hover:text-gray-300 disabled:opacity-40">
          <X size={15} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nombre completo <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={datos.nombre_completo}
            onChange={(e) => setDatos((p) => ({ ...p, nombre_completo: e.target.value }))}
            disabled={submitting}
            className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Teléfono</label>
          <input
            type="text"
            value={datos.telefono}
            onChange={(e) => setDatos((p) => ({ ...p, telefono: e.target.value }))}
            disabled={submitting}
            className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Email</label>
          <input
            type="email"
            value={datos.email}
            onChange={(e) => setDatos((p) => ({ ...p, email: e.target.value }))}
            disabled={submitting}
            className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Fecha de nacimiento</label>
          <input
            type="date"
            value={datos.fecha_nacimiento}
            onChange={(e) => setDatos((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
            disabled={submitting}
            className="w-full border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
        </div>
      </div>

      {resultado && (
        <div className={`mt-3 text-xs rounded px-3 py-2 flex items-start gap-2 ${resultado.ok ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/40" : "bg-red-950/50 text-red-300 border border-red-800/40"}`}>
          {resultado.ok ? <Check size={12} className="shrink-0 mt-0.5" /> : <AlertTriangle size={12} className="shrink-0 mt-0.5" />}
          <span>{resultado.texto}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={cancelar} disabled={submitting} className="text-xs px-3 py-1.5 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={!datos.nombre_completo.trim() || submitting}
          className="text-xs px-4 py-1.5 rounded-lg border border-amber-700 bg-amber-900/50 text-amber-200 hover:bg-amber-800/60 font-medium transition-colors disabled:opacity-40"
        >
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export interface TarotClienteDetalleProps {
  id: string;
  onClose: () => void;
}

export function TarotClienteDetalle({ id, onClose }: TarotClienteDetalleProps) {
  const [data, setData] = useState<DetalleData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setCargando(true);
    setErrorMsg(null);
    setData(null);
    fetch(`/api/admin/tarot/clientes/${id}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || !json.ok) {
          setErrorMsg(json?.motivo ?? "Error al cargar el cliente");
        } else {
          setData(json as DetalleData);
        }
      })
      .catch((e: unknown) => setErrorMsg(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setCargando(false));
  }, [id, refreshKey]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-medium text-white">
            {data ? data.cliente.nombre_completo : "Detalle cliente"}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {cargando && (
            <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Cargando…</p>
          )}

          {!cargando && errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} className="shrink-0" />
              {errorMsg}
            </div>
          )}

          {!cargando && data && (
            <>
              {/* Datos del cliente */}
              <Sect title="Datos del cliente">
                <DataRow label="Teléfono" value={<span className="font-mono text-xs">{data.cliente.telefono || "—"}</span>} />
                <DataRow label="Email" value={data.cliente.email || "—"} />
                <DataRow label="Fecha nacimiento" value={fmtDate(data.cliente.fecha_nacimiento)} />
                {data.cliente.hora_nacimiento && (
                  <DataRow label="Hora nacimiento" value={data.cliente.hora_nacimiento} />
                )}
                {data.cliente.lugar_nacimiento && (
                  <DataRow label="Lugar nacimiento" value={data.cliente.lugar_nacimiento} />
                )}
                <DataRow label="Aceptó términos" value={data.cliente.acepto_terminos ? "Sí" : "No"} />
                <DataRow label="Aceptó privacidad" value={data.cliente.acepto_privacidad ? "Sí" : "No"} />
                <DataRow label="Versión términos" value={data.cliente.version_terminos || "—"} />
                <DataRow label="Registro" value={fmtFecha(data.cliente.created_at)} />
                <DataRow label="Última actualización" value={fmtFecha(data.cliente.updated_at)} />
              </Sect>

              {/* Órdenes */}
              {data.ordenes.length > 0 && (
                <Sect title={`Órdenes (${data.ordenes.length})`}>
                  <div className="space-y-3">
                    {data.ordenes.map((o) => (
                      <div key={o.id} className="rounded-lg border border-gray-800 bg-gray-800/20 p-3">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoOrdenCls(o.estado)}`}>
                            {o.estado}
                          </span>
                          <span className="text-xs text-amber-300 font-medium capitalize">{o.tema}</span>
                          <span className="text-xs text-gray-400 font-mono ml-auto">{fmtDate(o.created_at)}</span>
                        </div>
                        {o.pregunta_usuario && (
                          <p className="text-xs text-gray-400 mb-2 italic">&ldquo;{truncar(o.pregunta_usuario, 80)}&rdquo;</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="text-gray-300 font-medium">{o.precio_cobrado} {o.moneda}</span>
                          <span className="font-mono text-gray-600 text-xs">{o.id.slice(0, 8)}…</span>
                        </div>

                        {/* Pagos de la orden */}
                        {o.tarot_pagos && o.tarot_pagos.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-1">
                            {o.tarot_pagos.map((p) => (
                              <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded ${mpStatusCls(p.mp_status)}`}>
                                  {p.mp_status ?? "—"}
                                </span>
                                {p.monto != null && (
                                  <span className="text-gray-300">{p.monto} {p.moneda}</span>
                                )}
                                {p.mp_payment_type && (
                                  <span className="text-gray-500">{p.mp_payment_type}</span>
                                )}
                                {p.mp_installments && p.mp_installments > 1 && (
                                  <span className="text-gray-500">{p.mp_installments} cuotas</span>
                                )}
                                <span className="text-gray-600 ml-auto">{fmtDate(p.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Sect>
              )}

              {data.ordenes.length === 0 && (
                <Sect title="Órdenes">
                  <p className="text-sm text-gray-500">Sin órdenes registradas.</p>
                </Sect>
              )}

              {/* Cupones usados */}
              {data.cupones.length > 0 && (
                <Sect title="Cupones usados">
                  <div className="space-y-1.5">
                    {data.cupones.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-3 text-xs bg-gray-800/30 rounded px-3 py-2">
                        <span className="text-amber-300 font-mono font-semibold">{c.codigo}</span>
                        <span className={`px-1.5 py-0.5 rounded ${cuponEstadoCls(c.estado_uso)}`}>
                          {c.estado_uso}
                        </span>
                        {c.descuento_aplicado != null && (
                          <span className="text-emerald-400">-{c.descuento_aplicado} {c.moneda}</span>
                        )}
                        {c.precio_aplicado != null && (
                          <span className="text-gray-400">→ {c.precio_aplicado} {c.moneda}</span>
                        )}
                        <span className="text-gray-500 ml-auto">{fmtDate(c.fecha_aplicacion)}</span>
                      </div>
                    ))}
                  </div>
                </Sect>
              )}

              {/* Editar datos */}
              <Sect title="Editar datos básicos">
                <EditarDatosForm
                  cliente={data.cliente}
                  onGuardado={() => setRefreshKey((k) => k + 1)}
                />
              </Sect>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
