// Inteligencia comercial · Centro de control (2026-11-24).
//
// Responde en una pantalla: ¿el negocio gana o pierde?, ¿cuánto cuesta
// conseguir un cliente y cómo evoluciona?, ¿qué canal rinde?, ¿qué pide
// atención? Consolidado del negocio + cada canal, sin contar dos veces una
// venta (cada venta se le atribuye a un solo canal según el modelo elegido).
//
// Reutiliza, no duplica:
//   - lib/estrategico.ts → la plata del negocio (cobrado, comisiones reales de
//     Mercado Pago, IA, audio, WhatsApp, cortesías, costos fijos, resultado).
//   - lib/inteligencia/medicion.ts → gasto, visitas, checkout y ventas por
//     canal (la misma medición que usan los experimentos).
//   - ic_negocios → objetivos (ganancia mensual, CAC objetivo).
// Solo lectura. Sin IA (no cuesta nada).

import { calcularEstrategico } from "@/lib/estrategico";
import { NOMBRE_CANAL, type Atribucion } from "./canales";
import { leerNegocio, type Negocio } from "./negocio";
import { prepararMedicion, DIA, OFFSET_UY, ymd, inicioDia, type FilaCanal } from "./medicion";

const SEMANAS = 12;
/** Con menos ventas que esto, el CAC de un período se muestra como poco confiable. */
export const VENTAS_MINIMAS_CAC = 3;

type Get = (q: string) => Promise<any>;
export type { FilaCanal };

export interface Atencion { id: string; canal?: string; nivel: "alta" | "media" | "info"; titulo: string; detalle: string; enlace?: string }

