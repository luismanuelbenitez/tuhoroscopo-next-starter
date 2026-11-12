"use client";
import { ShoppingCart } from "lucide-react";

// Embudo del checkout de las visitas de Google Ads (2026-11-12, Manuel: "este
// dashboard es revelador, dejamos ir muchos clientes"). Paso a paso, de las
// que llegaron al checkout: eligió tema → nombre → WhatsApp → fue a Mercado
// Pago → compró. Marca en rojo el paso donde más gente se va. Solo lectura
// (rpc google_ads_embudo_checkout).

export interface EmbudoCheckoutDatos {
  dias: number;
  total: { llegaron: number; tema: number; nombre: number; telefono: number; terminos: number; envio: number; mp: number; compro: number; movil: number; mediana_seg: number | null };
  por_dia: { fecha: string; llegaron: number; tema: number; nombre: number; telefono: number; mp: number; compro: number }[];
}

const diaCorto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function EmbudoCheckout({ datos }: { datos: EmbudoCheckoutDatos | null | undefined }) {
  if (!datos?.total) return null;
  const t = datos.total;
  const pasos: [string, number][] = [
    ["Llegaron al checkout", t.llegaron],
    ["Eligieron tema", t.tema],
    ["Escribieron el nombre", t.nombre],
    ["Dejaron el WhatsApp", t.telefono],
    ["Fueron a Mercado Pago", t.mp],
    ["Compraron", t.compro],
  ];
  // Paso con la mayor pérdida (en personas) respecto del anterior.
  let peor = -1, maxPerdida = 0;
  pasos.forEach(([, n], i) => { if (i > 0 && pasos[i - 1][1] - n > maxPerdida) { maxPerdida = pasos[i - 1][1] - n; peor = i; } });
  const base = Math.max(t.llegaron, 1);

  return (
    <section className="rounded-2xl border border-rose-900/50 bg-gradient-to-b from-rose-950/20 via-gray-900/40 to-gray-950/40 p-4 md:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-300">Checkout · visitas de Google Ads</p>
      <p className="mt-0.5 flex items-center gap-2 text-base font-semibold text-white"><ShoppingCart size={16} className="text-rose-300" /> Dónde se van en el checkout</p>
      <p className="mt-0.5 text-[11px] text-gray-400">
        Últimos {datos.dias} días · {t.movil} de {t.llegaron} desde el celular · tiempo típico en el checkout: {t.mediana_seg != null ? `${Math.round(t.mediana_seg)} s` : "—"} · sin tráfico interno.
      </p>

      <div className="mt-4 space-y-2">
        {pasos.map(([etiqueta, n], i) => {
          const ancho = Math.max((n / base) * 100, n > 0 ? 3 : 0);
          const malo = i === peor && maxPerdida > 0;
          const perdida = i > 0 ? pasos[i - 1][1] - n : 0;
          return (
            <div key={etiqueta} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.75rem] items-center gap-2.5 text-xs md:grid-cols-[12rem_minmax(0,1fr)_7rem] md:gap-3">
              <span className={`truncate ${malo ? "font-semibold text-rose-200" : "text-gray-300"}`}>{etiqueta}</span>
              <div className="h-5 rounded bg-gray-800/60" title={`${etiqueta}: ${n} (${pct(n, t.llegaron)} % de las que llegaron)`}>
                <div className={`h-5 rounded ${malo ? "bg-rose-500/80" : "bg-sky-500/70"}`} style={{ width: `${ancho}%` }} />
              </div>
              <span className="text-right tabular-nums text-gray-200">
                <span className="font-semibold text-white">{n}</span> <span className="text-gray-500">({pct(n, t.llegaron)} %)</span>
                {i > 0 && perdida > 0 && <span className={`block text-[10px] ${malo ? "text-rose-300" : "text-gray-500"}`}>−{perdida} acá</span>}
              </span>
            </div>
          );
        })}
      </div>
      {peor > 0 && maxPerdida > 0 && (
        <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
          Donde más se pierde: entre «{pasos[peor - 1][0].toLowerCase()}» y «{pasos[peor][0].toLowerCase()}» ({maxPerdida} {maxPerdida === 1 ? "persona" : "personas"}).
        </p>
      )}

      {datos.por_dia.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="pb-2 font-medium">Día</th><th className="pb-2 text-right font-medium">Llegaron</th><th className="pb-2 text-right font-medium">Tema</th><th className="pb-2 text-right font-medium">Nombre</th><th className="pb-2 text-right font-medium">WhatsApp</th><th className="pb-2 text-right font-medium">Mercado Pago</th><th className="pb-2 text-right font-medium">Compras</th>
            </tr></thead>
            <tbody>
              {[...datos.por_dia].reverse().map((d) => (
                <tr key={d.fecha} className="border-t border-gray-800/80 tabular-nums">
                  <td className="py-1.5 text-gray-200">{diaCorto(d.fecha)}</td>
                  <td className="py-1.5 text-right">{d.llegaron}</td>
                  <td className="py-1.5 text-right">{d.tema}</td>
                  <td className={`py-1.5 text-right ${d.tema >= 2 && d.nombre === 0 ? "text-rose-300" : ""}`}>{d.nombre}</td>
                  <td className="py-1.5 text-right">{d.telefono}</td>
                  <td className="py-1.5 text-right">{d.mp}</td>
                  <td className={`py-1.5 text-right ${d.compro > 0 ? "font-semibold text-emerald-300" : ""}`}>{d.compro}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10px] text-gray-500">El checkout nuevo (más rápido, textos nuevos) se publicó el 11/11 a la noche: comparar desde el 12/11.</p>
        </div>
      )}
    </section>
  );
}
