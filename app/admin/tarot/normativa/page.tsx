"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Scale } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";

// Normativa y cumplimiento (2026-10-22): registro interno de pendientes.
// Exclusivamente informativo — no implementa correcciones.

interface Item {
  id: string; tema: string; posible_obligacion: string; descripcion: string; referencia: string | null;
  verificacion: string; riesgo: string; prioridad: string; resolucion: string; notas: string | null; updated_at: string;
}

const COLOR: Record<string, string> = {
  confirmado: "text-red-300 bg-red-950/40 border-red-900/60", pendiente: "text-amber-300 bg-amber-950/30 border-amber-900/60", descartado: "text-gray-400 bg-gray-900 border-gray-700",
  alto: "text-red-300", medio: "text-amber-300", bajo: "text-gray-400", alta: "text-red-300", media: "text-amber-300", baja: "text-gray-400",
  abierto: "text-gray-300", en_curso: "text-sky-300", resuelto: "text-emerald-300",
};
const ETIQ: Record<string, string> = {
  confirmado: "Hallazgo confirmado", pendiente: "Pendiente de validar", descartado: "Descartado",
  abierto: "Abierto", en_curso: "En curso", resuelto: "Resuelto",
};

export default function NormativaPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/tarot/normativa").then((x) => x.json()).catch(() => null);
    if (!r?.ok) setError(r?.detalle ?? r?.motivo ?? "Error"); else setItems(r.items);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiar(id: string, campo: string, valor: string) {
    await fetch("/api/admin/tarot/normativa", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, [campo]: valor }) });
    cargar();
  }
  const sel = "rounded bg-gray-900 border border-gray-700 text-[11px] text-gray-200 px-1.5 py-1";

  return (
    <TarotAdminShell>
      <div className="p-6 max-w-6xl">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Scale size={18} className="text-amber-400" /> Normativa y cumplimiento</h1>
        <p className="text-xs text-gray-500 mt-1 mb-5">
          Registro interno de temas a revisar. Es informativo: nada de lo que figura acá se implementó ni se declara cumplido.
          «Hallazgo confirmado» = verificado en el sistema; «Pendiente de validar» = requiere consulta profesional o con el organismo.
        </p>
        {error && <div className="mb-4 flex items-center gap-2 text-sm text-red-400"><AlertCircle size={14} /> {error}</div>}
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{it.tema}</p>
                  <p className="mt-1 text-xs text-gray-300">{it.posible_obligacion}</p>
                </div>
                <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] ${COLOR[it.verificacion] ?? ""}`}>{ETIQ[it.verificacion] ?? it.verificacion}</span>
              </div>
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">{it.descripcion}</p>
              {it.referencia && <p className="mt-1.5 text-[11px] text-gray-500">Referencia: {it.referencia}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                <label>Verificación <select className={sel} value={it.verificacion} onChange={(e) => cambiar(it.id, "verificacion", e.target.value)}>
                  {["confirmado", "pendiente", "descartado"].map((v) => <option key={v} value={v}>{ETIQ[v]}</option>)}</select></label>
                <label>Riesgo <select className={`${sel} ${COLOR[it.riesgo]}`} value={it.riesgo} onChange={(e) => cambiar(it.id, "riesgo", e.target.value)}>
                  {["bajo", "medio", "alto"].map((v) => <option key={v}>{v}</option>)}</select></label>
                <label>Prioridad <select className={`${sel} ${COLOR[it.prioridad]}`} value={it.prioridad} onChange={(e) => cambiar(it.id, "prioridad", e.target.value)}>
                  {["baja", "media", "alta"].map((v) => <option key={v}>{v}</option>)}</select></label>
                <label>Resolución <select className={`${sel} ${COLOR[it.resolucion]}`} value={it.resolucion} onChange={(e) => cambiar(it.id, "resolucion", e.target.value)}>
                  {["abierto", "en_curso", "resuelto", "descartado"].map((v) => <option key={v} value={v}>{ETIQ[v] ?? v}</option>)}</select></label>
                <span className="ml-auto">Actualizado {new Date(it.updated_at).toLocaleDateString("es-UY")}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </TarotAdminShell>
  );
}