export async function calcularCentro(getRaw: (q: string) => Promise<unknown>, opciones: { negocio?: string; dias: number; atribucion: Atribucion; ahora?: number }) {
  const get = getRaw as Get;
  const ahora = opciones.ahora ?? Date.now();
  const { dias, atribucion } = opciones;
  const negocio = await leerNegocio(get, opciones.negocio);
  if (!negocio) return { ok: false as const, motivo: "negocio_inexistente" };

  const iniActual = ahora - dias * DIA, iniAnterior = ahora - 2 * dias * DIA;
  // Semanas de lunes a domingo (hora de Montevideo); la última es la actual, incompleta.
  const hoy0 = inicioDia(ahora);
  const diaSemana = (new Date(ahora - OFFSET_UY).getUTCDay() + 6) % 7; // 0 = lunes
  const lunesActual = hoy0 - diaSemana * DIA;
  const iniSemanas = lunesActual - (SEMANAS - 1) * 7 * DIA;
  const inicioMes = new Date(`${ymd(ahora).slice(0, 7)}-01T00:00:00-03:00`).getTime();
  const desde = Math.min(iniAnterior, iniSemanas, inicioMes);

  const estP = calcularEstrategico(get, dias, false, ahora);
  const [est, ref, mes, med, pendientes] = await Promise.all([
    estP,
    // Margen por venta de referencia: 90 días (más ventas, número más estable).
    dias === 90 ? null : calcularEstrategico(get, 90, false, ahora),
    calcularEstrategico(get, (ahora - inicioMes) / DIA, false, ahora),
    prepararMedicion(get, { desde, atribucion, tc: estP.then((e) => e.tipo_cambio.valor) }),
    Promise.all([
      get(`ic_experimentos?negocio_id=eq.${negocio.id}&estado=in.(planificado,activo)&select=id,nombre,estado,canal,aplicado_desde,fin_previsto&order=id.asc`).catch(() => []),
      get(`tarot_analista_recomendaciones?estado=eq.pendiente&select=id`).catch(() => []),
      // Las propuestas abiertas del Estratega tienen estado "propuesta" (antes
      // se contaban con "pendiente" y daba siempre 0; corregido 2026-11-25).
      get(`estratega_propuestas?estado=eq.propuesta&select=id`).catch(() => []),
      get(`admin_pendientes?estado=in.(abierto,esperando)&select=id`).catch(() => []),
      // Cambios registrados (Level Up, 2026-11-25): para marcarlos en la evolución semanal.
      get(`ads_config_historial?vigente_desde=gte.${new Date(iniSemanas).toISOString()}&select=plataforma,version,vigente_desde&order=vigente_desde.asc`).catch(() => []),
      get(`tarot_analista_bitacora?fecha=gte.${ymd(iniSemanas)}&select=fecha,categoria,descripcion&order=fecha.asc`).catch(() => []),
    ]),
  ]);
  const { gasto, ventas, esNuevo, enRango, porCanal, tc } = med;
  const versiones = ((pendientes as unknown[][])[4] ?? []) as { plataforma: string; version: number; vigente_desde: string }[];
  const bitacoraSem = ((pendientes as unknown[][])[5] ?? []) as { fecha: string; categoria: string; descripcion: string }[];
  const aPesos = (monto: number, moneda: string) => monto * (moneda === "USD" ? tc : 1);
  const fechaEnRango = (f: string, ini: number, fin: number) => { const t = new Date(`${f}T12:00:00-03:00`).getTime(); return t >= ini && t < fin; };
  const sinOrigen = med.sinOrigen(iniActual, ahora + 1);

  // ── Consolidado del negocio (plata: lib/estrategico) ─────────────────────
  function consolidado(v: typeof est.actual) {
    const p = v.plata, nuevos = v.adquisicion.clientes_nuevos;
    const otros = p.fijos + p.puntuales + p.costo_cortesias;
    return {
      ventas: p.ventas, facturacion: p.bruto, inversion: p.publicidad, clientes_nuevos: nuevos,
      costos_variables: p.bruto - p.queda, margen_contribucion: p.queda,
      costos_fijos: p.fijos + p.puntuales, cortesias: p.costo_cortesias, resultado: p.resultado,
      fijos_prorrateados: p.fijos, puntuales: p.puntuales,
      // Por qué los fijos del período no son el total mensual: días de vigencia de cada costo.
      fijos_detalle: p.fijos_detalle.filter((f) => f.mensual > 0).map((f) => ({ nombre: f.nombre, mensual: f.mensual, dias: Math.round(f.dias * 10) / 10, imputado: f.imputado, desde: f.desde, hasta: f.hasta })),
      dias_periodo: Math.round(p.dias_periodo * 10) / 10,
      cac_publicitario: nuevos > 0 && p.publicidad > 0 ? p.publicidad / nuevos : null,
      cac_total: nuevos > 0 ? (p.publicidad + otros) / nuevos : null,
      roas: p.publicidad > 0 ? p.bruto / p.publicidad : null,
    };
  }
  const actual = consolidado(est.actual), anterior = consolidado(est.anterior);

  // ── Economía de referencia (90 días) y objetivos ────────────────────────
  const r90 = (ref ?? est).actual.plata;
  const margenVenta = r90.ventas > 0 ? r90.queda / r90.ventas : null;
  const economia = {
    ventas_referencia: r90.ventas,
    precio: negocio.precio,
    costo_variable_por_venta: r90.ventas > 0 ? (r90.bruto - r90.queda) / r90.ventas : null,
    margen_contribucion_por_venta: margenVenta,
    cac_maximo: margenVenta,
    cac_objetivo: negocio.cac_objetivo,
    fijos_mensuales: est.fijos_mensuales,
    ganancia_mensual_objetivo: negocio.ganancia_mensual_objetivo,
    tipo_cambio: est.tipo_cambio,
  };
  const mesActual = {
    desde: ymd(inicioMes), ventas: mes.actual.plata.ventas, resultado: mes.actual.plata.resultado,
    objetivo: negocio.ganancia_mensual_objetivo, dias_transcurridos: Math.ceil((ahora - inicioMes) / DIA),
  };

  // ── CAC semana a semana (12 semanas) ────────────────────────────────────
  const semanas = Array.from({ length: SEMANAS }, (_, i) => {
    const ini = iniSemanas + i * 7 * DIA, fin = ini + 7 * DIA;
    let inv = 0;
    for (const g of gasto) if (fechaEnRango(g.fecha, ini, fin)) inv += aPesos(g.monto, g.moneda);
    const nuevos = ventas.filter((o) => enRango(o.created_at, ini, fin) && esNuevo(o)).length;
    const vts = ventas.filter((o) => enRango(o.created_at, ini, fin)).length;
    const cambios = [
      ...versiones.filter((v) => { const t = new Date(v.vigente_desde).getTime(); return t >= ini && t < fin; })
        .map((v) => `${v.plataforma === "google" ? "Google Ads" : v.plataforma === "meta" ? "Meta Ads" : v.plataforma}: versión ${v.version} de la campaña`),
      ...bitacoraSem.filter((b) => fechaEnRango(b.fecha, ini, fin)).map((b) => `${b.categoria === "web" ? "Web" : b.categoria === "publicidad" ? "Publicidad" : "Bitácora"}: ${b.descripcion.slice(0, 90)}`),
    ];
    return { desde: ymd(ini), hasta: ymd(fin - DIA), en_curso: fin > ahora, inversion: inv, ventas: vts, clientes_nuevos: nuevos, cac: inv > 0 && nuevos > 0 ? inv / nuevos : null, cambios };
  });

  const canales = porCanal(iniActual, ahora + 1);
  const canalesAnterior = porCanal(iniAnterior, iniActual);

  // ── Qué pide atención (reglas simples y explicables; sin IA) ────────────
  const atencion: Atencion[] = [];
  const diasSinVenta = est.ultima_venta_at ? Math.floor((ahora - new Date(est.ultima_venta_at).getTime()) / DIA) : null;
  const $ = (v: number) => `$ ${Math.round(v).toLocaleString("es-UY")}`;
  if (diasSinVenta != null && diasSinVenta >= 5) atencion.push({ id: "dias_sin_venta", nivel: "alta", titulo: `${diasSinVenta} días sin ventas`, detalle: `La última venta cobrada fue el ${new Date(new Date(est.ultima_venta_at!).getTime() - OFFSET_UY).toISOString().slice(8, 10)}/${new Date(new Date(est.ultima_venta_at!).getTime() - OFFSET_UY).toISOString().slice(5, 7)}.` });
  for (const c of canales) {
    if (!c.pago || c.inversion <= 0 || c.ventas > 0) continue;
    if (margenVenta != null && c.inversion >= margenVenta) atencion.push({ id: `gasto_sin_ventas:${c.canal}`, canal: c.canal, nivel: "alta", titulo: `${c.nombre}: ${$(c.inversion)} invertidos sin ventas`, detalle: `En el período ya se gastó más de lo que deja una venta (${$(margenVenta)}) y no hubo ninguna.` });
  }
  if (actual.cac_publicitario != null && margenVenta != null && actual.cac_publicitario > margenVenta) {
    atencion.push({ id: "cac_sobre_margen", nivel: "alta", titulo: "Cada cliente nuevo cuesta más de lo que deja", detalle: `CAC combinado ${$(actual.cac_publicitario)} contra un CAC de equilibrio de ${$(margenVenta)} (lo que deja la primera compra): se pierde plata en la primera venta.` });
  }
  if (actual.ventas > 0 && actual.ventas < VENTAS_MINIMAS_CAC) atencion.push({ id: "pocas_ventas", nivel: "info", titulo: "Pocas ventas para sacar conclusiones", detalle: `${actual.ventas} ${actual.ventas === 1 ? "venta" : "ventas"} en el período: el CAC puede cambiar mucho con una venta más o menos.` });
  if (negocio.cac_objetivo == null) atencion.push({ id: "falta_cac_objetivo", nivel: "media", titulo: "Falta definir el CAC objetivo", detalle: "Sin él no se puede saber cuánto conviene pagar por cliente para llegar a la ganancia deseada.", enlace: "/admin/tarot/inteligencia/economia" });
  if (sinOrigen > 0) atencion.push({ id: "ventas_sin_origen", nivel: "info", titulo: `${sinOrigen} ${sinOrigen === 1 ? "venta" : "ventas"} sin canal de origen`, detalle: "La compra no quedó unida a una visita medida; figura en «Otros»." });

  const [experimentos, pAnalista, pEstratega, pAdmin] = pendientes as unknown[][];
  return {
    ok: true as const,
    negocio: { id: negocio.id, nombre: negocio.nombre, producto: negocio.producto, mercado: negocio.mercado, moneda: negocio.moneda },
    /** Días transcurridos y totales del mes en curso (para leer el avance hacia la meta). */
    dias_mes: new Date(Date.UTC(new Date(ahora - OFFSET_UY).getUTCFullYear(), new Date(ahora - OFFSET_UY).getUTCMonth() + 1, 0)).getUTCDate(),
    dias, atribucion, generado_at: new Date(ahora).toISOString(),
    actual, anterior, economia, mes: mesActual, semanas,
    canales, canales_anterior: canalesAnterior,
    ultima_venta_at: est.ultima_venta_at, dias_sin_venta: diasSinVenta,
    atencion,
    decisiones: {
      analista: pAnalista.length, estratega: pEstratega.length, pendientes: pAdmin.length,
    },
    experimentos: experimentos as { id: string; nombre: string; estado: string; canal: string; aplicado_desde: string | null; fin_previsto: string | null }[],
    notas: [
      "Ventas = órdenes cobradas por Mercado Pago (sin cortesías). Visitas y checkout: sin tráfico propio.",
      "Inversión: Google Ads según la cuenta (US$ al dólar de Presupuesto) y Meta según su sincronización.",
      "Conversiones de la plataforma: lo que informa Google o Meta; no reemplazan a las ventas cobradas.",
    ],
  };
}

export type DatosCentro = Extract<Awaited<ReturnType<typeof calcularCentro>>, { ok: true }>;
export { NOMBRE_CANAL };
export type { Negocio };
