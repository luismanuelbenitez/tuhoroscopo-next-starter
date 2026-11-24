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
//   - lib/inteligencia/gasto.ts → gasto publicitario de todos los canales.
//   - ic_negocios → objetivos (ganancia mensual, CAC objetivo).
// Solo lectura. Sin IA (no cuesta nada).

import { calcularEstrategico, FUERA } from "@/lib/estrategico";
import { gastoPublicitario } from "./gasto";
import { CANALES, NOMBRE_CANAL, canalDeFuente, type Atribucion, type Canal } from "./canales";
import { leerNegocio, type Negocio } from "./negocio";

const DIA = 86_400_000;
const SEMANAS = 12;
const OFFSET_UY = 3 * 3600_000; // Montevideo, UTC−3 todo el año
/** Con menos ventas que esto, el CAC de un período se muestra como poco confiable. */
export const VENTAS_MINIMAS_CAC = 3;

type Get = (q: string) => Promise<any>;
type Orden = { id: string; cliente_id: string | null; tipo_orden: string | null; estado: string; precio_cobrado: number | string | null; funnel_session_id: string | null; created_at: string };
type Sesion = { anonymous_id: string; visitor_id: string | null; fuente: string | null; es_interno: boolean | null; created_at: string };

export interface FilaCanal {
  canal: Canal; nombre: string; pago: boolean;
  inversion: number; impresiones: number | null; clics: number | null; conversiones_plataforma: number | null;
  visitas: number; checkout: number; ventas: number; ingresos: number; clientes_nuevos: number;
  cac: number | null; roas: number | null;
}

export interface Atencion { nivel: "alta" | "media" | "info"; titulo: string; detalle: string; enlace?: string }

