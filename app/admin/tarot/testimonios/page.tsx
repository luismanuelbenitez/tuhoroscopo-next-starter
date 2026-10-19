"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Plus, Pencil, Trash2, Eye, EyeOff, X, Loader2, Star } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// ============================================================================
// Testimonios (tarot_testimonios). La web muestra hasta 3 con "Visible en la
// web" = sí, por "Orden" ascendente. La base impide hacer visible un
// testimonio sin opinión, estrellas y autorización del cliente. El nombre
// se completa solo desde la orden si se deja vacío (primer nombre).
// ============================================================================

interface Testimonio {
  id: string;
  opinion: string | null;
  puntuacion: number | null;
  nombre: string | null;
  ciudad: string | null;
  autoriza_publicacion: boolean;
  autoriza_difusion?: boolean;
  campana_id?: string | null;
  feedback_respuesta_id?: string | null;
  publicado: boolean;
  publicado_at: string | null;
  orden_visual: number;
  canal: string;
  estado_encuesta: string;
  notas_internas: string | null;
  created_at: string;
  orden_id: string | null;
  tarot_ordenes: { external_reference: string } | null;
}

interface FormState {
  opinion: string;
  puntuacion: string;
  nombre: string;
  ciudad: string;
  orden: string;
  autoriza_publicacion: boolean;
  publicado: boolean;
  orden_visual: string;
  notas_internas: string;
}

const FORM_INICIAL: FormState = {
  opinion: "",
  puntuacion: "5",
  nombre: "",
  ciudad: "",
  orden: "",
  autoriza_publicacion: false,
  publicado: false,
  orden_visual: "0",
  notas_internas: "",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  enviada: "Encuesta enviada",
  respondida: "Respondida",
  expirada: "Expirada",
  descartada: "Descartada",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{text}</span>;
}

function Estrellas({ n }: { n: number | null }) {
  if (n === null) return <span className="text-xs text-gray-600">—</span>;
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={13} className={i < n ? "text-amber-400 fill-amber-400" : "text-gray-600"} />
      ))}
    </span>
  );
}

function aForm(t: Testimonio): FormState {
  return {
    opinion: t.opinion ?? "",
    puntuacion: t.puntuacion != null ? String(t.puntuacion) : "5",
    nombre: t.nombre ?? "",
    ciudad: t.ciudad ?? "",
    orden: t.tarot_ordenes?.external_reference ?? "",
    autoriza_publicacion: t.autoriza_publicacion,
    publicado: t.publicado,
    orden_visual: String(t.orden_visual ?? 0),
    notas_internas: t.notas_internas ?? "",
  };
}

// ============================================================================
// Modal alta / edición
// ============================================================================

