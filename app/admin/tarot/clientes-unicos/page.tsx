"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

// ============================================================================
// Clientes → Visión general
//
// Fase 6 del sprint "Módulo Clientes V1" (docs/product/DECISIONS.md
// 2026-08-22). Fórmulas exactas documentadas en docs/product/METRICS.md —
// no se repiten acá para evitar que diverjan dos fuentes.
// ============================================================================

interface Resumen {
  clientes_unicos_total: number;
  compradores_periodo: number;
  nuevos_periodo: number;
  recurrentes_periodo: number;
  pct_recurrencia_historico: number | null;
  compras_periodo: number;
  compras_por_cliente_periodo: number | null;
  ingreso_total_periodo_por_moneda: Record<string, number>;
  ingreso_promedio_por_cliente_periodo_por_moneda: Record<string, number> | null;
  ticket_promedio_periodo_por_moneda: Record<string, number> | null;
}

interface ResumenData {
  ok: boolean;
  registros_totales: number;
  personas_totales: number;
  resumen: Resumen;
}

const PERIODOS = [
  { key: "1", label: "Hoy" },
  { key: "7", label: "7 días" },
  { key: "30", label: "30 días" },
  { key: "90", label: "90 días" },
] as const;

const SIMBOLO_MONEDA: Record<string, string> = { UYU: "$U", ARS: "AR$", USD: "US$" };

function num(n: number, dec = 0) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
const ND = <span className="text-gray-600">No disponible</span>;

function fmtMonedas(obj: Record<string, number> | null | undefined): React.ReactNode {
  if (!obj || Object.keys(obj).length === 0) return ND;
  return Object.entries(obj)
    .map(([moneda, valor]) => `${SIMBOLO_MONEDA[moneda] ?? moneda} ${num(valor)}`)
    .join(" · ");
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ClientesUnicosVisionGeneralPage() {
  const [periodo, setPeriodo] = useState("30");
  const [personalizado, setPersonalizado] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [data, setData] = useState<ResumenData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    const params = new URLSearchParams({ vista: "resumen" });
    if (personalizado && desde) {
      params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
    } else {
      params.set("periodo", periodo);
    }
    try {
      const r = await fetch(`/api/admin/tarot/clientes-unicos?${params.toString()}`, { cache: "no-store" });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
      } else {
        setData(json);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [periodo, personalizado, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const r = data?.resumen;

  return (
    <main className="px-6 py-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">Visión general</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Personas únicas (no registros) con historial comercial consolidado — ver &quot;Clientes&quot; en el menú para el detalle.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {PERIODOS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setPersonalizado(false); setPeriodo(key); }}
              className={`text-xs px-3 py-1.5 transition-colors ${!personalizado && periodo === key ? "bg-amber-800/50 text-amber-200" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"}`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setPersonalizado(true)}
            className={`text-xs px-3 py-1.5 transition-colors border-l border-gray-700 ${personalizado ? "bg-amber-800/50 text-amber-200" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"}`}
          >
            Personalizado
          </button>
        </div>
        {personalizado && (
          <div className="flex items-center gap-2">
            <input
              type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-1.5 focus:outline-none focus:border-amber-500"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="border border-gray-700 rounded-lg bg-gray-900 text-sm text-white px-3 py-1.5 focus:outline-none focus:border-amber-500"
            />
            <button onClick={cargar} className="text-xs px-3 py-1.5 rounded-lg border border-amber-700 bg-amber-900/40 text-amber-200 hover:bg-amber-800/50 transition-colors">
              Aplicar
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
          <AlertCircle size={15} className="shrink-0" />
          {errorMsg}
        </div>
      )}

      {cargando && !data && (
        <p className="text-sm text-gray-500 animate-pulse py-10 text-center">Cargando…</p>
      )}

      {r && (
        <>
          <p className="text-xs text-gray-600 mb-3 uppercase tracking-wider">Histórico</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <Metric label="Clientes únicos" value={num(r.clientes_unicos_total)} sub={`de ${data?.registros_totales} registros (${data?.personas_totales} personas totales)`} />
            <Metric label="% recurrencia" value={r.pct_recurrencia_historico !== null ? pct(r.pct_recurrencia_historico) : ND} sub="≥2 compras / clientes con compra" />
          </div>

          <p className="text-xs text-gray-600 mb-3 uppercase tracking-wider">Período seleccionado</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Metric label="Nuevos" value={num(r.nuevos_periodo)} sub="primera compra en el período" />
            <Metric label="Recurrentes" value={num(r.recurrentes_periodo)} sub="ya habían comprado antes" />
            <Metric label="Compras" value={num(r.compras_periodo)} />
            <Metric label="Compras por cliente" value={r.compras_por_cliente_periodo !== null ? r.compras_por_cliente_periodo.toFixed(2) : ND} />
            <Metric label="Ingreso total" value={fmtMonedas(r.ingreso_total_periodo_por_moneda)} />
            <Metric label="Ingreso promedio por cliente" value={fmtMonedas(r.ingreso_promedio_por_cliente_periodo_por_moneda)} />
            <Metric label="Ticket promedio" value={fmtMonedas(r.ticket_promedio_periodo_por_moneda)} />
          </div>
        </>
      )}
    </main>
  );
}