const ymd = (t: number) => new Date(t - OFFSET_UY).toISOString().slice(0, 10);
/** Inicio (UTC) del día de Montevideo que contiene t. */
const inicioDia = (t: number) => new Date(`${ymd(t)}T00:00:00-03:00`).getTime();

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

  const [est, ref, mes, gasto, ordenes, sesiones, checkouts, pendientes] = await Promise.all([
    calcularEstrategico(get, dias, false, ahora),
    // Margen por venta de referencia: 90 días (más ventas, número más estable).
    dias === 90 ? null : calcularEstrategico(get, 90, false, ahora),
    calcularEstrategico(get, (ahora - inicioMes) / DIA, false, ahora),
    gastoPublicitario(get, ymd(desde)),
    get(`tarot_ordenes?select=id,cliente_id,tipo_orden,estado,precio_cobrado,funnel_session_id,created_at&order=created_at.asc&limit=10000`) as Promise<Orden[]>,
    get(`funnel_sessions?created_at=gte.${new Date(desde).toISOString()}&select=anonymous_id,visitor_id,fuente,es_interno,created_at&limit=50000`) as Promise<Sesion[]>,
    get(`funnel_events?created_at=gte.${new Date(desde).toISOString()}&event_name=eq.checkout_started&select=session_id&limit=50000`) as Promise<{ session_id: string }[]>,
    Promise.all([
      get(`tarot_analista_recomendaciones?estado=eq.pendiente&select=id`).catch(() => []),
      get(`estratega_propuestas?estado=eq.pendiente&select=id`).catch(() => []),
      get(`admin_pendientes?estado=in.(abierto,esperando)&select=id`).catch(() => []),
    ]),
  ]);
  const tc = est.tipo_cambio.valor;
  const aPesos = (monto: number, moneda: string) => monto * (moneda === "USD" ? tc : 1);

  // ── Ventas y su canal (una venta = un canal) ─────────────────────────────
  const ventaReal = (o: Orden) => !FUERA.has(o.estado) && o.tipo_orden !== "cortesia";
  const ventas = ordenes.filter(ventaReal);
  const primeraVenta = new Map<string, string>();
  for (const o of ventas) if (o.cliente_id && !primeraVenta.has(o.cliente_id)) primeraVenta.set(o.cliente_id, o.id);
  const esNuevo = (o: Orden) => !!o.cliente_id && primeraVenta.get(o.cliente_id) === o.id;

  const sesionPorId = new Map(sesiones.map((s) => [s.anonymous_id, s]));
  const faltan = Array.from(new Set(ventas.map((o) => o.funnel_session_id).filter((s): s is string => !!s && !sesionPorId.has(s))));
  for (let i = 0; i < faltan.length; i += 150) {
    const lote = faltan.slice(i, i + 150);
    const filas = (await get(`funnel_sessions?anonymous_id=in.(${lote.map((s) => `"${s}"`).join(",")})&select=anonymous_id,visitor_id,fuente,es_interno,created_at`)) as Sesion[];
    for (const s of filas) sesionPorId.set(s.anonymous_id, s);
  }
  // Primer contacto: la primera visita registrada de cada comprador (por visitor_id).
  const primeraFuente = new Map<string, string | null>();
  if (atribucion === "primero") {
    const visitantes = Array.from(new Set(ventas.map((o) => sesionPorId.get(o.funnel_session_id ?? "")?.visitor_id).filter((v): v is string => !!v)));
    for (let i = 0; i < visitantes.length; i += 150) {
      const lote = visitantes.slice(i, i + 150);
      const filas = (await get(`funnel_sessions?visitor_id=in.(${lote.map((v) => `"${v}"`).join(",")})&select=visitor_id,fuente,created_at&order=created_at.asc&limit=10000`)) as { visitor_id: string; fuente: string | null }[];
      for (const s of filas) if (!primeraFuente.has(s.visitor_id)) primeraFuente.set(s.visitor_id, s.fuente);
    }
  }
  let sinOrigen = 0;
  const canalVenta = new Map<string, Canal>();
  for (const o of ventas) {
    const s = o.funnel_session_id ? sesionPorId.get(o.funnel_session_id) : undefined;
    if (!s) { canalVenta.set(o.id, "otro"); continue; }
    const fuente = atribucion === "primero" && s.visitor_id && primeraFuente.has(s.visitor_id) ? primeraFuente.get(s.visitor_id)! : s.fuente;
    canalVenta.set(o.id, canalDeFuente(fuente));
  }

  // ── Visitas y checkout por canal (sin tráfico propio) ───────────────────
  const conCheckout = new Set(checkouts.map((c) => c.session_id));
  const externas = sesiones.filter((s) => !s.es_interno);

  const enRango = (iso: string, ini: number, fin: number) => { const t = new Date(iso).getTime(); return t >= ini && t < fin; };
  const fechaEnRango = (f: string, ini: number, fin: number) => { const t = new Date(`${f}T12:00:00-03:00`).getTime(); return t >= ini && t < fin; };

  function porCanal(ini: number, fin: number): FilaCanal[] {
    const filas = new Map<Canal, FilaCanal>(CANALES.map((c) => [c.id, {
      canal: c.id, nombre: c.nombre, pago: c.pago, inversion: 0, impresiones: null, clics: null, conversiones_plataforma: null,
      visitas: 0, checkout: 0, ventas: 0, ingresos: 0, clientes_nuevos: 0, cac: null, roas: null,
    }]));
    const suma = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);
    for (const g of gasto) {
      if (!fechaEnRango(g.fecha, ini, fin)) continue;
      const f = filas.get(g.canal)!;
      f.inversion += aPesos(g.monto, g.moneda);
      f.impresiones = suma(f.impresiones, g.impresiones); f.clics = suma(f.clics, g.clics); f.conversiones_plataforma = suma(f.conversiones_plataforma, g.conversiones);
    }
    for (const s of externas) {
      if (!enRango(s.created_at, ini, fin)) continue;
      const f = filas.get(canalDeFuente(s.fuente))!;
      f.visitas += 1;
      if (conCheckout.has(s.anonymous_id)) f.checkout += 1;
    }
    for (const o of ventas) {
      if (!enRango(o.created_at, ini, fin)) continue;
      const f = filas.get(canalVenta.get(o.id) ?? "otro")!;
      f.ventas += 1; f.ingresos += Number(o.precio_cobrado ?? 0) || 0;
      if (esNuevo(o)) f.clientes_nuevos += 1;
    }
    for (const f of filas.values()) {
      f.cac = f.inversion > 0 && f.clientes_nuevos > 0 ? f.inversion / f.clientes_nuevos : null;
      f.roas = f.inversion > 0 ? f.ingresos / f.inversion : null;
    }
    return Array.from(filas.values()).filter((f) => f.inversion > 0 || f.visitas > 0 || f.ventas > 0);
  }
  for (const o of ventas) if (enRango(o.created_at, iniActual, ahora + 1) && !(o.funnel_session_id && sesionPorId.has(o.funnel_session_id))) sinOrigen += 1;

  // ── Consolidado del negocio (plata: lib/estrategico) ─────────────────────
  function consolidado(v: typeof est.actual) {
    const p = v.plata, nuevos = v.adquisicion.clientes_nuevos;
    const otros = p.fijos + p.puntuales + p.costo_cortesias;
    return {
      ventas: p.ventas, facturacion: p.bruto, inversion: p.publicidad, clientes_nuevos: nuevos,
      costos_variables: p.bruto - p.queda, margen_contribucion: p.queda,
      costos_fijos: p.fijos + p.puntuales, cortesias: p.costo_cortesias, resultado: p.resultado,
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
    return { desde: ymd(ini), hasta: ymd(fin - DIA), en_curso: fin > ahora, inversion: inv, ventas: vts, clientes_nuevos: nuevos, cac: inv > 0 && nuevos > 0 ? inv / nuevos : null };
  });

  const canales = porCanal(iniActual, ahora + 1);
  const canalesAnterior = porCanal(iniAnterior, iniActual);

  // ── Qué pide atención (reglas simples y explicables; sin IA) ────────────
  const atencion: Atencion[] = [];
  const diasSinVenta = est.ultima_venta_at ? Math.floor((ahora - new Date(est.ultima_venta_at).getTime()) / DIA) : null;
  const $ = (v: number) => `$ ${Math.round(v).toLocaleString("es-UY")}`;
  if (diasSinVenta != null && diasSinVenta >= 5) atencion.push({ nivel: "alta", titulo: `${diasSinVenta} días sin ventas`, detalle: `La última venta cobrada fue el ${new Date(new Date(est.ultima_venta_at!).getTime() - OFFSET_UY).toISOString().slice(8, 10)}/${new Date(new Date(est.ultima_venta_at!).getTime() - OFFSET_UY).toISOString().slice(5, 7)}.` });
  for (const c of canales) {
    if (!c.pago || c.inversion <= 0 || c.ventas > 0) continue;
    if (margenVenta != null && c.inversion >= margenVenta) atencion.push({ nivel: "alta", titulo: `${c.nombre}: ${$(c.inversion)} invertidos sin ventas`, detalle: `En el período ya se gastó más de lo que deja una venta (${$(margenVenta)}) y no hubo ninguna.` });
  }
  if (actual.cac_publicitario != null && margenVenta != null && actual.cac_publicitario > margenVenta) {
    atencion.push({ nivel: "alta", titulo: "Cada cliente nuevo cuesta más de lo que deja", detalle: `CAC publicitario ${$(actual.cac_publicitario)} contra un máximo rentable de ${$(margenVenta)}: se pierde plata en la primera venta.` });
  }
  if (actual.ventas > 0 && actual.ventas < VENTAS_MINIMAS_CAC) atencion.push({ nivel: "info", titulo: "Pocas ventas para sacar conclusiones", detalle: `${actual.ventas} ${actual.ventas === 1 ? "venta" : "ventas"} en el período: el CAC puede cambiar mucho con una venta más o menos.` });
  if (negocio.cac_objetivo == null) atencion.push({ nivel: "media", titulo: "Falta definir el CAC objetivo", detalle: "Sin él no se puede saber cuánto conviene pagar por cliente para llegar a la ganancia deseada.", enlace: "/admin/tarot/inteligencia/economia" });
  if (sinOrigen > 0) atencion.push({ nivel: "info", titulo: `${sinOrigen} ${sinOrigen === 1 ? "venta" : "ventas"} sin canal de origen`, detalle: "La compra no quedó unida a una visita medida; figura en «Otros»." });

  const [pAnalista, pEstratega, pAdmin] = pendientes as unknown[][];
  return {
    ok: true as const,
    negocio: { id: negocio.id, nombre: negocio.nombre, producto: negocio.producto, mercado: negocio.mercado, moneda: negocio.moneda },
    dias, atribucion, generado_at: new Date(ahora).toISOString(),
    actual, anterior, economia, mes: mesActual, semanas,
    canales, canales_anterior: canalesAnterior,
    ultima_venta_at: est.ultima_venta_at, dias_sin_venta: diasSinVenta,
    atencion,
    decisiones: {
      analista: pAnalista.length, estratega: pEstratega.length, pendientes: pAdmin.length,
    },
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
