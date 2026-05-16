"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  LogOut,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  Tag,
  Search,
  Plus,
  Pencil,
  Power,
} from "lucide-react";

// ===========================================================================
// Types
// ===========================================================================

type CuponComputed = {
  vencido: boolean;
  usos_agotados: boolean;
  tipo_no_soportado_mvp: boolean;
};

type Cupon = {
  id: string;
  codigo: string;
  descripcion: string | null;
  tipo_descuento: string;
  valor_descuento: number | null;
  moneda: string | null;
  precio_recurrente_normal: number | null;
  precio_primera_cuota: number | null;
  cantidad_ciclos_descuento: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  max_usos_total: number | null;
  usos_actuales: number;
  max_usos_por_usuario: number | null;
  solo_nuevos_usuarios: boolean | null;
  solo_usuarios_existentes: boolean | null;
  aplica_a_producto: string | null;
  aplica_a_plan: string | null;
  activo: boolean;
  metadata: Record<string, unknown> | null;
  creado_en: string | null;
  actualizado_en: string | null;
  computed: CuponComputed;
};

type Resumen = {
  total: number;
  activos: number;
  inactivos: number;
  vencidos: number;
  usos_totales: number;
  aplicados_totales: number;
};

type ApiResponse = {
  ok: boolean;
  resumen: Resumen;
  cupones: Cupon[];
};

type Uso = {
  id: string;
  estado_uso: string;
  precio_original: number | null;
  precio_aplicado: number | null;
  valor_descuento_aplicado: number | null;
  fecha_reserva: string | null;
  fecha_aplicacion: string | null;
  fecha_cancelacion: string | null;
  preapproval_id: string | null;
  payment_id: string | null;
  aplicado_por: string | null;
  ultimo_error: string | null;
  creado_en: string | null;
};

type Filtros = {
  busqueda: string;
  activo: string;
  tipo: string;
  vencidos: boolean;
};

type FormData = {
  codigo: string;
  descripcion: string;
  tipo_descuento: string;
  valor_descuento: string;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  max_usos_total: string;
  max_usos_por_usuario: string;
  precio_recurrente_normal: string;
  aplica_a_producto: string;
  aplica_a_plan: string;
};

type Notif = { msg: string; type: "ok" | "error" };

// ===========================================================================
// Constants
// ===========================================================================

const DEFAULT_FILTROS: Filtros = {
  busqueda: "",
  activo: "",
  tipo: "",
  vencidos: false,
};

const DEFAULT_FORM: FormData = {
  codigo: "",
  descripcion: "",
  tipo_descuento: "porcentaje",
  valor_descuento: "",
  activo: true,
  fecha_inicio: "",
  fecha_fin: "",
  max_usos_total: "",
  max_usos_por_usuario: "1",
  precio_recurrente_normal: "390",
  aplica_a_producto: "premium",
  aplica_a_plan: "mensual",
};

const TIPO_LABEL: Record<string, string> = {
  porcentaje: "Porcentaje",
  monto_fijo: "Monto fijo",
  primera_cuota: "Primera cuota",
  dias_gratis: "Días gratis",
  meses_gratis: "Meses gratis",
};

const TIPO_CLS: Record<string, string> = {
  porcentaje: "bg-violet-900/60 text-violet-300 border border-violet-700/50",
  monto_fijo: "bg-sky-900/60 text-sky-300 border border-sky-700/50",
  primera_cuota: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  dias_gratis: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  meses_gratis: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
};

const USO_ESTADO_CLS: Record<string, string> = {
  aplicado: "text-green-400",
  reservado: "text-sky-400",
  cancelado: "text-red-400",
  expirado: "text-gray-500",
  fallido: "text-red-400",
};

