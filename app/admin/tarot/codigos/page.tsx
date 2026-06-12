"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LogOut, ChevronLeft, ChevronRight, AlertCircle, Search,
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Loader2, CheckCircle2,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";

// ============================================================================
// Types
// ============================================================================

interface Codigo {
  id: string;
  codigo: string;
  tipo_descuento: string;
  valor_descuento: number | null;
  precio_fijo_uyu: number | null;
  precio_fijo_ars: number | null;
  activo: boolean;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  max_usos_total: number | null;
  max_usos_por_cliente: number;
  usos_actuales: number;
  solo_nuevos_clientes: boolean;
  campania: string | null;
  created_at: string;
}

interface FormState {
  codigo: string;
  tipo_descuento: string;
  valor_descuento: string;
  precio_fijo_uyu: string;
  precio_fijo_ars: string;
  descripcion: string;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  max_usos_total: string;
  max_usos_por_cliente: string;
  solo_nuevos_clientes: boolean;
  campania: string;
}

const FORM_INICIAL: FormState = {
  codigo: "",
  tipo_descuento: "porcentaje",
  valor_descuento: "",
  precio_fijo_uyu: "",
  precio_fijo_ars: "",
  descripcion: "",
  activo: true,
  fecha_inicio: "",
  fecha_fin: "",
  max_usos_total: "",
  max_usos_por_cliente: "1",
  solo_nuevos_clientes: false,
  campania: "",
};

const TIPO_LABEL: Record<string, string> = {
  porcentaje:  "Porcentaje",
  monto_fijo:  "Monto fijo",
  precio_fijo: "Precio fijo",
};

const PER_PAGE = 20;

// ============================================================================
// Helpers
// ============================================================================

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

function formatValor(c: Codigo): string {
  if (c.tipo_descuento === "porcentaje") return `${c.valor_descuento}%`;
  if (c.tipo_descuento === "precio_fijo")
    return `UYU ${c.precio_fijo_uyu ?? "?"} / ARS ${c.precio_fijo_ars ?? "?"}`;
  return `-${c.valor_descuento}`;
}

function codigoToForm(c: Codigo): FormState {
  return {
    codigo: c.codigo,
    tipo_descuento: c.tipo_descuento,
    valor_descuento: c.valor_descuento != null ? String(c.valor_descuento) : "",
    precio_fijo_uyu: c.precio_fijo_uyu != null ? String(c.precio_fijo_uyu) : "",
    precio_fijo_ars: c.precio_fijo_ars != null ? String(c.precio_fijo_ars) : "",
    descripcion: c.descripcion ?? "",
    activo: c.activo,
    fecha_inicio: c.fecha_inicio ? c.fecha_inicio.slice(0, 10) : "",
    fecha_fin: c.fecha_fin ? c.fecha_fin.slice(0, 10) : "",
    max_usos_total: c.max_usos_total != null ? String(c.max_usos_total) : "",
    max_usos_por_cliente: String(c.max_usos_por_cliente ?? 1),
    solo_nuevos_clientes: c.solo_nuevos_clientes,
    campania: c.campania ?? "",
  };
}

// ============================================================================
// Modal
// ============================================================================

function CodigoModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Codigo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = editing !== null;
  const [form, setForm] = useState<FormState>(isEdit ? codigoToForm(editing!) : FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrorMsg(null);

    const payload: Record<string, unknown> = {
      tipo_descuento: form.tipo_descuento,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      max_usos_total: form.max_usos_total !== "" ? Number(form.max_usos_total) : null,
      max_usos_por_cliente: Number(form.max_usos_por_cliente) || 1,
      solo_nuevos_clientes: form.solo_nuevos_clientes,
      campania: form.campania.trim() || null,
    };

    if (form.tipo_descuento === "precio_fijo") {
      payload.precio_fijo_uyu = Number(form.precio_fijo_uyu) || null;
      payload.precio_fijo_ars = Number(form.precio_fijo_ars) || null;
    } else {
      payload.valor_descuento = Number(form.valor_descuento) || null;
    }

    if (!isEdit) payload.codigo = form.codigo.trim().toUpperCase();

    const url = isEdit ? `/api/admin/tarot/codigos/${editing!.id}` : "/api/admin/tarot/codigos";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved();
      } else {
        setErrorMsg(
          data.detalle ?? data.motivo === "codigo_duplicado"
            ? `El código "${form.codigo.toUpperCase()}" ya existe.`
            : (data.detalle ?? data.motivo ?? "Error al guardar"),
        );
      }
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setGuardando(false);
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500";
  const labelCls = "block text-xs text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700/60">
          <span className="text-base font-semibold text-white">
            {isEdit ? `Editar: ${editing!.codigo}` : "Nuevo código"}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Código */}
          {!isEdit && (
            <div>
              <label className={labelCls}>Código *</label>
              <input
                type="text"
                required
                value={form.codigo}
                onChange={(e) => set("codigo", e.target.value.toUpperCase())}
                placeholder="VERANO25"
                className={inputCls + " font-mono tracking-wider"}
              />
            </div>
          )}

          {/* Tipo */}
          <div>
            <label className={labelCls}>Tipo *</label>
            <select
              value={form.tipo_descuento}
              onChange={(e) => set("tipo_descuento", e.target.value)}
              className={inputCls}
            >
              <option value="porcentaje">Porcentaje (%)</option>
              <option value="monto_fijo">Monto fijo (resta X al precio)</option>
              <option value="precio_fijo">Precio fijo (UYU + ARS)</option>
            </select>
          </div>

          {/* Valor según tipo */}
          {form.tipo_descuento !== "precio_fijo" && (
            <div>
              <label className={labelCls}>
                {form.tipo_descuento === "porcentaje" ? "Porcentaje de descuento *" : "Monto a restar *"}
              </label>
              <input
                type="number"
                required
                min={0.01}
                max={form.tipo_descuento === "porcentaje" ? 100 : undefined}
                step="0.01"
                value={form.valor_descuento}
                onChange={(e) => set("valor_descuento", e.target.value)}
                placeholder={form.tipo_descuento === "porcentaje" ? "15" : "200"}
                className={inputCls}
              />
            </div>
          )}

          {form.tipo_descuento === "precio_fijo" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Precio fijo UYU *</label>
                <input
                  type="number" required min={0} step="1"
                  value={form.precio_fijo_uyu}
                  onChange={(e) => set("precio_fijo_uyu", e.target.value)}
                  placeholder="500"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Precio fijo ARS *</label>
                <input
                  type="number" required min={0} step="1"
                  value={form.precio_fijo_ars}
                  onChange={(e) => set("precio_fijo_ars", e.target.value)}
                  placeholder="15000"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* Descripción */}
          <div>
            <label className={labelCls}>Descripción interna</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              placeholder="Promo verano redes sociales"
              className={inputCls}
            />
          </div>

          {/* Vigencia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Válido desde</label>
              <input
                type="date" value={form.fecha_inicio}
                onChange={(e) => set("fecha_inicio", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Válido hasta</label>
              <input
                type="date" value={form.fecha_fin}
                onChange={(e) => set("fecha_fin", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Usos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Usos totales máx. (vacío = ∞)</label>
              <input
                type="number" min={1} step={1}
                value={form.max_usos_total}
                onChange={(e) => set("max_usos_total", e.target.value)}
                placeholder="∞"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Usos por cliente</label>
              <input
                type="number" min={1} step={1} required
                value={form.max_usos_por_cliente}
                onChange={(e) => set("max_usos_por_cliente", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Campaña + checkboxes */}
          <div>
            <label className={labelCls}>Campaña / etiqueta</label>
            <input
              type="text" value={form.campania}
              onChange={(e) => set("campania", e.target.value)}
              placeholder="ig-stories-junio"
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" checked={form.solo_nuevos_clientes}
                onChange={(e) => set("solo_nuevos_clientes", e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <span className="text-sm text-gray-300">Solo nuevos clientes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" checked={form.activo}
                onChange={(e) => set("activo", e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <span className="text-sm text-gray-300">Activo</span>
            </label>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {errorMsg}
            </div>
          )}

          {/* Botones */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {guardando ? <Loader2 size={13} className="animate-spin" /> : null}
              {guardando ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear código"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function TarotCodigosPage() {
  const [inputSearch, setInputSearch] = useState("");
  const [filtros, setFiltros] = useState({ search: "", tipo: "", activo: "", page: 1 });
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCodigo, setEditingCodigo] = useState<Codigo | null>(null);

  // Accion inline (toggle / delete)
  const [accionId, setAccionId] = useState<string | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ id: string; tipo: "ok" | "err"; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (filtros.search) params.set("search", filtros.search);
    if (filtros.tipo)   params.set("tipo_descuento", filtros.tipo);
    if (filtros.activo) params.set("activo", filtros.activo);
    params.set("page", String(filtros.page));
    params.set("per_page", String(PER_PAGE));
    try {
      const r = await fetch(`/api/admin/tarot/codigos?${params.toString()}`);
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setCodigos(json.data ?? []);
        setTotal(json.total ?? 0);
        setTotalPages(json.total_pages ?? 1);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  function handleBuscar() {
    setFiltros({ ...filtros, search: inputSearch.trim(), page: 1 });
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBuscar();
  }
  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function abrirCrear() {
    setEditingCodigo(null);
    setModalOpen(true);
  }
  function abrirEditar(c: Codigo) {
    setEditingCodigo(c);
    setModalOpen(true);
  }
  function cerrarModal() {
    setModalOpen(false);
    setEditingCodigo(null);
  }
  function onSaved() {
    cerrarModal();
    cargar();
  }

  async function toggleActivo(c: Codigo) {
    setAccionId(c.id);
    setAccionMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/codigos/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !c.activo }),
      });
      const data = await res.json();
      if (data.ok) {
        setCodigos((prev) => prev.map((x) => x.id === c.id ? { ...x, activo: !c.activo } : x));
        setAccionMsg({ id: c.id, tipo: "ok", texto: !c.activo ? "Activado" : "Desactivado" });
      } else {
        setAccionMsg({ id: c.id, tipo: "err", texto: data.detalle ?? "Error" });
      }
    } catch {
      setAccionMsg({ id: c.id, tipo: "err", texto: "Error de red" });
    } finally {
      setAccionId(null);
      setTimeout(() => setAccionMsg(null), 3000);
    }
  }

  async function eliminar(c: Codigo) {
    if (!confirm(`¿Eliminar el código "${c.codigo}"? Esta acción no se puede deshacer.`)) return;
    setAccionId(c.id);
    setAccionMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/codigos/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setCodigos((prev) => prev.filter((x) => x.id !== c.id));
        setTotal((t) => t - 1);
      } else {
        setAccionMsg({ id: c.id, tipo: "err", texto: data.detalle ?? data.motivo ?? "Error" });
      }
    } catch {
      setAccionMsg({ id: c.id, tipo: "err", texto: "Error de red" });
    } finally {
      setAccionId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="ttc" />
          <button
            onClick={handleLogout} disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <TarotNav current="/admin/tarot/codigos" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Códigos de descuento</h2>
          <button
            onClick={abrirCrear}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-amber-700/60 bg-amber-900/30 hover:bg-amber-800/40 text-amber-200 transition-colors"
          >
            <Plus size={14} /> Nuevo código
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1 flex-1 min-w-[200px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text" placeholder="Buscar código…"
              value={inputSearch}
              onChange={(e) => setInputSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
          <select
            value={filtros.tipo}
            onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, page: 1 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos los tipos</option>
            <option value="porcentaje">Porcentaje</option>
            <option value="monto_fijo">Monto fijo</option>
            <option value="precio_fijo">Precio fijo</option>
          </select>
          <select
            value={filtros.activo}
            onChange={(e) => setFiltros({ ...filtros, activo: e.target.value, page: 1 })}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Activos e inactivos</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>
          <button
            onClick={handleBuscar}
            className="border border-amber-700 bg-amber-800/40 hover:bg-amber-700/60 text-amber-200 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400">Código</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Tipo / Valor</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Usos</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Descripción</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Válido hasta</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando códigos…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && codigos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && codigos.map((c) => {
                  const agotado = c.max_usos_total != null && c.usos_actuales >= c.max_usos_total;
                  const isBusy  = accionId === c.id;
                  const msg     = accionMsg?.id === c.id ? accionMsg : null;

                  return (
                    <>
                      <tr key={c.id} className={`border-b border-gray-800/60 transition-colors ${isBusy ? "opacity-60" : "hover:bg-gray-800/30"}`}>
                        <td className="px-4 py-3 font-mono text-sm font-bold text-white tracking-wide">
                          {c.codigo}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400 block">{TIPO_LABEL[c.tipo_descuento] ?? c.tipo_descuento}</span>
                          <span className="font-mono text-xs text-amber-300">{formatValor(c)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {agotado ? (
                            <Badge text="Agotado" cls="bg-orange-900/50 text-orange-300" />
                          ) : c.activo ? (
                            <Badge text="Activo" cls="bg-emerald-900/50 text-emerald-300" />
                          ) : (
                            <Badge text="Inactivo" cls="bg-gray-800 text-gray-500" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {c.usos_actuales}{c.max_usos_total != null ? ` / ${c.max_usos_total}` : " / ∞"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                          {c.descripcion ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {c.fecha_fin ? new Date(c.fecha_fin).toLocaleDateString("es-UY") : "Sin límite"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {/* Toggle activo */}
                            <button
                              onClick={() => toggleActivo(c)}
                              disabled={isBusy}
                              title={c.activo ? "Desactivar" : "Activar"}
                              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                            >
                              {isBusy ? <Loader2 size={14} className="animate-spin" /> : c.activo ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                            </button>
                            {/* Editar */}
                            <button
                              onClick={() => abrirEditar(c)}
                              disabled={isBusy}
                              title="Editar"
                              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-amber-300 transition-colors disabled:opacity-40"
                            >
                              <Pencil size={13} />
                            </button>
                            {/* Eliminar — solo si sin usos */}
                            {c.usos_actuales === 0 && (
                              <button
                                onClick={() => eliminar(c)}
                                disabled={isBusy}
                                title="Eliminar"
                                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {msg && (
                        <tr key={`msg-${c.id}`} className="border-b border-gray-800/40">
                          <td colSpan={7} className="px-4 py-1.5">
                            <div className={`flex items-center gap-1.5 text-xs ${msg.tipo === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                              {msg.tipo === "ok" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                              {msg.texto}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!cargando && total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>{total} código{total !== 1 ? "s" : ""} total</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltros({ ...filtros, page: Math.max(1, filtros.page - 1) })}
                disabled={filtros.page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-xs text-gray-500">{filtros.page} / {totalPages}</span>
              <button
                onClick={() => setFiltros({ ...filtros, page: filtros.page + 1 })}
                disabled={filtros.page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>

      {modalOpen && (
        <CodigoModal
          editing={editingCodigo}
          onClose={cerrarModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
