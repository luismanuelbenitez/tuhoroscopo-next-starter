"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpDown, BarChart3, ChevronDown, CircleDot, FlaskConical, Info, LayoutDashboard, Lock, Route as RouteIcon, ShieldAlert, Table2 } from "lucide-react";
import { DiagnosticoIA } from "@/components/admin/inteligencia/DiagnosticoIA";
import {
  Pagina, Seccion, Panel, Kpi, Delta, Dato, Insignia, Punto, Aviso, Vacio, Esqueleto, EsqueletoPagina, ErrorCarga, Desplegable, Ayuda, Segmentado, Selector, Enlace, Actualizar, Rotulo,
  pesos, pesosConSigno, entero, veces, pct, porcentaje, fechaCorta, useVista, type Tono,
} from "@/components/admin/inteligencia/ui";
import { useAncho, marcasEje, COLOR } from "@/components/admin/inteligencia/graficos";
import type { DatosCentro, FilaCanal } from "@/lib/inteligencia/centro";
import { ATRIBUCIONES, type Atribucion } from "@/lib/inteligencia/canales";
import type { Bandeja, Recomendacion } from "@/lib/inteligencia/recomendaciones";
import { clasificar, PALANCA } from "@/lib/inteligencia/bandeja";

// Inteligencia comercial · Centro de control (fase 1, 2026-11-24; Level Up 2026-11-25).
// En menos de 30 segundos: ¿gano o pierdo plata y por qué?, ¿cómo va el mes
// contra la meta?, ¿cuánto cuesta un cliente?, ¿qué decidir hoy?, ¿qué canal
// rinde y dónde se pierde la gente? Las decisiones salen de la misma bandeja
// que Recomendaciones (sin duplicar alertas). Solo lectura.

const RUTA_RECO = "/admin/tarot/inteligencia/recomendaciones";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Consolidado = DatosCentro["actual"];

// ── Costos fijos del período: por qué no son el total mensual ───────────────
/** Cada costo fijo se imputa por los días en que estuvo vigente dentro del
 *  período (un mes = 30,44 días). Si uno empezó o terminó en el medio, el
 *  período carga solo esa parte. */
function explicacionFijos(a: Consolidado, mensual: number) {
  const parciales = a.fijos_detalle.filter((f) => f.dias < a.dias_periodo - 0.05);
  const texto = [
    `Cada costo fijo se imputa por los días en que estuvo vigente dentro del período (un mes = 30,44 días; ${Math.round(a.dias_periodo)} días son el ${((a.dias_periodo / 30.4375) * 100).toFixed(1).replace(".", ",")} % de un mes).`,
    ...parciales.map((f) => `${f.nombre} rige desde el ${fechaCorta(f.desde)}${f.hasta ? ` hasta el ${fechaCorta(f.hasta)}` : ""}: ${Math.round(f.dias)} de ${Math.round(a.dias_periodo)} días.`),
    a.puntuales > 0 ? `Incluye ${pesos(a.puntuales)} de gastos puntuales del período.` : "",
    `Total mensual vigente hoy: ${pesos(mensual)}.`,
  ].filter(Boolean).join(" ");
  const corto = parciales.length ? `${parciales.map((f) => `${f.nombre} desde el ${fechaCorta(f.desde)}`).join(", ")}` : `${Math.round(a.dias_periodo)} días de ${pesos(mensual)}/mes`;
  return { texto, corto, parciales };
}

// ── 1. Situación económica ───────────────────────────────────────────────────
function BarraMeta({ resultado, objetivo }: { resultado: number; objetivo: number }) {
  const min = Math.min(resultado, 0), max = Math.max(objetivo, resultado, 1);
  const rango = (max - min) * 1.04 || 1;
  const x = (v: number) => ((v - min) / rango) * 100 + 1;
  const cero = x(0), actual = x(resultado), meta = x(objetivo);
  const negativo = resultado < 0;
  return (
    <div className="pb-8 pt-10" role="img" aria-label={`Resultado del mes ${pesos(resultado)}; equilibrio en $ 0; meta ${pesos(objetivo)}.`}>
      <div className="relative h-2.5 rounded-full bg-white/[0.07]">
        {negativo
          ? <div className="absolute inset-y-0 rounded-l-full bg-rose-400/80" style={{ left: `${actual}%`, width: `${cero - actual}%` }} />
          : <div className="absolute inset-y-0 rounded-r-full bg-emerald-400/80" style={{ left: `${cero}%`, width: `${Math.min(actual, meta) - cero}%` }} />}
        {/* Valor actual */}
        <div className={`absolute -top-7 whitespace-nowrap text-[12.5px] font-semibold tabular-nums ${actual < 18 ? "-translate-x-2" : actual > 82 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${actual}%` }}>
          <span className={negativo ? "text-rose-300" : "text-emerald-300"}>Hoy {pesos(resultado)}</span>
        </div>
        <div className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0b0f17] ${negativo ? "bg-rose-300" : "bg-emerald-300"}`} style={{ left: `${actual}%` }} />
        {/* Equilibrio y meta */}
        <div className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-gray-300" style={{ left: `${cero}%` }} />
        <div className="absolute top-4 -translate-x-1/2 whitespace-nowrap text-[12px] text-gray-300" style={{ left: `${cero}%` }}>Equilibrio</div>
        <div className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-emerald-300" style={{ left: `${meta}%` }} />
        <div className="absolute top-4 -translate-x-full whitespace-nowrap text-[12px] text-emerald-300" style={{ left: `${meta}%` }}>Meta {pesos(objetivo)}</div>
      </div>
    </div>
  );
}

function Situacion({ d }: { d: DatosCentro }) {
  const a = d.actual, b = d.anterior, m = d.mes;
  const gana = a.resultado >= 0;
  const comparable = b.ventas > 0 || b.inversion > 0;
  const lineas = [
    { t: "Margen de las ventas", v: a.margen_contribucion, ayuda: "Lo que dejaron las ventas cobradas después de los costos variables (Mercado Pago, IA, audio, WhatsApp)." },
    { t: "Publicidad", v: -a.inversion },
    { t: "Costos fijos del período", v: -a.costos_fijos, ayuda: explicacionFijos(a, d.economia.fijos_mensuales).texto },
    ...(a.cortesias > 0 ? [{ t: "Lecturas de cortesía", v: -a.cortesias }] : []),
  ];
  const maxAbs = Math.max(...lineas.map((l) => Math.abs(l.v)), Math.abs(a.resultado), 1);
  const mesNombre = MESES[Number(m.desde.slice(5, 7)) - 1] ?? "el mes";
  const falta = m.objetivo != null ? m.objetivo - m.resultado : null;
  return (
    <Panel cuerpo="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Rotulo>Resultado neto · últimos {d.dias} días</Rotulo>
          <Insignia tono={gana ? "positivo" : "negativo"}>{gana ? "Ganancia" : "Pérdida"}</Insignia>
        </div>
        <p className={`mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[44px] ${gana ? "text-emerald-300" : "text-rose-300"}`}>{pesos(a.resultado)}</p>
        <div className="mt-3 text-[13px]"><Delta ahora={a.resultado} antes={b.resultado} formato={pesos} comparable={comparable || b.costos_fijos > 0} /></div>
        <p className="mt-4 text-[14px] leading-relaxed text-gray-300">
          {a.ventas === 0
            ? <>No hubo ventas cobradas en el período{a.inversion > 0 ? <> y se invirtieron <b className="font-semibold text-gray-50">{pesos(a.inversion)}</b> en publicidad</> : null}.</>
            : <><b className="font-semibold text-gray-50">{a.ventas} {a.ventas === 1 ? "venta" : "ventas"}</b> dejaron {pesos(a.margen_contribucion)} de margen{a.margen_contribucion < a.inversion + a.costos_fijos ? <>; la publicidad y los costos fijos lo superaron.</> : <> y cubrieron publicidad y costos fijos.</>}</>}
        </p>
        <dl className="mt-3 space-y-1.5">
          {lineas.map((l) => (
            <div key={l.t} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_100px_minmax(80px,38%)]">
              <dt className="flex items-center gap-1 text-gray-400">{l.t}{l.ayuda && <Ayuda texto={l.ayuda} lado="izq" />}</dt>
              <dd className={`text-right font-medium tabular-nums ${l.v >= 0 ? "text-gray-100" : "text-gray-300"}`}>{pesosConSigno(l.v)}</dd>
              <dd aria-hidden="true" className="hidden h-1.5 rounded-full bg-white/[0.05] sm:block"><div className={`h-full rounded-full ${l.v >= 0 ? "bg-emerald-400/70" : "bg-rose-400/60"}`} style={{ width: `${(Math.abs(l.v) / maxAbs) * 100}%` }} /></dd>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.07] pt-1.5 text-[13px] sm:grid-cols-[minmax(0,1fr)_100px_minmax(80px,38%)]">
            <dt className="font-medium text-gray-200">Resultado</dt>
            <dd className={`text-right font-semibold tabular-nums ${gana ? "text-emerald-300" : "text-rose-300"}`}>{pesosConSigno(a.resultado)}</dd>
            <dd className="hidden sm:block" />
          </div>
        </dl>
      </div>
      <div className="border-t border-white/[0.07] p-5 md:p-6 lg:border-l lg:border-t-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Rotulo>Mes en curso · {mesNombre}</Rotulo>
          <span className="text-[12.5px] tabular-nums text-gray-400">Día {m.dias_transcurridos} de {d.dias_mes}</span>
        </div>
        <p className={`mt-2 text-[30px] font-semibold leading-none tracking-[-0.025em] tabular-nums ${m.resultado >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pesos(m.resultado)}</p>
        <p className="mt-2 text-[13.5px] text-gray-400">{m.ventas} {m.ventas === 1 ? "venta cobrada" : "ventas cobradas"} desde el {fechaCorta(m.desde)}</p>
        {m.objetivo != null ? (
          <>
            <BarraMeta resultado={m.resultado} objetivo={m.objetivo} />
            <div className="grid grid-cols-2 gap-3">
              <Dato etiqueta="Meta del mes" valor={pesos(m.objetivo)} sub="Ganancia después de publicidad y costos fijos" />
              <Dato etiqueta="Distancia a la meta" valor={falta != null && falta > 0 ? pesos(falta) : "Meta alcanzada"} tono={falta != null && falta > 0 ? "neutro" : "positivo"} sub={`Quedan ${Math.max(d.dias_mes - m.dias_transcurridos, 0)} días`} />
            </div>
          </>
        ) : (
          <Aviso tono="alerta" className="mt-4" titulo="Falta la meta del mes">Definila en <Enlace href="/admin/tarot/inteligencia/economia">Objetivos y economía</Enlace>.</Aviso>
        )}
      </div>
    </Panel>
  );
}