// ===========================================================================
// Helpers
// ===========================================================================

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtValor(c: Cupon): string {
  const v = c.valor_descuento;
  const moneda = c.moneda ?? "UYU";
  switch (c.tipo_descuento) {
    case "porcentaje":
      return v !== null ? `${v}%` : "—";
    case "monto_fijo":
      return v !== null ? `$${moneda} ${v}` : "—";
    case "primera_cuota":
      return c.precio_primera_cuota !== null
        ? `$${moneda} ${c.precio_primera_cuota}`
        : "—";
    case "dias_gratis":
      return v !== null ? `${v} días` : "—";
    case "meses_gratis":
      return v !== null ? `${v} mes${v !== 1 ? "es" : ""}` : "—";
    default:
      return v !== null ? String(v) : "—";
  }
}

function buildQuery(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.busqueda) p.set("busqueda", f.busqueda);
  if (f.activo) p.set("activo", f.activo);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.vencidos) p.set("vencidos", "true");
  return p.toString();
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return iso.split("T")[0];
  } catch {
    return "";
  }
}

// ===========================================================================
// Sub-components
// ===========================================================================

function StatCard({
  label,
  value,
  cls = "text-white",
}: {
  label: string;
  value: number;
  cls?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${cls}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const cls =
    TIPO_CLS[tipo] ?? "bg-gray-800 text-gray-400 border border-gray-700/50";
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

function ActivoBadge({ activo, vencido }: { activo: boolean; vencido: boolean }) {
  if (vencido)
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-700/40 font-mono">
        Vencido
      </span>
    );
  if (activo)
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-300 border border-green-700/40 font-mono">
        Activo
      </span>
    );
  return (
    <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700/50 font-mono">
      Inactivo
    </span>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="text-gray-500 text-xs w-48 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs break-all">{value ?? "—"}</span>
    </div>
  );
}

function BoolChip({ val }: { val: boolean | null }) {
  if (val === null) return <span className="text-gray-600 text-xs">—</span>;
  return val ? (
    <CheckCircle2 size={13} className="text-green-400 inline" />
  ) : (
    <X size={13} className="text-red-400 inline" />
  );
}

// ===========================================================================
// Usos list (lazy-loaded)
// ===========================================================================

