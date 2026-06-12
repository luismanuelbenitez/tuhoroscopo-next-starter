"use client";
import { useState, useEffect } from "react";
import {
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { AdminPanelSwitcher } from "@/components/admin/AdminPanelSwitcher";
import { TarotNav } from "@/components/admin/TarotNav";

interface Cliente {
  id: string;
  nombre_completo: string;
  telefono: string;
  email: string;
  fecha_nacimiento: string | null;
  acepto_terminos: boolean;
  acepto_privacidad: boolean;
  version_terminos: string;
  created_at: string;
  updated_at: string;
}

interface Paginacion {
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

interface Filtros {
  buscar: string;
  offset: number;
}

const LIMIT = 50;

export default function TarotClientesPage() {
  const [inputBuscar, setInputBuscar] = useState("");
  const [filtros, setFiltros] = useState<Filtros>({ buscar: "", offset: 0 });
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  useEffect(() => {
    async function doFetch() {
      setCargando(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (filtros.buscar) params.set("buscar", filtros.buscar);
      params.set("offset", String(filtros.offset));
      params.set("limit", String(LIMIT));
      try {
        const r = await fetch(`/api/admin/tarot/clientes?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
        } else {
          setClientes(json.clientes ?? []);
          setPaginacion(json.paginacion ?? null);
        }
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : "Error de red");
      } finally {
        setCargando(false);
      }
    }
    doFetch();
  }, [filtros]);

  function handleBuscar() {
    setFiltros({ buscar: inputBuscar.trim(), offset: 0 });
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBuscar();
  }
  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const total = paginacion?.total ?? 0;
  const desde = total === 0 ? 0 : filtros.offset + 1;
  const hasta = Math.min(filtros.offset + LIMIT, total);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <AdminPanelSwitcher current="ttc" />
          <button
            onClick={handleLogout}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-0 overflow-x-auto">
          <TarotNav current="/admin/tarot/clientes" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Clientes</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1 flex-1 min-w-[220px] border border-gray-700 rounded-lg bg-gray-900 px-3 py-2">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Nombre, teléfono, email…"
              value={inputBuscar}
              onChange={(e) => setInputBuscar(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
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
                  <th className="px-4 py-3 font-medium text-gray-400">Nombre</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Teléfono</th>
                  <th className="px-4 py-3 font-medium text-gray-400">Email</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Nacimiento</th>
                  <th className="px-4 py-3 font-medium text-gray-400 whitespace-nowrap">Registro</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm animate-pulse">
                      Cargando clientes…
                    </td>
                  </tr>
                )}
                {!cargando && !errorMsg && clientes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Sin resultados.
                    </td>
                  </tr>
                )}
                {!cargando && clientes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{c.nombre_completo || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{c.telefono || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{c.email || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.fecha_nacimiento ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString("es-UY")}
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
                onClick={() => setFiltros({ ...filtros, offset: Math.max(0, filtros.offset - LIMIT) })}
                disabled={filtros.offset === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => { if (paginacion.next_offset != null) setFiltros({ ...filtros, offset: paginacion.next_offset }); }}
                disabled={paginacion.next_offset == null}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