// ── 2. Indicadores ───────────────────────────────────────────────────────────
function Indicadores({ d }: { d: DatosCentro }) {
  const a = d.actual, b = d.anterior, e = d.economia;
  const pocas = a.ventas > 0 && a.ventas < 3;
  const pagos = d.canales.filter((c) => c.pago);
  const invPagos = pagos.reduce((t, c) => t + c.inversion, 0), nuevosPagos = pagos.reduce((t, c) => t + c.clientes_nuevos, 0);
  const cacPagos = invPagos > 0 && nuevosPagos > 0 ? invPagos / nuevosPagos : null;
  const tonoCac = (v: number | null): Tono => v == null ? "neutro" : e.cac_maximo != null && v > e.cac_maximo ? "negativo" : e.cac_objetivo != null && v > e.cac_objetivo ? "alerta" : "positivo";
  const refs = <>Equilibrio <b className="font-medium text-gray-200 tabular-nums">{pesos(e.cac_maximo)}</b> · objetivo <b className="font-medium text-gray-200 tabular-nums">{e.cac_objetivo != null ? pesos(e.cac_objetivo) : "sin definir"}</b></>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Facturación" valor={pesos(a.facturacion)} delta={b.ventas > 0 ? <Delta ahora={a.facturacion} antes={b.facturacion} formato={pesos} /> : undefined} contexto={`${a.ventas} ${a.ventas === 1 ? "venta cobrada" : "ventas cobradas"}`} />
        <Kpi etiqueta="Inversión publicitaria" ayuda="Más gasto no es bueno ni malo por sí solo: se juzga por lo que cuesta cada cliente (CAC)." valor={pesos(a.inversion)} delta={b.inversion > 0 ? <Delta ahora={a.inversion} antes={b.inversion} formato={pesos} sentido="neutro" /> : undefined} contexto={`${pesos(a.inversion / Math.max(d.dias, 1))} por día`} />
        <Kpi etiqueta="Clientes nuevos" valor={entero(a.clientes_nuevos)} delta={b.ventas > 0 ? <Delta ahora={a.clientes_nuevos} antes={b.clientes_nuevos} formato={entero} /> : undefined} contexto={a.ventas > a.clientes_nuevos ? `Más ${a.ventas - a.clientes_nuevos} ${a.ventas - a.clientes_nuevos === 1 ? "compra" : "compras"} de clientes que ya habían comprado` : "Todas las ventas fueron de clientes nuevos"} />
        <Kpi etiqueta="CAC combinado" ayuda="Inversión publicitaria ÷ todos los clientes nuevos del período, vengan del canal que vengan." tono={tonoCac(a.cac_publicitario)}
          valor={a.cac_publicitario != null ? pesos(a.cac_publicitario) : a.inversion > 0 ? "Sin clientes" : "—"}
          contexto={<><span>{refs}</span>{pocas && <span className="mt-1 flex items-center gap-1 text-amber-200"><AlertTriangle size={12} aria-hidden="true" /> Con {a.ventas} ventas el número es poco confiable</span>}</>} />
      </div>
      <Panel cuerpo="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3 md:px-5 lg:grid-cols-6">
        <Dato etiqueta="CAC de canales pagos" ayuda="Inversión ÷ clientes nuevos atribuidos a Google Ads y Meta Ads (con el modelo de atribución elegido)." valor={cacPagos != null ? pesos(cacPagos) : "—"} tono={tonoCac(cacPagos)} sub={`${nuevosPagos} ${nuevosPagos === 1 ? "cliente atribuido" : "clientes atribuidos"}`} />
        <Dato etiqueta="Margen de contribución" ayuda="Facturación menos costos variables. Es lo que dejan las ventas antes de publicidad y costos fijos." valor={pesos(a.margen_contribucion)} sub={a.ventas > 0 ? `${pesos(a.margen_contribucion / a.ventas)} por venta` : undefined} />
        <Dato etiqueta="ROAS" ayuda="Facturación por cada peso invertido en publicidad. Por debajo de 1× la publicidad no se paga ni con la facturación." valor={veces(a.roas)} tono={a.roas != null && a.roas < 1 ? "negativo" : "neutro"} sub="Facturación ÷ inversión" />
        <Dato etiqueta="Costos variables" valor={pesos(a.costos_variables)} sub="Mercado Pago, IA, audio, WhatsApp" />
        <Dato etiqueta="Costos fijos del período" ayuda={explicacionFijos(a, e.fijos_mensuales).texto} valor={pesos(a.costos_fijos)} sub={`De ${pesos(e.fijos_mensuales)}/mes · ${explicacionFijos(a, e.fijos_mensuales).corto}`} />
        <Dato etiqueta="Costo total por cliente" ayuda="(Inversión + costos fijos y puntuales + cortesías) ÷ clientes nuevos. No es un CAC: suma costos del negocio que no son de adquisición." valor={a.cac_total != null ? pesos(a.cac_total) : "—"} sub="Incluye costos fijos" />
      </Panel>
    </div>
  );
}