function UsosList({ codigoId }: { codigoId: string }) {
  const [usos, setUsos] = useState<Uso[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setErr(null);
    fetch(`/api/admin/cupones/usos?codigo_id=${encodeURIComponent(codigoId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setUsos(data.usos);
        else setErr(data.motivo ?? "Error al cargar usos");
      })
      .catch(() => setErr("Error de red"))
      .finally(() => setCargando(false));
  }, [codigoId]);

  if (cargando)
    return <p className="text-xs text-gray-500 animate-pulse py-2">Cargando usos…</p>;
  if (err) return <p className="text-xs text-red-400 py-2">Error: {err}</p>;
  if (!usos || usos.length === 0)
    return <p className="text-xs text-gray-600 py-2">Sin usos registrados.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            {["Estado", "Precio orig.", "Precio apl.", "Descuento", "Fecha aplicación", "Preapproval"].map(
              (h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {usos.map((u) => (
            <tr key={u.id} className="border-b border-gray-800/40 last:border-0 hover:bg-gray-800/20">
              <td className="px-3 py-2">
                <span className={`font-mono ${USO_ESTADO_CLS[u.estado_uso] ?? "text-gray-400"}`}>
                  {u.estado_uso}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-400">
                {u.precio_original !== null ? `$U ${u.precio_original}` : "—"}
              </td>
              <td className="px-3 py-2 text-gray-200">
                {u.precio_aplicado !== null ? `$U ${u.precio_aplicado}` : "—"}
              </td>
              <td className="px-3 py-2 text-violet-400">
                {u.valor_descuento_aplicado !== null ? `-$U ${u.valor_descuento_aplicado}` : "—"}
              </td>
              <td className="px-3 py-2 text-gray-400">{fmtDateTime(u.fecha_aplicacion)}</td>
              <td className="px-3 py-2 font-mono text-gray-600">{u.preapproval_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Modal form (crear / editar)
// ===========================================================================

function CuponModal({
  mode,
  cupon,
  onClose,
  onSuccess,
}: {
  mode: "crear" | "editar";
  cupon: Cupon | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const esEditar = mode === "editar";
  const tieneUsos = esEditar && (cupon?.usos_actuales ?? 0) > 0;

  const [form, setForm] = useState<FormData>(() => {
    if (esEditar && cupon) {
      return {
        codigo: cupon.codigo,
        descripcion: cupon.descripcion ?? "",
        tipo_descuento: cupon.tipo_descuento,
        valor_descuento: cupon.valor_descuento !== null ? String(cupon.valor_descuento) : "",
        activo: cupon.activo,
        fecha_inicio: isoToDateInput(cupon.fecha_inicio),
        fecha_fin: isoToDateInput(cupon.fecha_fin),
        max_usos_total: cupon.max_usos_total !== null ? String(cupon.max_usos_total) : "",
        max_usos_por_usuario:
          cupon.max_usos_por_usuario !== null ? String(cupon.max_usos_por_usuario) : "1",
        precio_recurrente_normal:
          cupon.precio_recurrente_normal !== null ? String(cupon.precio_recurrente_normal) : "390",
        aplica_a_producto: cupon.aplica_a_producto ?? "premium",
        aplica_a_plan: cupon.aplica_a_plan ?? "mensual",
      };
    }
    return { ...DEFAULT_FORM };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function upd(patch: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        accion: esEditar ? "editar" : "crear",
      };

      if (esEditar && cupon) {
        payload.id = cupon.id;
        payload.descripcion = form.descripcion || null;
        payload.activo = form.activo;
        payload.fecha_inicio = form.fecha_inicio || null;
        payload.fecha_fin = form.fecha_fin || null;
        payload.max_usos_total = form.max_usos_total ? Number(form.max_usos_total) : null;
        payload.max_usos_por_usuario = form.max_usos_por_usuario
          ? Number(form.max_usos_por_usuario)
          : null;
        payload.aplica_a_producto = form.aplica_a_producto || null;
        payload.aplica_a_plan = form.aplica_a_plan || null;
        if (!tieneUsos) {
          payload.tipo_descuento = form.tipo_descuento;
          payload.valor_descuento = form.valor_descuento ? Number(form.valor_descuento) : null;
          payload.precio_recurrente_normal = form.precio_recurrente_normal
            ? Number(form.precio_recurrente_normal)
            : null;
        }
      } else {
        payload.codigo = form.codigo.toUpperCase();
        payload.descripcion = form.descripcion || null;
        payload.tipo_descuento = form.tipo_descuento;
        payload.valor_descuento = form.valor_descuento ? Number(form.valor_descuento) : null;
        payload.activo = form.activo;
        payload.fecha_inicio = form.fecha_inicio || null;
        payload.fecha_fin = form.fecha_fin || null;
        payload.max_usos_total = form.max_usos_total ? Number(form.max_usos_total) : null;
        payload.max_usos_por_usuario = form.max_usos_por_usuario
          ? Number(form.max_usos_por_usuario)
          : 1;
        payload.precio_recurrente_normal = form.precio_recurrente_normal
          ? Number(form.precio_recurrente_normal)
          : 390;
        payload.aplica_a_producto = form.aplica_a_producto || "premium";
        payload.aplica_a_plan = form.aplica_a_plan || "mensual";
      }

      const res = await fetch("/api/admin/cupones/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Error al guardar");
      } else {
        const codigo =
          data.cupon?.codigo ?? (esEditar ? cupon?.codigo : form.codigo.toUpperCase());
        onSuccess(
          esEditar ? `Cupón "${codigo}" actualizado.` : `Cupón "${codigo}" creado.`
        );
        onClose();
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  const iCls =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 disabled:opacity-40 disabled:cursor-not-allowed";
  const lbl = "block text-xs text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
          <h2 className="text-sm font-semibold text-white">
            {esEditar ? `Editar cupón: ${cupon?.codigo}` : "Nuevo cupón de descuento"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
          {/* Warning: tiene usos */}
          {tieneUsos && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 flex gap-2.5">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300">Cupón con usos registrados</p>
                <p className="text-xs text-amber-300/80 mt-0.5">
                  Este cupón ya tiene {cupon?.usos_actuales} uso
                  {(cupon?.usos_actuales ?? 0) !== 1 ? "s" : ""}. Solo se pueden modificar reglas
                  operativas. El tipo y valor del descuento son de solo lectura.
                </p>
              </div>
            </div>
          )}

          {/* Identificación */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Identificación
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Código *</label>
                {esEditar ? (
                  <div className="font-mono text-sm text-violet-300 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2">
                    {cupon?.codigo}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      className={iCls}
                      value={form.codigo}
                      onChange={(e) => upd({ codigo: e.target.value.toUpperCase() })}
                      placeholder="EJ: VERANO25"
                      maxLength={32}
                      required
                      autoFocus
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Mayúsculas, números, guiones (2–32 chars)
                    </p>
                  </>
                )}
              </div>
              <div>
                <label className={lbl}>Descripción</label>
                <input
                  type="text"
                  className={iCls}
                  value={form.descripcion}
                  onChange={(e) => upd({ descripcion: e.target.value })}
                  placeholder="Descuento de verano…"
                  maxLength={200}
                />
              </div>
            </div>
          </div>

          {/* Descuento */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Descuento
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Tipo *</label>
                {tieneUsos ? (
                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2">
                    <TipoBadge tipo={form.tipo_descuento} />
                  </div>
                ) : (
                  <select
                    className={iCls}
                    value={form.tipo_descuento}
                    onChange={(e) => upd({ tipo_descuento: e.target.value })}
                    required
                  >
                    <option value="porcentaje">Porcentaje</option>
                    <option value="monto_fijo">Monto fijo</option>
                  </select>
                )}
              </div>
              <div>
                <label className={lbl}>
                  Valor {form.tipo_descuento === "porcentaje" ? "(1–100 %)" : "(UYU)"} *
                </label>
                <input
                  type="number"
                  className={iCls}
                  value={form.valor_descuento}
                  onChange={(e) => upd({ valor_descuento: e.target.value })}
                  placeholder={form.tipo_descuento === "porcentaje" ? "10" : "100"}
                  disabled={tieneUsos}
                  required={!tieneUsos}
                  min={form.tipo_descuento === "porcentaje" ? 1 : 0.01}
                  max={form.tipo_descuento === "porcentaje" ? 100 : undefined}
                  step="any"
                />
              </div>
              <div>
                <label className={lbl}>Precio normal (UYU)</label>
                <input
                  type="number"
                  className={iCls}
                  value={form.precio_recurrente_normal}
                  onChange={(e) => upd({ precio_recurrente_normal: e.target.value })}
                  placeholder="390"
                  disabled={tieneUsos}
                  min={1}
                  step="any"
                />
              </div>
            </div>
          </div>

          {/* Vigencia y límites */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Vigencia y límites
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Fecha inicio</label>
                <input
                  type="date"
                  className={iCls}
                  value={form.fecha_inicio}
                  onChange={(e) => upd({ fecha_inicio: e.target.value })}
                />
              </div>
              <div>
                <label className={lbl}>Fecha fin</label>
                <input
                  type="date"
                  className={iCls}
                  value={form.fecha_fin}
                  onChange={(e) => upd({ fecha_fin: e.target.value })}
                />
              </div>
              <div>
                <label className={lbl}>Máx. usos totales</label>
                <input
                  type="number"
                  className={iCls}
                  value={form.max_usos_total}
                  onChange={(e) => upd({ max_usos_total: e.target.value })}
                  placeholder="Ilimitado"
                  min={1}
                  step={1}
                />
              </div>
              <div>
                <label className={lbl}>Máx. usos por usuario</label>
                <input
                  type="number"
                  className={iCls}
                  value={form.max_usos_por_usuario}
                  onChange={(e) => upd({ max_usos_por_usuario: e.target.value })}
                  placeholder="1"
                  min={1}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Alcance */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Alcance
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Aplica a producto</label>
                <input
                  type="text"
                  className={iCls}
                  value={form.aplica_a_producto}
                  onChange={(e) => upd({ aplica_a_producto: e.target.value })}
                  placeholder="premium"
                />
              </div>
              <div>
                <label className={lbl}>Aplica a plan</label>
                <input
                  type="text"
                  className={iCls}
                  value={form.aplica_a_plan}
                  onChange={(e) => upd({ aplica_a_plan: e.target.value })}
                  placeholder="mensual"
                />
              </div>
            </div>
          </div>

          {/* Estado */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => upd({ activo: e.target.checked })}
              className="w-4 h-4 accent-violet-500"
            />
            <span className="text-sm text-gray-300">Cupón activo al guardar</span>
          </label>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "Guardando…" : esEditar ? "Guardar cambios" : "Crear cupón"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
// Detail modal
// ===========================================================================

function CuponDetalleModal({
  cupon,
  onClose,
  onEditar,
  onToggle,
  toggleLoading,
}: {
  cupon: Cupon;
  onClose: () => void;
  onEditar: (c: Cupon) => void;
  onToggle: (c: Cupon) => void;
  toggleLoading: boolean;
}) {
  const [showUsos, setShowUsos] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const c = cupon;
  const comp = c.computed;
  const moneda = c.moneda ?? "UYU";

  const advertencias: string[] = [];
  if (comp.vencido) advertencias.push("Cupón vencido");
  if (comp.usos_agotados) advertencias.push("Usos agotados");
  if (!c.activo) advertencias.push("Inactivo");
  if (comp.tipo_no_soportado_mvp)
    advertencias.push(
      `Tipo "${c.tipo_descuento}" no soportado en MVP — no puede aplicarse en el checkout actual`
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 flex flex-col">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Tag size={15} className="text-violet-400 shrink-0" />
            <span className="text-white font-semibold text-sm font-mono">{c.codigo}</span>
            {c.descripcion && (
              <span className="text-gray-500 text-xs truncate">— {c.descripcion}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => onEditar(c)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
            >
              <Pencil size={11} />
              Editar
            </button>
            <button
              onClick={() => onToggle(c)}
              disabled={toggleLoading}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                c.activo
                  ? "border-amber-700/60 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50"
                  : "border-green-700/60 bg-green-900/30 text-green-300 hover:bg-green-900/50"
              }`}
            >
              <Power size={11} />
              {toggleLoading ? "…" : c.activo ? "Desactivar" : "Activar"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors ml-1"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

      <div className="px-6 py-5 space-y-5">
        {/* Advertencias */}
        {advertencias.length > 0 && (
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                Advertencias
              </span>
            </div>
            <ul className="space-y-1">
              {advertencias.map((a) => (
                <li key={a} className="text-xs text-amber-300/80">
                  · {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Descuento */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Reglas del descuento
          </p>
          <DataRow label="Tipo" value={<TipoBadge tipo={c.tipo_descuento} />} />
          <DataRow label="Valor descuento" value={fmtValor(c)} />
          {c.precio_recurrente_normal !== null && (
            <DataRow
              label="Precio normal (recurrente)"
              value={`$${moneda} ${c.precio_recurrente_normal}`}
            />
          )}
          {c.precio_primera_cuota !== null && (
            <DataRow
              label="Precio primera cuota"
              value={`$${moneda} ${c.precio_primera_cuota}`}
            />
          )}
          {c.cantidad_ciclos_descuento !== null && (
            <DataRow
              label="Ciclos con descuento"
              value={`${c.cantidad_ciclos_descuento} ciclo${
                c.cantidad_ciclos_descuento !== 1 ? "s" : ""
              }`}
            />
          )}
          <DataRow label="Moneda" value={moneda} />
        </div>

        {/* Vigencia y límites */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Vigencia y límites
          </p>
          <DataRow
            label="Fecha inicio"
            value={
              <span className={!c.fecha_inicio ? "text-gray-600" : ""}>
                {fmtDate(c.fecha_inicio)}
              </span>
            }
          />
          <DataRow
            label="Fecha fin"
            value={
              <span className={comp.vencido ? "text-red-400" : ""}>
                {c.fecha_fin ? fmtDate(c.fecha_fin) : "Sin vencimiento"}
              </span>
            }
          />
          <DataRow
            label="Usos totales"
            value={
              <span className={comp.usos_agotados ? "text-red-400" : ""}>
                {c.usos_actuales} /{" "}
                {c.max_usos_total !== null ? c.max_usos_total : "ilimitado"}
              </span>
            }
          />
          <DataRow
            label="Usos por usuario"
            value={c.max_usos_por_usuario !== null ? c.max_usos_por_usuario : "ilimitado"}
          />
          <DataRow
            label="Solo nuevos usuarios"
            value={<BoolChip val={c.solo_nuevos_usuarios} />}
          />
          <DataRow
            label="Solo usuarios existentes"
            value={<BoolChip val={c.solo_usuarios_existentes} />}
          />
        </div>

        {/* Restricciones */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Restricciones
          </p>
          <DataRow label="Aplica a producto" value={c.aplica_a_producto ?? "Todos"} />
          <DataRow label="Aplica a plan" value={c.aplica_a_plan ?? "Todos"} />
          <DataRow
            label="Estado"
            value={<ActivoBadge activo={c.activo} vencido={comp.vencido} />}
          />
        </div>

        {/* Auditoría */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Auditoría
          </p>
          <DataRow label="creado_en" value={fmtDateTime(c.creado_en)} />
          <DataRow label="actualizado_en" value={fmtDateTime(c.actualizado_en)} />
        </div>

        {/* Metadata */}
        {c.metadata && Object.keys(c.metadata).length > 0 && (
          <div>
            <button
              onClick={() => setShowMeta((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showMeta ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Metadata JSON
            </button>
            {showMeta && (
              <pre className="mt-2 text-xs bg-gray-950 border border-gray-700 rounded p-3 overflow-x-auto text-gray-300 max-h-40">
                {JSON.stringify(c.metadata, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Usos */}
        <div>
          <button
            onClick={() => setShowUsos((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors font-semibold uppercase tracking-wide"
          >
            {showUsos ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Últimos usos registrados
          </button>
          {showUsos && (
            <div className="mt-3">
              <UsosList codigoId={c.id} />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function CuponesPage() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(DEFAULT_FILTROS);
  const [busquedaInput, setBusquedaInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<null | "crear" | "editar">(null);
  const [formCupon, setFormCupon] = useState<Cupon | null>(null);
  const [notif, setNotif] = useState<Notif | null>(null);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);

  const cargar = useCallback(async (f: Filtros) => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/cupones?${buildQuery(f)}`);
      const json: ApiResponse = await res.json();
      if (!json.ok) {
        setErrorMsg(
          (json as unknown as Record<string, string>).detalle ?? "Error al cargar cupones"
        );
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setErrorMsg("Error de red al cargar cupones");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFiltro(patch: Partial<Filtros>) {
    const next = { ...filtros, ...patch };
    setSelectedId(null);
    setFiltros(next);
    cargar(next);
  }

  function handleBuscar() {
    applyFiltro({ busqueda: busquedaInput.trim() });
  }

  function handleRowClick(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function showNotif(msg: string, type: "ok" | "error" = "ok") {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 5000);
  }

  function handleNuevo() {
    setFormMode("crear");
    setFormCupon(null);
  }

  function handleEditar(c: Cupon) {
    setFormMode("editar");
    setFormCupon(c);
  }

  function handleEditarFromDetail(c: Cupon) {
    setSelectedId(null);
    setFormMode("editar");
    setFormCupon(c);
  }

  function handleFormClose() {
    setFormMode(null);
    setFormCupon(null);
  }

  function handleFormSuccess(msg: string) {
    cargar(filtros);
    showNotif(msg, "ok");
  }

  async function handleToggle(c: Cupon) {
    setToggleLoadingId(c.id);
    try {
      const res = await fetch("/api/admin/cupones/accion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "toggle_activo", id: c.id, activo: !c.activo }),
      });
      const json = await res.json();
      if (json.ok) {
        await cargar(filtros);
        showNotif(
          `Cupón "${json.codigo}" ${json.activo ? "activado" : "desactivado"}.`,
          "ok"
        );
      } else {
        showNotif(json.error ?? "Error al cambiar estado", "error");
      }
    } catch {
      showNotif("Error de red al cambiar estado", "error");
    } finally {
      setToggleLoadingId(null);
    }
  }

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setCerrandoSesion(false);
    }
  }

  const cupones = data?.cupones ?? [];
  const resumen = data?.resumen;
  const selectedCupon = cupones.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={22} className="text-violet-400" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Panel THC</h1>
              <p className="text-xs text-gray-500 leading-tight">Administración operativa</p>
            </div>
          </div>
          <button
            onClick={cerrarSesion}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <LogOut size={13} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <a href="/admin" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap">
            Dashboard
          </a>
          <a href="/admin/suscriptores" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap">
            Suscriptores
          </a>
          <a href="/admin/mensajes-problematicos" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap">
            Mensajes
          </a>
          <a href="/admin/contenido" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap">
            Contenido
          </a>
          <a href="/admin/suscripciones" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap">
            Suscripciones
          </a>
          <span className="text-sm text-white border-b-2 border-violet-500 py-2.5 px-3 whitespace-nowrap">
            Cupones
          </span>
          <a href="/admin/logs" className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap">
            Logs
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        {resumen && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Total códigos" value={resumen.total} />
            <StatCard label="Activos" value={resumen.activos} cls="text-green-400" />
            <StatCard label="Inactivos" value={resumen.inactivos} cls="text-gray-500" />
            <StatCard label="Vencidos" value={resumen.vencidos} cls="text-red-400" />
            <StatCard label="Usos totales" value={resumen.usos_totales} cls="text-violet-300" />
            <StatCard label="Aplicados (usos)" value={resumen.aplicados_totales} cls="text-sky-300" />
          </div>
        )}

        {/* Actions bar */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            Cupones de descuento
          </p>
          <button
            onClick={handleNuevo}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            <Plus size={14} />
            Nuevo cupón
          </button>
        </div>

        {/* Notification */}
        {notif && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
              notif.type === "ok"
                ? "border-green-800/50 bg-green-950/40 text-green-300"
                : "border-red-800/50 bg-red-950/40 text-red-300"
            }`}
          >
            {notif.type === "ok" ? (
              <CheckCircle2 size={14} className="shrink-0" />
            ) : (
              <AlertCircle size={14} className="shrink-0" />
            )}
            <span className="flex-1">{notif.msg}</span>
            <button
              onClick={() => setNotif(null)}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex gap-0 rounded-lg overflow-hidden border border-gray-700">
            <div className="flex items-center px-3 bg-gray-900">
              <Search size={13} className="text-gray-500" />
            </div>
            <input
              type="text"
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              placeholder="Código o descripción…"
              className="bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none w-52"
            />
          </div>

          <button
            onClick={handleBuscar}
            className="border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>

          <select
            value={filtros.activo}
            onChange={(e) => applyFiltro({ busqueda: busquedaInput, activo: e.target.value })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos (activo)</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>

          <select
            value={filtros.tipo}
            onChange={(e) => applyFiltro({ busqueda: busquedaInput, tipo: e.target.value })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los tipos</option>
            <option value="porcentaje">Porcentaje</option>
            <option value="monto_fijo">Monto fijo</option>
            <option value="primera_cuota">Primera cuota</option>
            <option value="dias_gratis">Días gratis</option>
            <option value="meses_gratis">Meses gratis</option>
          </select>

          <button
            onClick={() => applyFiltro({ busqueda: busquedaInput, vencidos: !filtros.vencidos })}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              filtros.vencidos
                ? "border-red-700 bg-red-900/40 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
            }`}
          >
            Solo vencidos
          </button>

          {(filtros.busqueda || filtros.activo || filtros.tipo || filtros.vencidos) && (
            <button
              onClick={() => {
                setBusquedaInput("");
                setFiltros(DEFAULT_FILTROS);
                setSelectedId(null);
                cargar(DEFAULT_FILTROS);
              }}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-2 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Loading */}
        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando cupones…</span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Empty */}
        {!cargando && !errorMsg && cupones.length === 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 py-16 text-center">
            <Tag size={28} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {data ? "Sin cupones para los filtros actuales." : "Sin datos."}
            </p>
          </div>
        )}

        {/* Table */}
        {!cargando && !errorMsg && cupones.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    {["Código", "Tipo", "Valor", "Precio normal", "Vigencia", "Usos", "Estado", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cupones.map((c) => {
                    const isSelected = c.id === selectedId;
                    const hasWarnings =
                      c.computed.vencido ||
                      c.computed.usos_agotados ||
                      c.computed.tipo_no_soportado_mvp;
                    const rowBg = isSelected
                      ? "bg-violet-950/20 border-violet-800/30"
                      : c.computed.vencido
                      ? "bg-red-950/10"
                      : !c.activo
                      ? "bg-gray-900/20"
                      : "";

                    return (
                      <tr
                        key={c.id}
                        onClick={() => handleRowClick(c.id)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/25 ${rowBg}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-violet-300 font-semibold">
                            {c.codigo}
                          </span>
                          {c.descripcion && (
                            <p className="text-xs text-gray-600 mt-0.5 max-w-[180px] truncate">
                              {c.descripcion}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <TipoBadge tipo={c.tipo_descuento} />
                        </td>
                        <td className="px-4 py-3 text-gray-200 text-sm font-semibold whitespace-nowrap">
                          {fmtValor(c)}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {c.precio_recurrente_normal !== null
                            ? `$${c.moneda ?? "UYU"} ${c.precio_recurrente_normal}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={c.computed.vencido ? "text-red-400" : "text-gray-400"}>
                            {c.fecha_inicio ? fmtDate(c.fecha_inicio) : "—"}
                            {" → "}
                            {c.fecha_fin ? fmtDate(c.fecha_fin) : "∞"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span
                            className={c.computed.usos_agotados ? "text-red-400" : "text-gray-300"}
                          >
                            {c.usos_actuales}
                            {c.max_usos_total !== null ? ` / ${c.max_usos_total}` : " / ∞"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ActivoBadge activo={c.activo} vencido={c.computed.vencido} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasWarnings && (
                            <AlertTriangle size={13} className="text-amber-400 inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-gray-600">
              {cupones.length} código{cupones.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </main>

      {/* Detail modal */}
      {selectedCupon && !formMode && (
        <CuponDetalleModal
          cupon={selectedCupon}
          onClose={() => setSelectedId(null)}
          onEditar={handleEditarFromDetail}
          onToggle={handleToggle}
          toggleLoading={toggleLoadingId === selectedCupon.id}
        />
      )}

      {/* Edit / create modal */}
      {formMode && (
        <CuponModal
          mode={formMode}
          cupon={formCupon}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
