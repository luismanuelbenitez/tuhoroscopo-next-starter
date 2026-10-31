"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

// Ingresos (rediseño 2026-10-31): cuánto entró, cuánto queda después de
// Mercado Pago, cómo viene contra el período anterior y quién pagó.
// Por defecto sin compras de prueba (dispositivos internos).

interface Moneda { ventas: number; cobrado: number; comision: number; neto: number }
interface Resumen { ventas: number; uyu: Moneda; ars: Moneda }
interface Pago {
  id: string; orden_id: string; created_at: string; moneda: string; monto: number; comision: number | null; neto: number | null;
  medio: string | null; marca: string | null; cuotas: number; cliente: string | null; tema: string | null;
  estado_orden: string | null; origen: string | null; interna: boolean;
}
interface Datos {
  ok: boolean; periodo: string; incluir: boolean;
  ttc: {
    actual: Resumen; anterior: Resumen | null; internas_excluidas: number;
    serie: { por: "dia" | "semana"; puntos: { clave: string; cobrado: number; ventas: number }[] };
    medios: { medio: string; ventas: number }[];
    recientes: Pago[];
  };
  thc: { activas_total: number; activas_uyu: number; activas_ars: number; mrr_uyu: number; mrr_ars: number; nuevas_periodo: number; canceladas_periodo: number; total_suscripciones: number };
}

const PERIODOS = [
  { key: "hoy", label: "Hoy", antes: "ayer" },
  { key: "7d", label: "7 días", antes: "los 7 días anteriores" },
  { key: "30d", label: "30 días", antes: "los 30 días anteriores" },
  { key: "90d", label: "90 días", antes: "los 90 días anteriores" },
  { key: "todo", label: "Todo", antes: "" },
];
const TEMAS: Record<string, string> = { general: "General", amor: "Amor", trabajo: "Trabajo", salud: "Salud", dinero: "Dinero", decision: "Decisión" };
const MEDIOS: Record<string, string> = { credit_card: "Tarjeta de crédito", debit_card: "Tarjeta de débito", account_money: "Dinero en Mercado Pago", ticket: "Efectivo (Abitab/Redpagos)", bank_transfer: "Transferencia", prepaid_card: "Tarjeta prepaga", otro: "Otro" };
const MARCAS: Record<string, string> = { visa: "Visa", master: "Mastercard", oca: "OCA", debvisa: "Visa Débito", debmaster: "Master Débito", amex: "Amex", diners: "Diners", lider: "Líder", creditel: "Creditel" };

