"use client";
import { useEffect, useState } from "react";
import { Search, AlertCircle } from "lucide-react";
import { PersonaDetalle } from "@/components/admin/clientes-unicos/PersonaDetalle";

// ============================================================================
// Clientes → Clientes (tabla de personas únicas)
//
// Fase 7 del sprint "Módulo Clientes V1". Una fila por identidad
// consolidada — no por registro. Ver docs/product/DECISIONS.md 2026-08-22.
// ============================================================================

interface Persona {
  persona_id: string;
  registro_ids: string[];
  nombre: string;
  telefono_principal: string | null;
  email_principal: string | null;
  telefonos_observados: string[];
  emails_observados: string[];
  compras: number;
  gastado_por_moneda: Record<string, number>;
  primera_compra: string | null;
  ultima_compra: string | null;
  estado: "sin_compra" | "nuevo" | "recurrente";
}

interface Paginacion { total: number; limit: number; offset: number; next_offset: number | null }

const SIMBOLO_MONEDA: Record<string, string> = { UYU: "$U", ARS: "AR$", USD: "US$" };
const LIMIT = 50;

const ESTADO_LABEL: Record<Persona["estado"], string> = {
  nuevo: "Nuevo", recurrente: "Recurrente", sin_compra: "Sin compra",
};
const ESTADO_CLS: Record<Persona["estado"], string> = {
  nuevo: "bg-sky-900/50 text-sky-300",
  recurrente: "bg-emerald-900/50 text-emerald-300",
  sin_compra: "bg-gray-800 text-gray-500",
};

function num(n: number, dec = 0) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMonedas(obj: Record<string, number>, divisor = 1): string {
  const entradas = Object.entries(obj);
  if (entradas.length === 0) return "—";
  return entradas.map(([m, v]) => `${SIMBOLO_MONEDA[m] ?? m} ${num(divisor > 0 ? v / divisor : v)}`).join(" · ");
}
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function ClientesUnicosListaPage() {
  const [inputBuscar, setInputBuscar] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "nuevos" | "recurrentes" | "sin_compra">("todos");
  const [offset, setOffset] = useState(0);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);
      const params = new URLSearchParams({ vista: "lista", limit: String(LIMIT), offset: String(offset) });
      if (buscar) params.set("buscar", buscar);
      if (filtro !== "todos") params.set("filtro", filtro);
      try {
        const r = await fetch(`/api/admin/tarot/clientes-unicos?${params.toString()}`, { cache: "no-store" });
        const json = await r.json().catch(() => null);
        if (!r.ok || !json?.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setPersonas(json.personas ?? []);
          setPaginacion(json.paginacion ?? null);
        }
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Error de red");
      } finally {
        setCargando(false);
      }
    }
    doFetch();
  }, [buscar, filtro, offset]);

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + LIMIT, total);

  return (
    <main className="px-6 py-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">Clientes</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Personas únicas — teléfono y/o email normalizados consolidan varios registros en una sola identidad.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-1 flex-1 min-w-[220px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
          <Search size={14} className="text-gray-500 shrink-0" />
          <input
            type="text"
            placeholder="Nombre, teléfono, email…"
            value={inputBuscar}
            onChange={(e) => setInputBuscar(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setBuscar(inputBuscar.trim()); setOffset(0); } }}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => { setBuscar(inputBuscar.trim()); setOffset(0); }}
          className="border border-amber-700 bg-amber-800/40 hover:bg-amber-700/60 text-amber-200 text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Buscar
        </button>
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {([
            ["todos", "Todos"], ["nuevos", "Nuevos"], ["recurrentes", "Recurrentes"], ["sin_compra", "Sin compra"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setFiltro(key); setOffset(0); }}
              className={`text-xs px-3 py-2 transition-colors ${filtro === key ? "bg-amber-800/50 text-amber-200" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
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
                <th className="px-4 py-3 font-medium text-gray-400">Cliente</th>
                <th className="px-4 py-3 font-medium text-gray-400">Teléfono</th>
                <th className="px-4 py-3 font-medium text-gray-400">Email</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-right">Compras</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-right">Total gastado</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-right">Ticket prom.</th>
                <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">1ª compra</th>
                <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Últ. compra</th>
                <th className="px-4 py-3 font-medium text-gray-400">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">Cargando…</td></tr>
              )}
              {!cargando && !errorMsg && personas.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500 text-sm">Sin resultados.</td></tr>
              )}
              {!cargando && personas.map((p) => (
                <tr
                  key={p.persona_id}
                  onClick={() => setSeleccionado(p.persona_id)}
                  className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {p.nombre}
                    {p.registro_ids.length > 1 && (
                      <span className="ml-1.5 text-xs text-gray-600 font-normal">({p.registro_ids.length} registros)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">{p.telefono_principal ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{p.email_principal ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{p.compras}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{fmtMonedas(p.gastado_por_moneda)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{p.compras > 0 ? fmtMonedas(p.gastado_por_moneda, p.compras) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(p.primera_compra)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(p.ultima_compra)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CLS[p.estado]}`}>{ESTADO_LABEL[p.estado]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!cargando && paginacion && total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <span>{desde}–{hasta} de {total} clientes</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => { if (paginacion.next_offset != null) setOffset(paginacion.next_offset); }}
              disabled={paginacion.next_offset == null}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {seleccionado && (
        <PersonaDetalle clienteId={seleccionado} onClose={() => setSeleccionado(null)} />
      )}
    </main>
  );
}