function TestimonioModal({ editing, onClose, onSaved }: { editing: Testimonio | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = editing !== null;
  const [form, setForm] = useState<FormState>(isEdit ? aForm(editing!) : FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrorMsg(null);

    const payload = {
      opinion: form.opinion.trim(),
      puntuacion: Number(form.puntuacion),
      nombre: form.nombre.trim(),
      ciudad: form.ciudad.trim(),
      orden: form.orden.trim(),
      autoriza_publicacion: form.autoriza_publicacion,
      publicado: form.publicado,
      orden_visual: Number(form.orden_visual) || 0,
      notas_internas: form.notas_internas.trim(),
    };

    try {
      const res = await fetch(isEdit ? `/api/admin/tarot/testimonios/${editing!.id}` : "/api/admin/tarot/testimonios", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) onSaved();
      else setErrorMsg(data.detalle ?? data.motivo ?? "Error al guardar");
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
          <span className="text-base font-semibold text-white">{isEdit ? "Editar testimonio" : "Nuevo testimonio"}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Experiencia (opinión del cliente) *</label>
            <textarea
              className={`${inputCls} min-h-[110px]`}
              value={form.opinion}
              onChange={(e) => set("opinion", e.target.value)}
              maxLength={600}
              required
              placeholder="Tal como la escribió el cliente"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {form.opinion.length}/600 · En la web se ven ~5 líneas (ideal hasta 180 caracteres).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Estrellas (0 a 5) *</label>
              <select className={inputCls} value={form.puntuacion} onChange={(e) => set("puntuacion", e.target.value)}>
                {[5, 4, 3, 2, 1, 0].map((n) => <option key={n} value={n}>{n} {n === 1 ? "estrella" : "estrellas"}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Orden en la web</label>
              <input type="number" className={inputCls} value={form.orden_visual} onChange={(e) => set("orden_visual", e.target.value)} />
              <p className="text-[11px] text-gray-500 mt-1">Menor = aparece primero.</p>
            </div>
          </div>

          <div>
            <label className={labelCls}>Orden de compra (referencia o id)</label>
            <input className={`${inputCls} font-mono`} value={form.orden} onChange={(e) => set("orden", e.target.value)} placeholder="Opcional — vincula el testimonio a una compra real" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nombre</label>
              <input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Vacío = primer nombre del cliente" />
            </div>
            <div>
              <label className={labelCls}>Ciudad</label>
              <input className={inputCls} value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-amber-500" checked={form.autoriza_publicacion} onChange={(e) => set("autoriza_publicacion", e.target.checked)} />
            <span>El cliente <strong>autorizó</strong> compartir su experiencia en la web</span>
          </label>

          <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-amber-500" checked={form.publicado} onChange={(e) => set("publicado", e.target.checked)} />
            <span>Visible en la web</span>
          </label>

          <div>
            <label className={labelCls}>Notas internas</label>
            <input className={inputCls} value={form.notas_internas} onChange={(e) => set("notas_internas", e.target.value)} placeholder="No se muestra en la web" />
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={guardando} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-amber-700 bg-amber-800/40 hover:bg-amber-700/60 text-amber-200 disabled:opacity-50">
              {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Página
// ============================================================================

export default function TarotTestimoniosPage() {
  const [testimonios, setTestimonios] = useState<Testimonio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"" | "true" | "false">("");
  const [modal, setModal] = useState<{ editing: Testimonio | null } | null>(null);
  const [accionId, setAccionId] = useState<string | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ id: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const r = await fetch(`/api/admin/tarot/testimonios${filtro ? `?publicado=${filtro}` : ""}`, { cache: "no-store" });
      const json = await r.json();
      if (json.ok) setTestimonios(json.testimonios);
      else setErrorMsg(json.detalle ?? json.motivo ?? `Error HTTP ${r.status}`);
    } catch {
      setErrorMsg("Error de red");
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  async function toggleVisible(t: Testimonio) {
    const nuevo = !t.publicado;
    const pregunta = nuevo
      ? `¿Hacer visible en la web el testimonio de ${t.nombre ?? "este cliente"}?`
      : `¿Ocultar de la web el testimonio de ${t.nombre ?? "este cliente"}?`;
    if (!window.confirm(pregunta)) return;

    setAccionId(t.id);
    setAccionMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/testimonios/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicado: nuevo }),
      });
      const data = await res.json();
      if (data.ok) await cargar();
      else setAccionMsg({ id: t.id, texto: data.detalle ?? data.motivo ?? "Error" });
    } catch {
      setAccionMsg({ id: t.id, texto: "Error de red" });
    } finally {
      setAccionId(null);
    }
  }

  async function eliminar(t: Testimonio) {
    if (!window.confirm(`¿Eliminar definitivamente el testimonio de ${t.nombre ?? "este cliente"}? No se puede deshacer.`)) return;
    setAccionId(t.id);
    try {
      const res = await fetch(`/api/admin/tarot/testimonios/${t.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) await cargar();
      else setAccionMsg({ id: t.id, texto: data.detalle ?? data.motivo ?? "Error" });
    } catch {
      setAccionMsg({ id: t.id, texto: "Error de red" });
    } finally {
      setAccionId(null);
    }
  }

  const visibles = testimonios.filter((t) => t.publicado).length;

  return (
    <TarotAdminShell>
      <main className="px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Testimonios</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              La web muestra hasta 3 visibles, por orden. {filtro === "" && `${visibles} visible${visibles !== 1 ? "s" : ""} hoy.`}
            </p>
          </div>
          <button
            onClick={() => setModal({ editing: null })}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-amber-700/60 bg-amber-900/30 hover:bg-amber-800/40 text-amber-200 transition-colors"
          >
            <Plus size={14} /> Nuevo testimonio
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as "" | "true" | "false")}
            className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos</option>
            <option value="true">Solo visibles en la web</option>
            <option value="false">Solo no visibles</option>
          </select>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Fecha</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Nombre</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estrellas</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Experiencia</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Orden</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando testimonios…</td></tr>
                )}
                {!cargando && !errorMsg && testimonios.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">Todavía no hay testimonios.</td></tr>
                )}
                {!cargando && testimonios.map((t) => {
                  const isBusy = accionId === t.id;
                  const msg = accionMsg?.id === t.id ? accionMsg.texto : null;
                  return (
                    <tr key={t.id} className={`border-b border-gray-800/60 align-top ${isBusy ? "opacity-60" : "hover:bg-gray-800/30"}`}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString("es-UY")}
                      </td>
                      <td className="px-4 py-3 text-white whitespace-nowrap">
                        {t.nombre ?? "—"}
                        {t.ciudad && <span className="block text-xs text-gray-500">{t.ciudad}</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><Estrellas n={t.puntuacion} /></td>
                      <td className="px-4 py-3 text-xs text-gray-300 max-w-[320px]">
                        <span className="line-clamp-3">{t.opinion ?? "—"}</span>
                        {msg && <span className="block mt-1 text-red-400">{msg}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        {t.tarot_ordenes?.external_reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 space-y-1">
                        <div>
                          {t.publicado
                            ? <Badge text={`Visible · orden ${t.orden_visual}`} cls="bg-emerald-900/50 text-emerald-300" />
                            : <Badge text="No visible" cls="bg-gray-800 text-gray-400" />}
                        </div>
                        <div>
                          {t.autoriza_publicacion
                            ? <Badge text="Autorizado" cls="bg-sky-900/40 text-sky-300" />
                            : <Badge text="Sin autorización" cls="bg-orange-900/40 text-orange-300" />}
                        </div>
                        {t.autoriza_difusion && (
                          <div><Badge text="Autoriza difusión" cls="bg-fuchsia-900/40 text-fuchsia-300" /></div>
                        )}
                        <div className="text-[11px] text-gray-500">{ESTADO_LABEL[t.estado_encuesta] ?? t.estado_encuesta} · {t.canal}{t.feedback_respuesta_id ? " · campaña de feedback" : ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleVisible(t)}
                            disabled={isBusy}
                            title={t.publicado ? "Ocultar de la web" : "Hacer visible en la web"}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-300 hover:bg-gray-800"
                          >
                            {t.publicado ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button onClick={() => setModal({ editing: t })} disabled={isBusy} title="Editar" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => eliminar(t)} disabled={isBusy} title="Eliminar" className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {modal && (
        <TestimonioModal
          editing={modal.editing}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
    </TarotAdminShell>
  );
}