const pesos = (v: number) => `$ ${Math.round(v).toLocaleString("es-UY")}`;
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function TarotIngresosPage() {
  const [periodo, setPeriodo] = useState("30d");
  const [incluir, setIncluir] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/tarot/ingresos?periodo=${periodo}&incluir=${incluir ? 1 : 0}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`);
      else { setDatos(j); setErrorMsg(null); }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [periodo, incluir]);
  usePollingRefresh(cargar, 120_000);

  const t = datos?.ttc;
  const a = t?.actual.uyu, b = t?.anterior?.uyu ?? null;
  const antes = PERIODOS.find((p) => p.key === periodo)?.antes ?? "";

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1280px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Ingresos</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Lo que entró por ventas de lecturas y lo que te queda después de Mercado Pago.
              {antes && <> Comparado con {antes}.</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="accent-amber-500" />
              Incluir compras de prueba
            </label>
            <div className="flex rounded-md border border-gray-700 overflow-hidden">
              {PERIODOS.map((p) => (
                <button key={p.key} onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1 text-xs transition-colors ${periodo === p.key ? "bg-amber-900/40 text-amber-300" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={cargar} title="Actualizar" className="p-1.5 rounded-md border border-gray-700 text-gray-400 hover:text-gray-200">
              <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}
        {!datos && cargando && <p className="text-sm text-gray-500 animate-pulse">Cargando ingresos…</p>}

        {t && a && (
          <div className={`space-y-6 transition-opacity ${cargando ? "opacity-70" : ""}`}>
            {/* Cifras */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Cifra titulo="Ventas" valor={String(a.ventas)} actual={a.ventas} anterior={b?.ventas} />
              <Cifra titulo="Cobrado" valor={pesos(a.cobrado)} actual={a.cobrado} anterior={b?.cobrado} fmt={pesos} />
              <Cifra titulo="Te queda (neto Mercado Pago)" valor={pesos(a.neto)} actual={a.neto} anterior={b?.neto} fmt={pesos} destacar
                nota={a.cobrado > 0 ? `Mercado Pago se quedó ${pesos(a.comision)} (${Math.round((a.comision / a.cobrado) * 100)} %)` : undefined} />
              <Cifra titulo="Ticket promedio" valor={a.ventas ? pesos(a.cobrado / a.ventas) : "—"}
                nota={t.internas_excluidas > 0 ? `${t.internas_excluidas} compra${t.internas_excluidas > 1 ? "s" : ""} de prueba fuera del cálculo` : undefined} />
            </div>
            {t.actual.ars.ventas > 0 && (
              <p className="text-xs text-gray-400">También hubo {t.actual.ars.ventas} venta{t.actual.ars.ventas > 1 ? "s" : ""} en pesos argentinos: ARS {Math.round(t.actual.ars.cobrado).toLocaleString("es-UY")} (neto ARS {Math.round(t.actual.ars.neto).toLocaleString("es-UY")}).</p>
            )}

            {/* Serie + medios */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-4">
                <p className="text-[11px] text-gray-500 mb-3">Cobrado por {t.serie.por === "dia" ? "día" : "semana"} (UYU)</p>
                <Barras puntos={t.serie.puntos} porDia={t.serie.por === "dia"} />
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-4 text-xs">
                <p className="text-[11px] text-gray-500 mb-2">Cómo pagaron</p>
                {t.medios.length === 0 && <p className="text-gray-600">Sin pagos en el período.</p>}
                {t.medios.sort((x, y) => y.ventas - x.ventas).map((m) => (
                  <div key={m.medio} className="flex justify-between py-1 border-b border-gray-800/60 last:border-0">
                    <span className="text-gray-300">{MEDIOS[m.medio] ?? m.medio}</span>
                    <span className="tabular-nums text-gray-400">{m.ventas}</span>
                  </div>
                ))}
                <Link href={"/admin/tarot/presupuesto" as Route} className="mt-3 inline-flex items-center gap-1 text-violet-300 hover:text-violet-200">
                  ¿Gano o pierdo? Ver Presupuesto <ArrowRight size={11} />
                </Link>
              </div>
            </div>

            {/* Pagos */}
            <section>
              <h3 className="text-sm font-semibold text-gray-100 mb-3">Quién pagó</h3>
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900 text-left text-gray-500">
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      <th className="px-4 py-2 font-medium">Cuándo</th>
                      <th className="px-4 py-2 font-medium text-right">Cobrado</th>
                      <th className="px-4 py-2 font-medium text-right">Te queda</th>
                      <th className="px-4 py-2 font-medium">Medio</th>
                      <th className="px-4 py-2 font-medium">Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.recientes.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Sin pagos en el período.</td></tr>}
                    {t.recientes.map((p) => (
                      <tr key={p.id} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                        <td className="px-4 py-2.5" title={`Orden ${p.orden_id}`}>
                          <Link href={`/admin/tarot/ordenes?orden_id=${p.orden_id}` as Route} className="text-gray-100 hover:text-amber-200">{p.cliente ?? "Sin nombre"}</Link>
                          {p.interna && <span className="ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-gray-800 text-gray-400">Prueba</span>}
                          <span className="block text-[11px] text-gray-500">{p.tema ? (TEMAS[p.tema] ?? p.tema) : "—"}{p.origen ? ` · ${p.origen}` : ""}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{fechaHora(p.created_at)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-200 whitespace-nowrap">{p.moneda === "UYU" ? "$" : p.moneda} {Math.round(p.monto).toLocaleString("es-UY")}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-300/90 whitespace-nowrap">{p.neto != null ? `${p.moneda === "UYU" ? "$" : p.moneda} ${Math.round(p.neto).toLocaleString("es-UY")}` : "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400">
                          {MEDIOS[p.medio ?? "otro"] ?? p.medio}
                          {p.marca && <span className="text-gray-600"> · {MARCAS[p.marca] ?? p.marca}</span>}
                          {p.cuotas > 1 && <span className="text-gray-600"> · {p.cuotas} cuotas</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[11px] ${p.estado_orden === "entregado" ? "text-emerald-300" : p.estado_orden?.startsWith("error") ? "text-red-300" : "text-amber-300"}`}>
                            {p.estado_orden === "entregado" ? "Entregada" : p.estado_orden?.startsWith("error") ? "Con error" : "En curso"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Horóscopo */}
            <section className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-violet-400/80 mb-2">Tu Oráculo · Horóscopo (suscripciones)</p>
              {datos.thc.total_suscripciones === 0 ? (
                <p className="text-xs text-gray-500">Todavía no hay suscripciones de Horóscopo.</p>
              ) : (
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
                  <Mini label="Activas" valor={String(datos.thc.activas_total)} />
                  <Mini label="Ingreso mensual (UYU)" valor={pesos(datos.thc.mrr_uyu)} />
                  <Mini label="Ingreso mensual (ARS)" valor={`ARS ${datos.thc.mrr_ars.toLocaleString("es-UY")}`} />
                  <Mini label="Nuevas en el período" valor={String(datos.thc.nuevas_periodo)} />
                  <Mini label="Canceladas" valor={String(datos.thc.canceladas_periodo)} />
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

function Cifra({ titulo, valor, actual, anterior, fmt = (v: number) => String(v), nota, destacar }: {
  titulo: string; valor: string; actual?: number; anterior?: number; fmt?: (v: number) => string; nota?: string; destacar?: boolean;
}) {
  const dif = actual != null && anterior != null ? actual - anterior : null;
  return (
    <div className={`rounded-xl border px-4 py-3 ${destacar ? "border-emerald-800/60 bg-emerald-950/20" : "border-gray-800 bg-gray-900/60"}`}>
      <p className="text-[11px] text-gray-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${destacar ? "text-emerald-300" : "text-white"}`}>{valor}</p>
      {dif != null && (
        Math.abs(dif) < 0.5
          ? <p className="text-[11px] text-gray-500 mt-0.5">igual que antes</p>
          : <p className={`text-[11px] mt-0.5 ${dif > 0 ? "text-emerald-400" : "text-red-400"}`}>{dif > 0 ? "↑" : "↓"} {fmt(Math.abs(dif))} <span className="text-gray-500">(antes {fmt(anterior ?? 0)})</span></p>
      )}
      {nota && <p className="text-[11px] text-gray-500 mt-0.5">{nota}</p>}
    </div>
  );
}

function Mini({ label, valor }: { label: string; valor: string }) {
  return <div><p className="text-[10px] text-gray-500">{label}</p><p className="text-sm text-gray-200 tabular-nums">{valor}</p></div>;
}

function Barras({ puntos, porDia }: { puntos: { clave: string; cobrado: number; ventas: number }[]; porDia: boolean }) {
  const max = Math.max(1, ...puntos.map((p) => p.cobrado));
  const etiqueta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const cada = Math.max(1, Math.ceil(puntos.length / 10));
  return (
    <div>
      <div className="flex items-end gap-1 h-36">
        {puntos.map((p) => (
          <div key={p.clave} className="flex-1 h-full flex flex-col justify-end items-center group"
            title={`${porDia ? "" : "Semana del "}${etiqueta(p.clave)}: ${pesos(p.cobrado)} · ${p.ventas} venta${p.ventas === 1 ? "" : "s"}`}>
            {p.cobrado > 0 && <span className="text-[9px] text-amber-300/80 mb-0.5 tabular-nums">{Math.round(p.cobrado)}</span>}
            <div className={`w-full max-w-[28px] rounded-t ${p.cobrado > 0 ? "bg-amber-500/80 group-hover:bg-amber-400" : "bg-gray-800"}`}
              style={{ height: p.cobrado > 0 ? `${Math.max((p.cobrado / max) * 85, 4)}%` : "2px" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {puntos.map((p, i) => (
          <span key={p.clave} className="flex-1 text-center text-[9px] text-gray-600">{i % cada === 0 || i === puntos.length - 1 ? etiqueta(p.clave) : ""}</span>
        ))}
      </div>
    </div>
  );
}