// ── 4. Decisiones prioritarias ───────────────────────────────────────────────
function Decisiones({ bandeja }: { bandeja: { b: Bandeja | null; error: string | null } }) {
  const c = useMemo(() => (bandeja.b ? clasificar(bandeja.b) : null), [bandeja.b]);
  if (bandeja.error) return <ErrorCarga mensaje={`La bandeja de recomendaciones no respondió (${bandeja.error}).`} />;
  if (!c || !bandeja.b) return <Panel><div className="space-y-3"><Esqueleto className="h-5 w-1/3" /><Esqueleto className="h-20" /><Esqueleto className="h-20" /><Esqueleto className="h-20" /></div></Panel>;
  const lista: Recomendacion[] = [...c.problemas.map((p) => p.r), ...c.ejecutables].slice(0, 4);
  const resto = c.ejecutables.length + c.problemas.length - lista.length;
  const g = bandeja.b.esperar_google;
  return (
    <Panel cuerpo="">
      {g?.esperar && <Aviso tono="alerta" icono={Lock} className="m-4 mb-0 md:m-5 md:mb-0" titulo="No conviene tocar Google Ads todavía">{g.motivo}</Aviso>}
      {lista.length === 0 ? (
        <div className="p-4 md:p-5"><Vacio titulo="Nada para decidir hoy" texto="No hay recomendaciones ejecutables. Las bloqueadas esperan a que termine lo que las frena." /></div>
      ) : (
        <ol className="divide-y divide-white/[0.06]">
          {lista.map((r, i) => {
            const problema = c.problemas.some((p) => p.r.clave === r.clave);
            const restriccion = r.conflictos.find((x) => x.tipo === "contradiccion" || x.tipo === "memoria" || x.tipo === "posible_interferencia");
            return (
              <li key={r.clave}>
                <a href={`${RUTA_RECO}?r=${encodeURIComponent(r.clave)}`} className="group grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-4 transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] focus-visible:outline-none md:grid-cols-[28px_minmax(0,1fr)_auto] md:px-5">
                  <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums ${problema ? "bg-rose-400/15 text-rose-200" : "bg-white/[0.07] text-gray-200"}`}>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {problema ? <Insignia tono="negativo" icono={ShieldAlert}>Problema económico</Insignia> : <Insignia>{PALANCA[r.area]}</Insignia>}
                      <Insignia tono={r.efecto === "Frena una pérdida" ? "negativo" : r.efecto === "Mejora la conversión" ? "info" : "neutro"}>{r.efecto}</Insignia>
                      {r.sube_gasto && <Insignia tono="ia">Sube el gasto</Insignia>}
                    </div>
                    <p className="mt-2 text-[15px] font-semibold leading-snug text-gray-50">{r.titulo}</p>
                    <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-gray-400">{r.que_pasa}</p>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-gray-200"><span className="font-medium text-gray-400">Decisión: </span>{r.accion.length > 190 ? `${r.accion.slice(0, 187)}…` : r.accion}</p>
                    {restriccion && <p className="mt-2 flex gap-1.5 text-[12.5px] text-amber-200"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{restriccion.texto.length > 160 ? `${restriccion.texto.slice(0, 157)}…` : restriccion.texto}</p>}
                  </div>
                  <span className="col-start-2 mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-sky-300 group-hover:text-sky-200 md:col-start-3 md:row-start-1 md:mt-0.5">Decidir <ArrowRight size={14} aria-hidden="true" /></span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] px-4 py-3 text-[13px] text-gray-400 md:px-5">
        {resto > 0 && <span>{resto} {resto === 1 ? "ejecutable más" : "ejecutables más"}</span>}
        {c.bloqueadas.length > 0 && <span className="inline-flex items-center gap-1.5"><Lock size={13} aria-hidden="true" />{c.bloqueadas.length} bloqueadas</span>}
        {c.revalidar.length > 0 && <span>{c.revalidar.length} viejas para revalidar</span>}
        {c.esperando.length > 0 && <span>{c.esperando.length} esperando evidencia</span>}
        <Enlace href={RUTA_RECO} className="ml-auto inline-flex items-center gap-1">Ver la bandeja completa <ArrowRight size={13} aria-hidden="true" /></Enlace>
      </div>
    </Panel>
  );
}

const ETAPAS_EXP = ["Planificado", "Aplicado", "En medición", "En evaluación", "Cerrado"];
function etapaExp(e: { estado: string; aplicado_desde: string | null }) { return e.estado === "planificado" ? 0 : e.estado === "activo" ? 2 : 4; }

function Lateral({ d, bandeja }: { d: DatosCentro; bandeja: Bandeja | null }) {
  // Señales del período que no son acciones (las accionables ya están en la bandeja: no se repiten).
  const enBandeja = new Set((bandeja ? [...bandeja.para_decidir, ...bandeja.esperando, ...bandeja.aceptadas, ...bandeja.pospuestas] : []).map((r) => r.clave));
  const senales = d.atencion.filter((a) => !enBandeja.has(`centro:${a.id}`));
  const tono: Record<string, Tono> = { alta: "negativo", media: "alerta", info: "neutro" };
  return (
    <div className="space-y-4">
      <Panel titulo="Experimentos" icono={FlaskConical} accion={<Enlace href="/admin/tarot/inteligencia/experimentos" className="text-[13px]">Abrir</Enlace>}>
        {d.experimentos.length === 0 ? <p className="text-[13.5px] text-gray-400">No hay experimentos en curso ni planificados.</p> : (
          <ul className="space-y-4">
            {d.experimentos.map((e) => {
              const etapa = etapaExp(e);
              return (
                <li key={e.id}>
                  <p className="flex flex-wrap items-center gap-2"><Insignia tono="ia">{e.id}</Insignia><span className="text-[13px] text-gray-400">{ETAPAS_EXP[etapa]}{e.fin_previsto ? ` · fin previsto ${fechaCorta(e.fin_previsto)}` : ""}</span></p>
                  <p className="mt-1.5 text-[14px] font-medium leading-snug text-gray-100">{e.nombre}</p>
                  <div className="mt-2.5 flex gap-1" aria-label={`Etapa: ${ETAPAS_EXP[etapa]}`}>
                    {ETAPAS_EXP.map((t, i) => <span key={t} title={t} className={`h-1.5 flex-1 rounded-full ${i <= etapa ? "bg-violet-400" : "bg-white/[0.08]"}`} />)}
                  </div>
                  {e.estado === "planificado" && <p className="mt-2 text-[12.5px] text-amber-200">Sin aplicar: la campaña sigue con la estructura vieja.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel titulo="Señales del período" icono={CircleDot}>
        {senales.length === 0 ? <p className="text-[13.5px] text-gray-400">Nada fuera de lo normal además de lo que está en la bandeja.</p> : (
          <ul className="space-y-3">
            {senales.map((s) => (
              <li key={s.id} className="flex gap-2.5">
                <Punto tono={tono[s.nivel]} className="mt-1.5" />
                <div className="min-w-0 text-[13.5px]">
                  <p className="font-medium text-gray-100">{s.titulo}</p>
                  <p className="mt-0.5 leading-snug text-gray-400">{s.detalle}{s.enlace && <> <Enlace href={s.enlace}>Definirlo</Enlace></>}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ── 5. Evolución económica ───────────────────────────────────────────────────
function Evolucion({ d }: { d: DatosCentro }) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const primera = d.semanas.findIndex((w) => w.inversion > 0 || w.ventas > 0);
  const s = d.semanas.slice(primera < 0 ? 0 : Math.min(primera, d.semanas.length - 4));
  const eq = d.economia.cac_maximo, obj = d.economia.cac_objetivo;
  const exps = d.experimentos.filter((e) => e.aplicado_desde);
  const W = Math.max(ancho, 280), movil = W < 560;
  const L = movil ? 52 : 64, R = movil ? 12 : 104, T = 18, H1 = movil ? 190 : 230, B1 = 26, H2 = movil ? 110 : 124;
  const n = s.length, paso = (W - L - R) / Math.max(n, 1);
  const x = (i: number) => L + paso * (i + 0.5);
  const topeCac = Math.max(...s.map((w) => w.cac ?? 0), eq ?? 0, obj ?? 0, 1) * 1.12;
  const y1 = (v: number) => T + (1 - v / topeCac) * (H1 - T - B1);
  const marcas1 = marcasEje(topeCac, 4).filter((v) => v <= topeCac);
  const topeInv = Math.max(...s.map((w) => w.inversion), 1) * 1.15;
  const y2 = (v: number) => 18 + (1 - v / topeInv) * (H2 - 18 - 22);
  const marcas2 = marcasEje(topeInv, 2).filter((v) => v <= topeInv);
  const tramos: string[] = []; let tramo = "";
  s.forEach((w, i) => { if (w.cac == null) { if (tramo) tramos.push(tramo); tramo = ""; return; } tramo += `${tramo ? "L" : "M"}${x(i).toFixed(1)},${y1(w.cac).toFixed(1)}`; });
  if (tramo) tramos.push(tramo);
  const semanaDe = (iso: string) => s.findIndex((w) => iso.slice(0, 10) >= w.desde && iso.slice(0, 10) <= w.hasta);
  const h = hover != null ? s[hover] : null;
  const anchoBarra = Math.min(paso * 0.5, 40);
  const etiqueta = (v: number) => (v >= 1000 ? `$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(".", ",")} mil` : pesos(v));

  return (
    <Panel titulo="Costo por cliente nuevo e inversión, semana a semana" subtitulo="CAC combinado observado contra el equilibrio por primera compra y el objetivo. Debajo, la inversión de cada semana."
      accion={<button type="button" onClick={() => setTabla(!tabla)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-sky-300 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70">{tabla ? <BarChart3 size={14} /> : <Table2 size={14} />}{tabla ? "Ver gráfico" : "Ver tabla"}</button>}>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-gray-300">
        <span className="inline-flex items-center gap-2"><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke={COLOR.observado} strokeWidth="2" /><circle cx="11" cy="5" r="3.5" fill={COLOR.observado} /></svg>CAC observado</span>
        {eq != null && <span className="inline-flex items-center gap-2"><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke={COLOR.referencia} strokeWidth="1.5" strokeDasharray="5 4" /></svg>Equilibrio por primera compra</span>}
        {obj != null && <span className="inline-flex items-center gap-2"><svg width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke={COLOR.objetivo} strokeWidth="1.5" strokeDasharray="2 3" /></svg>CAC objetivo</span>}
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400/70" aria-hidden="true" />Inversión sin clientes nuevos</span>
        <span className="inline-flex items-center gap-2"><svg width="10" height="10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" transform="rotate(45 5 5)" fill="none" stroke="#d1d5db" strokeWidth="1.5" /></svg>Cambios registrados</span>
      </div>
      {tabla ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead><tr className="border-b border-white/[0.07] text-left text-[12px] text-gray-400"><th className="py-2 pr-3 font-medium">Semana</th><th className="py-2 pr-3 text-right font-medium">Inversión</th><th className="py-2 pr-3 text-right font-medium">Ventas</th><th className="py-2 pr-3 text-right font-medium">Clientes nuevos</th><th className="py-2 pr-3 text-right font-medium">CAC</th><th className="py-2 text-right font-medium">Cambios</th></tr></thead>
            <tbody>{s.map((w) => (
              <tr key={w.desde} className="border-b border-white/[0.04] text-gray-200">
                <td className="py-2 pr-3">{fechaCorta(w.desde)} – {fechaCorta(w.hasta)}{w.en_curso ? <span className="text-gray-400"> (en curso)</span> : ""}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pesos(w.inversion)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{w.ventas}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{w.clientes_nuevos}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${w.cac == null && w.inversion > 0 ? "text-rose-300" : ""}`}>{w.cac != null ? pesos(w.cac) : w.inversion > 0 ? "Sin clientes" : "—"}</td>
                <td className="py-2 text-right tabular-nums text-gray-400">{w.cambios.length || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative select-none" onMouseLeave={() => setHover(null)}>
          {ancho > 0 && (
            <svg width={W} height={H1 + H2 + 6} role="img" aria-label="CAC combinado por semana con equilibrio y objetivo, e inversión semanal" className="block">
              {/* Semanas con inversión y sin clientes nuevos: banda (no CAC cero). */}
              {s.map((w, i) => w.cac == null && w.inversion > 0 ? <rect key={`b${w.desde}`} x={x(i) - paso / 2 + 2} width={paso - 4} y={T - 6} height={H1 - B1 - T + 6} rx="6" fill={COLOR.perdida} opacity="0.07" /> : null)}
              {marcas1.map((v) => (
                <g key={`m${v}`}>
                  <line x1={L} x2={W - R} y1={y1(v)} y2={y1(v)} stroke={v === 0 ? COLOR.eje : COLOR.grilla} />
                  <text x={L - 10} y={y1(v)} textAnchor="end" dominantBaseline="central" fontSize="12" fill={COLOR.texto} className="tabular-nums">{etiqueta(v)}</text>
                </g>
              ))}
              {eq != null && <>
                <line x1={L} x2={W - R} y1={y1(eq)} y2={y1(eq)} stroke={COLOR.referencia} strokeWidth="1.5" strokeDasharray="6 5" />
                {!movil && <text x={W - R + 8} y={y1(eq)} dominantBaseline="central" fontSize="12" fill={COLOR.textoFuerte}>Equilibrio <tspan fill={COLOR.texto}>{pesos(eq)}</tspan></text>}
              </>}
              {obj != null && <>
                <line x1={L} x2={W - R} y1={y1(obj)} y2={y1(obj)} stroke={COLOR.objetivo} strokeWidth="1.5" strokeDasharray="2 4" opacity="0.85" />
                {!movil && <text x={W - R + 8} y={y1(obj)} dominantBaseline="central" fontSize="12" fill="#6ee7b7">Objetivo <tspan fill={COLOR.texto}>{pesos(obj)}</tspan></text>}
              </>}
              {exps.map((e) => { const i = semanaDe(e.aplicado_desde!); return i < 0 ? null : <g key={e.id}><line x1={x(i)} x2={x(i)} y1={T - 8} y2={H1 - B1} stroke={COLOR.ia} strokeDasharray="3 3" /><text x={x(i) + 4} y={T - 2} fontSize="11.5" fill={COLOR.ia}>{e.id}</text></g>; })}
              {tramos.map((p) => <path key={p} d={p} fill="none" stroke={COLOR.observado} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
              {s.map((w, i) => (
                <g key={w.desde}>
                  {w.cac != null && <circle cx={x(i)} cy={y1(w.cac)} r={hover === i ? 5.5 : 4.5} fill={COLOR.observado} stroke={COLOR.superficie} strokeWidth="2" />}
                  {w.cac == null && w.inversion > 0 && (paso >= 76
                    ? <text x={x(i)} y={T + 8} textAnchor="middle" fontSize="11.5" fill="#fda4af">sin clientes</text>
                    : <g stroke="#fda4af" strokeWidth="1.8" strokeLinecap="round"><line x1={x(i) - 4} x2={x(i) + 4} y1={T + 2} y2={T + 10} /><line x1={x(i) + 4} x2={x(i) - 4} y1={T + 2} y2={T + 10} /></g>)}
                  {w.cambios.length > 0 && <rect x={x(i) - 4} y={H1 - B1 + 9} width="8" height="8" transform={`rotate(45 ${x(i)} ${H1 - B1 + 13})`} fill={COLOR.superficie} stroke="#d1d5db" strokeWidth="1.5" />}
                </g>
              ))}
              {/* Inversión semanal */}
              <g transform={`translate(0 ${H1 + 6})`}>
                <text x={L} y={0} dominantBaseline="hanging" fontSize="11.5" fontWeight="500" fill={COLOR.texto}>Inversión semanal</text>
                {marcas2.slice(1).filter((v) => y2(v) > 22).map((v) => <g key={`i${v}`}><line x1={L} x2={W - R} y1={y2(v)} y2={y2(v)} stroke={COLOR.grilla} /><text x={L - 10} y={y2(v)} textAnchor="end" dominantBaseline="central" fontSize="11.5" fill={COLOR.texto}>{etiqueta(v)}</text></g>)}
                <line x1={L} x2={W - R} y1={y2(0)} y2={y2(0)} stroke={COLOR.eje} />
                {s.map((w, i) => {
                  const alto = y2(0) - y2(w.inversion);
                  return w.inversion > 0 ? <path key={w.desde} d={`M${x(i) - anchoBarra / 2},${y2(0)} v${-Math.max(alto - 3, 0)} q0,-3 3,-3 h${anchoBarra - 6} q3,0 3,3 v${Math.max(alto - 3, 0)} z`} fill={w.clientes_nuevos === 0 ? COLOR.perdida : COLOR.barra} opacity={w.clientes_nuevos === 0 ? 0.75 : hover === i ? 0.95 : 0.7} /> : null;
                })}
                {s.map((w, i) => <text key={`x${w.desde}`} x={x(i)} y={H2 - 6} textAnchor="middle" fontSize="12" fill={hover === i ? COLOR.textoFuerte : COLOR.texto} fontStyle={w.en_curso ? "italic" : undefined}>{fechaCorta(w.desde)}</text>)}
              </g>
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T - 6} y2={H1 + H2 - 18} stroke="rgba(255,255,255,0.14)" pointerEvents="none" />}
              {s.map((w, i) => <rect key={`h${w.desde}`} x={x(i) - paso / 2} y={0} width={paso} height={H1 + H2} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
            </svg>
          )}
          {h && hover != null && (
            <div className="pointer-events-none absolute top-0 z-10 w-60 rounded-lg bg-gray-900/95 px-3.5 py-3 text-[12.5px] text-gray-200 shadow-xl shadow-black/50 ring-1 ring-white/10"
              style={{ left: Math.min(Math.max(x(hover) - 120, 0), W - 240) }}>
              <p className="font-semibold text-gray-50">Semana del {fechaCorta(h.desde)}{h.en_curso ? " (en curso)" : ""}</p>
              <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
                <dt className="text-gray-400">CAC</dt><dd className={`text-right font-medium ${h.cac == null && h.inversion > 0 ? "text-rose-300" : "text-gray-50"}`}>{h.cac != null ? pesos(h.cac) : h.inversion > 0 ? "Sin clientes nuevos" : "Sin inversión"}</dd>
                <dt className="text-gray-400">Inversión</dt><dd className="text-right">{pesos(h.inversion)}</dd>
                <dt className="text-gray-400">Ventas</dt><dd className="text-right">{h.ventas}</dd>
                <dt className="text-gray-400">Clientes nuevos</dt><dd className="text-right">{h.clientes_nuevos}</dd>
              </dl>
              {h.cambios.length > 0 && <div className="mt-2 border-t border-white/10 pt-2"><p className="text-gray-400">{h.cambios.length} {h.cambios.length === 1 ? "cambio registrado" : "cambios registrados"}</p><ul className="mt-1 space-y-0.5">{h.cambios.slice(0, 3).map((c, k) => <li key={k} className="line-clamp-1">{c}</li>)}</ul></div>}
            </div>
          )}
        </div>
      )}
      {movil && !tabla && <p className="mt-2 text-[12.5px] text-gray-400">Equilibrio {pesos(eq)} · objetivo {obj != null ? pesos(obj) : "sin definir"}. Tocá una semana para ver el detalle.</p>}
    </Panel>
  );
}

// ── 6. Rendimiento por canal ─────────────────────────────────────────────────
type Clave = "inversion" | "visitas" | "checkout" | "ventas" | "clientes_nuevos" | "conv_visita" | "conv_checkout" | "cac" | "roas";
const TIPO_CANAL = (c: FilaCanal) => (c.pago ? "pago" : c.canal === "directo" ? "directo" : c.canal === "otro" ? "otro" : "organico");
const GRUPOS = [{ id: "pago", t: "Canales pagos" }, { id: "organico", t: "Orgánicos y sin pago" }, { id: "directo", t: "Directo" }, { id: "otro", t: "Sin origen identificado" }];

function Canales({ d }: { d: DatosCentro }) {
  const [orden, setOrden] = useState<{ k: Clave; asc: boolean }>({ k: "inversion", asc: false });
  const eq = d.economia.cac_maximo, obj = d.economia.cac_objetivo;
  const val = (c: FilaCanal, k: Clave): number | null => k === "conv_visita" ? (c.visitas > 0 ? c.ventas / c.visitas : null) : k === "conv_checkout" ? (c.checkout > 0 ? c.ventas / c.checkout : null) : (c[k] as number | null);
  const ordenar = (xs: FilaCanal[]) => [...xs].sort((a, b) => { const va = val(a, orden.k), vb = val(b, orden.k); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return orden.asc ? va - vb : vb - va; });
  const activos = d.canales.filter((c) => c.inversion > 0 || c.visitas > 0 || c.ventas > 0);
  const total = activos.reduce((a, c) => ({ inversion: a.inversion + c.inversion, visitas: a.visitas + c.visitas, checkout: a.checkout + c.checkout, ventas: a.ventas + c.ventas, ingresos: a.ingresos + c.ingresos, nuevos: a.nuevos + c.clientes_nuevos }), { inversion: 0, visitas: 0, checkout: 0, ventas: 0, ingresos: 0, nuevos: 0 });
  const tonoCac = (v: number | null): string => v == null ? "text-gray-400" : eq != null && v > eq ? "text-rose-300" : obj != null && v > obj ? "text-amber-200" : "text-emerald-300";
  const cols: { k: Clave; t: string; ayuda?: string }[] = [
    { k: "inversion", t: "Inversión" }, { k: "visitas", t: "Visitas" }, { k: "checkout", t: "Checkout" }, { k: "ventas", t: "Ventas" }, { k: "clientes_nuevos", t: "Nuevos" },
    { k: "conv_visita", t: "Visita → compra", ayuda: "Ventas ÷ visitas medidas del canal." }, { k: "conv_checkout", t: "Checkout → compra", ayuda: "Ventas ÷ llegadas al checkout." },
    { k: "cac", t: "CAC" }, { k: "roas", t: "ROAS" },
  ];
  const Cabeza = ({ k, t, ayuda }: { k: Clave; t: string; ayuda?: string }) => (
    <th scope="col" aria-sort={orden.k === k ? (orden.asc ? "ascending" : "descending") : "none"} className="px-2 py-2.5 text-right align-bottom font-medium">
      <span className="inline-flex items-end justify-end gap-1">
        {ayuda && <span className="mb-px"><Ayuda texto={ayuda} /></span>}
        <button type="button" onClick={() => setOrden({ k, asc: orden.k === k ? !orden.asc : false })} className={`inline-flex max-w-[92px] items-end gap-1 rounded text-right leading-tight hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${orden.k === k ? "text-gray-100" : ""}`}>
          <span>{t}</span><ArrowUpDown size={11} aria-hidden="true" className={`mb-0.5 shrink-0 ${orden.k === k ? "opacity-100" : "opacity-40"}`} />
        </button>
      </span>
    </th>
  );
  const fila = (c: FilaCanal) => {
    const cv = val(c, "conv_visita"), cc = val(c, "conv_checkout");
    return (
      <tr key={c.canal} className="border-t border-white/[0.05] text-gray-200 transition-colors hover:bg-white/[0.02]">
        <th scope="row" className="whitespace-nowrap py-3 pr-3 text-left font-medium text-gray-50">{c.nombre}</th>
        <td className="px-2 py-3 text-right tabular-nums">{c.inversion > 0 ? pesos(c.inversion) : <span className="text-gray-500">—</span>}</td>
        <td className="px-2 py-3 text-right tabular-nums">{entero(c.visitas)}</td>
        <td className="px-2 py-3 text-right tabular-nums">{entero(c.checkout)}</td>
        <td className="px-2 py-3 text-right font-medium tabular-nums text-gray-50">{c.ventas}</td>
        <td className="px-2 py-3 text-right tabular-nums">{c.clientes_nuevos}</td>
        <td className="px-2 py-3 text-right tabular-nums">{cv != null ? porcentaje(cv * 100) : "—"}</td>
        <td className="px-2 py-3 text-right tabular-nums">{cc != null ? porcentaje(cc * 100) : "—"}</td>
        <td className={`px-2 py-3 text-right font-medium tabular-nums ${c.pago ? tonoCac(c.cac) : "text-gray-500"}`}>{c.cac != null ? pesos(c.cac) : c.inversion > 0 ? "Sin clientes" : "—"}</td>
        <td className={`px-2 py-3 text-right tabular-nums ${c.roas != null && c.roas < 1 ? "text-rose-300" : ""}`}>{veces(c.roas)}</td>
        <td className="py-3 pl-2 text-right tabular-nums text-gray-400">{c.conversiones_plataforma != null ? entero(c.conversiones_plataforma) : "—"}</td>
      </tr>
    );
  };
  return (
    <Panel titulo="Rendimiento por canal" subtitulo={<>Cada venta cuenta una sola vez, en el canal que le asigna el modelo «{ATRIBUCIONES.find((a) => a.id === d.atribucion)?.nombre.toLowerCase()}». Las conversiones que informa cada plataforma van aparte: no son ventas cobradas.</>}>
      {/* Escritorio */}
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="text-[12.5px] text-gray-400">
              <th scope="col" className="w-[150px] py-2.5 pr-3 text-left align-bottom font-medium">Canal</th>
              {cols.map((c) => <Cabeza key={c.k} {...c} />)}
              <th scope="col" className="py-2.5 pl-2 text-right align-bottom font-medium"><span className="inline-flex items-end justify-end gap-1"><span className="mb-px"><Ayuda texto="Conversiones que informa Google o Meta. Pueden no coincidir con las ventas cobradas." lado="der" /></span><span className="max-w-[84px] leading-tight">Conv. de la plataforma</span></span></th>
            </tr>
          </thead>
          {GRUPOS.map((g) => {
            const xs = ordenar(activos.filter((c) => TIPO_CANAL(c) === g.id));
            if (!xs.length) return null;
            return (
              <tbody key={g.id}>
                <tr><td colSpan={11} className="pb-1 pt-4 text-[12px] font-medium uppercase tracking-[0.06em] text-gray-400">{g.t}</td></tr>
                {xs.map(fila)}
              </tbody>
            );
          })}
          <tfoot>
            <tr className="border-t border-white/[0.12] font-semibold text-gray-50">
              <th scope="row" className="whitespace-nowrap py-3 pr-3 text-left">Total del negocio</th>
              <td className="px-2 py-3 text-right tabular-nums">{pesos(total.inversion)}</td>
              <td className="px-2 py-3 text-right tabular-nums">{entero(total.visitas)}</td>
              <td className="px-2 py-3 text-right tabular-nums">{entero(total.checkout)}</td>
              <td className="px-2 py-3 text-right tabular-nums">{total.ventas}</td>
              <td className="px-2 py-3 text-right tabular-nums">{total.nuevos}</td>
              <td className="px-2 py-3 text-right tabular-nums">{pct(total.ventas, total.visitas)}</td>
              <td className="px-2 py-3 text-right tabular-nums">{pct(total.ventas, total.checkout)}</td>
              <td className={`px-2 py-3 text-right tabular-nums ${tonoCac(total.inversion > 0 && total.nuevos > 0 ? total.inversion / total.nuevos : null)}`}>{total.inversion > 0 && total.nuevos > 0 ? pesos(total.inversion / total.nuevos) : "—"}</td>
              <td className="px-2 py-3 text-right tabular-nums">{total.inversion > 0 ? veces(total.ingresos / total.inversion) : "—"}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {/* Celular: tarjetas con lo principal y el resto a pedido */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:hidden">
        {ordenar(activos).map((c) => {
          const cv = val(c, "conv_visita");
          return (
            <div key={c.canal} className="rounded-lg bg-white/[0.025] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14.5px] font-semibold text-gray-50">{c.nombre}</p>
                <Insignia tono={c.pago ? "info" : "neutro"}>{GRUPOS.find((g) => g.id === TIPO_CANAL(c))?.t.replace("Canales pagos", "Pago").replace("Orgánicos y sin pago", "Orgánico").replace("Sin origen identificado", "Sin origen")}</Insignia>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                <div><dt className="text-gray-400">Inversión</dt><dd className="font-medium tabular-nums text-gray-50">{c.inversion > 0 ? pesos(c.inversion) : "—"}</dd></div>
                <div><dt className="text-gray-400">Ventas · nuevos</dt><dd className="font-medium tabular-nums text-gray-50">{c.ventas} · {c.clientes_nuevos}</dd></div>
                <div><dt className="text-gray-400">CAC</dt><dd className={`font-medium tabular-nums ${c.pago ? tonoCac(c.cac) : "text-gray-400"}`}>{c.cac != null ? pesos(c.cac) : c.inversion > 0 ? "Sin clientes" : "—"}</dd></div>
                <div><dt className="text-gray-400">Visita → compra</dt><dd className="font-medium tabular-nums text-gray-50">{cv != null ? porcentaje(cv * 100) : "—"}</dd></div>
              </dl>
              <details className="group mt-2">
                <summary className="flex min-h-[36px] cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-sky-300 [&::-webkit-details-marker]:hidden">Más datos <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 text-[13px]">
                  <div><dt className="text-gray-400">Visitas</dt><dd className="tabular-nums text-gray-100">{entero(c.visitas)}</dd></div>
                  <div><dt className="text-gray-400">Checkout</dt><dd className="tabular-nums text-gray-100">{entero(c.checkout)}</dd></div>
                  <div><dt className="text-gray-400">Checkout → compra</dt><dd className="tabular-nums text-gray-100">{c.checkout > 0 ? porcentaje((c.ventas / c.checkout) * 100) : "—"}</dd></div>
                  <div><dt className="text-gray-400">ROAS</dt><dd className="tabular-nums text-gray-100">{veces(c.roas)}</dd></div>
                  {c.conversiones_plataforma != null && <div className="col-span-2"><dt className="text-gray-400">Conversiones que informa la plataforma</dt><dd className="tabular-nums text-gray-100">{entero(c.conversiones_plataforma)} (se cobraron {c.ventas})</dd></div>}
                </dl>
              </details>
            </div>
          );
        })}
        <p className="px-1 text-[13px] text-gray-300 sm:col-span-2">Total: <b className="tabular-nums text-gray-50">{pesos(total.inversion)}</b> invertidos · <b className="tabular-nums text-gray-50">{total.ventas}</b> ventas · CAC <b className="tabular-nums text-gray-50">{total.nuevos > 0 ? pesos(total.inversion / total.nuevos) : "—"}</b></p>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-gray-400">
        <span>Nuevos: clientes que compraron por primera vez. CAC: inversión del canal ÷ sus clientes nuevos. ROAS: facturación ÷ inversión.</span>
        <span className="inline-flex items-center gap-1.5"><Punto tono="negativo" />CAC sobre el equilibrio</span>
        <span className="inline-flex items-center gap-1.5"><Punto tono="alerta" />Sobre el objetivo</span>
        <span className="inline-flex items-center gap-1.5"><Punto tono="positivo" />Dentro del objetivo</span>
      </p>
    </Panel>
  );
}

// ── 7. Embudo comercial ──────────────────────────────────────────────────────
function Embudo({ d }: { d: DatosCentro }) {
  const conDatos = d.canales.filter((c) => c.visitas > 0 || c.inversion > 0);
  const opciones = [{ id: "negocio", t: "Negocio" }, ...[...conDatos].sort((a, b) => Number(b.pago) - Number(a.pago) || b.visitas - a.visitas).map((c) => ({ id: c.canal, t: c.nombre }))];
  const [canal, setCanal] = useState("negocio");
  const c = d.canales.find((x) => x.canal === canal);
  const etapas: { t: string; v: number | null; nota?: string }[] = c
    ? [
        ...(c.pago ? [{ t: "Impresiones", v: c.impresiones }, { t: "Clics", v: c.clics }] : []),
        { t: "Visitas medidas", v: c.visitas }, { t: "Llegan al checkout", v: c.checkout }, { t: "Ventas cobradas", v: c.ventas },
      ]
    : [
        { t: "Visitas medidas", v: d.canales.reduce((a, x) => a + x.visitas, 0) },
        { t: "Llegan al checkout", v: d.canales.reduce((a, x) => a + x.checkout, 0) },
        { t: "Ventas cobradas", v: d.actual.ventas },
      ];
  const tasas = etapas.map((e, i) => (i === 0 || e.v == null || !etapas[i - 1].v ? null : e.v / (etapas[i - 1].v as number)));
  // Mayor pérdida: entre las etapas de la web (visita → checkout → venta), la tasa más baja.
  const inicioWeb = etapas.findIndex((e) => e.t === "Visitas medidas");
  let peor = -1;
  tasas.forEach((t, i) => { if (t != null && i > inicioWeb && (peor < 0 || t < (tasas[peor] ?? 1))) peor = i; });
  const total = etapas[0].v ?? 0, final = etapas[etapas.length - 1].v ?? 0;
  return (
    <Panel titulo="Embudo comercial" subtitulo="Cuántos avanzan de una etapa a la siguiente y dónde se pierde más."
      accion={<Segmentado etiqueta="Canal del embudo" tamano="sm" valor={canal} onChange={setCanal} opciones={opciones} className="max-w-full" />}>
      <ol className={`grid gap-2 ${etapas.length === 5 ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
        {etapas.map((e, i) => {
          const t = tasas[i];
          const esPeor = i === peor;
          return (
            <li key={e.t} className={`relative rounded-lg p-3.5 ${esPeor ? "bg-rose-400/[0.07] ring-1 ring-inset ring-rose-400/25" : "bg-white/[0.025]"}`}>
              <p className="text-[12.5px] text-gray-400">{e.t}</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-gray-50">{entero(e.v)}</p>
              <div className="mt-3 min-h-[34px]">
                {i === 0 ? <p className="text-[12.5px] text-gray-400">{c?.pago ? "Base del canal" : "Base del período"}</p> : t != null ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className={esPeor ? "font-medium text-rose-200" : "text-gray-300"}>{porcentaje(t * 100)} avanza</span>
                      {esPeor && <span className="text-rose-300">Mayor pérdida</span>}
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${esPeor ? "bg-rose-400" : "bg-sky-400/80"}`} style={{ width: `${Math.min(t, 1) * 100}%` }} /></div>
                  </>
                ) : <p className="text-[12.5px] text-gray-500">Sin base para comparar</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-gray-300">
        {c?.pago && c.clics ? <span>De cada 100 clics, <b className="tabular-nums text-gray-50">{decimalLocal((c.ventas / c.clics) * 100)}</b> terminan en una venta cobrada.</span> : total > 0 ? <span>De cada 100 visitas medidas, <b className="tabular-nums text-gray-50">{decimalLocal((final / total) * 100)}</b> terminan en una venta cobrada.</span> : null}
        {c?.conversiones_plataforma != null && <span className="text-gray-400">{c.nombre} informa {entero(c.conversiones_plataforma)} {c.conversiones_plataforma === 1 ? "conversión" : "conversiones"}; se cobraron {c.ventas}.</span>}
      </div>
      <p className="mt-2 flex gap-1.5 text-[12.5px] leading-relaxed text-gray-400"><Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />Cada etapa cuenta lo medido en esa etapa (sesiones y eventos), no personas únicas: las tasas comparan etapas, no siguen a cada persona.{!c && " En el negocio no se suman impresiones ni clics: no son equivalentes entre plataformas."}</p>
    </Panel>
  );
}
const decimalLocal = (v: number) => v.toFixed(v < 10 ? 1 : 0).replace(".", ",");

// ── Página ───────────────────────────────────────────────────────────────────
export default function CentroDeControl() {
  const [dias, setDias] = useState(30);
  const [atribucion, setAtribucion] = useState<Atribucion>("ultimo");
  const centro = useVista<DatosCentro>(`centro&dias=${dias}&atribucion=${atribucion}`);
  const reco = useVista<Bandeja>("recomendaciones");
  const d = centro.d;
  const filtros = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <Segmentado etiqueta="Período" valor={String(dias)} onChange={(v) => setDias(Number(v))} opciones={[7, 14, 30, 90].map((n) => ({ id: String(n), t: `${n} días` }))} />
      <span className="inline-flex items-center gap-1.5">
        <Selector etiqueta="Modelo de atribución" valor={atribucion} onChange={(v) => setAtribucion(v as Atribucion)} opciones={ATRIBUCIONES.map((a) => ({ id: a.id, t: a.nombre }))} />
        <Ayuda texto={`${ATRIBUCIONES.map((a) => `${a.nombre}: ${a.ayuda}`).join(" ")} Cambia el reparto entre canales, no el total del negocio.`} />
      </span>
      <span className="text-[12.5px] text-gray-400">Comparado con los {dias} días anteriores{d && d.anterior.ventas === 0 && d.anterior.inversion === 0 ? " (sin ventas ni inversión: solo se compara el resultado)" : ""}</span>
    </div>
  );
  return (
    <Pagina titulo="Centro de control" icono={LayoutDashboard} descripcion="Si el negocio gana o pierde plata, por qué, cuánto cuesta cada cliente y qué decidir hoy."
      acciones={<Actualizar cargando={centro.cargando || reco.cargando} onClick={() => { centro.cargar(); reco.cargar(); }} actualizado={centro.actualizado} />} filtros={filtros}>
      {centro.error && <ErrorCarga mensaje={centro.error} reintentar={centro.cargar} />}
      {!d && !centro.error && <EsqueletoPagina />}
      {d && (
        <div className={`space-y-8 transition-opacity md:space-y-10 ${centro.cargando ? "opacity-60" : ""}`}>
          <div className="space-y-3">
            <Situacion d={d} />
            <Indicadores d={d} />
          </div>
          <DiagnosticoIA />
          <Seccion titulo="Decisiones prioritarias" icono={RouteIcon} descripcion="Lo que conviene decidir ahora, ordenado por lo que mueve la plata. Sale de la misma bandeja que Recomendaciones, sin repetidas.">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <Decisiones bandeja={{ b: reco.d, error: reco.error }} />
              <Lateral d={d} bandeja={reco.d} />
            </div>
          </Seccion>
          <Seccion titulo="Evolución económica" icono={BarChart3}>
            <Evolucion d={d} />
          </Seccion>
          <Seccion titulo="Canales y embudo" descripcion="Qué canal rinde y en qué etapa se pierde la gente.">
            <Canales d={d} />
            <Embudo d={d} />
          </Seccion>
          <Desplegable titulo="Cómo se calcula" icono={Info} resumen="Fuentes, períodos y definiciones">
            <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-gray-300">
              {d.notas.map((n) => <li key={n}>{n}</li>)}
              <li>Comparación: los {d.dias} días anteriores. Margen por venta y CAC de equilibrio: últimos 90 días ({d.economia.ventas_referencia} ventas). Dólar a {d.economia.tipo_cambio.valor}{d.economia.tipo_cambio.estimado ? " (estimado)" : ""}.</li>
              <li>CAC de equilibrio por primera compra = margen de contribución por venta: pagar más hace perder plata en la primera compra, antes de los costos fijos.</li>
              <li>{explicacionFijos(d.actual, d.economia.fijos_mensuales).texto}</li>
            </ul>
            {d.actual.fijos_detalle.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-[13px]">
                  <caption className="mb-1.5 text-left text-[12.5px] font-medium text-gray-400">Costos fijos imputados en los últimos {d.dias} días</caption>
                  <thead><tr className="border-b border-white/[0.07] text-left text-[12px] text-gray-400"><th scope="col" className="py-1.5 pr-3 font-medium">Costo</th><th scope="col" className="px-3 py-1.5 text-right font-medium">Por mes</th><th scope="col" className="px-3 py-1.5 text-right font-medium">Días vigente</th><th scope="col" className="py-1.5 pl-3 text-right font-medium">Imputado</th></tr></thead>
                  <tbody>
                    {d.actual.fijos_detalle.map((f) => (
                      <tr key={f.nombre} className="border-b border-white/[0.04] text-gray-200">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal">{f.nombre}{f.dias < d.actual.dias_periodo - 0.05 && <span className="text-gray-400"> · desde el {fechaCorta(f.desde)}</span>}</th>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pesos(f.mensual)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{decimalLocal(f.dias)} de {Math.round(d.actual.dias_periodo)}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums">{pesos(f.imputado)}</td>
                      </tr>
                    ))}
                    {d.actual.puntuales > 0 && <tr className="border-b border-white/[0.04] text-gray-200"><th scope="row" className="py-1.5 pr-3 text-left font-normal">Gastos puntuales</th><td /><td /><td className="py-1.5 pl-3 text-right tabular-nums">{pesos(d.actual.puntuales)}</td></tr>}
                    <tr className="font-medium text-gray-50"><th scope="row" className="py-1.5 pr-3 text-left">Total del período</th><td className="px-3 py-1.5 text-right tabular-nums">{pesos(d.economia.fijos_mensuales)}</td><td /><td className="py-1.5 pl-3 text-right tabular-nums">{pesos(d.actual.costos_fijos)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              <span className="text-gray-400">Detalle por herramienta:</span>
              {[["Google Ads", "/admin/tarot/google-ads"], ["Meta Ads", "/admin/tarot/meta-ads"], ["Presupuesto", "/admin/tarot/presupuesto"], ["Visitantes", "/admin/tarot/visitantes"], ["Analista", "/admin/tarot/analista"], ["Estratega", "/admin/tarot/estratega"]].map(([t, h]) => <Enlace key={h} href={h}>{t}</Enlace>)}
            </p>
          </Desplegable>
        </div>
      )}
    </Pagina>
  );
}
