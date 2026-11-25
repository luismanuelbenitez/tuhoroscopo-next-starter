// Inteligencia comercial · medición por canal (2026-11-25, fase 2).
//
// Una sola forma de medir canales para todo el módulo: el Centro de control
// (período actual y anterior) y los experimentos (antes y después de un
// cambio) usan esta misma función, así una venta nunca se cuenta distinto en
// dos pantallas. Salió de lib/inteligencia/centro.ts sin cambiar la lógica:
//   - gasto: lib/inteligencia/gasto.ts (fuente única de inversión);
//   - ventas: órdenes cobradas sin cortesías; cada venta va a UN canal según
//     el modelo de atribución (último o primer contacto);
//   - visitas y checkout: sesiones medidas sin tráfico propio.
// Solo lectura.

import { FUERA } from "@/lib/estrategico";
import { gastoPublicitario, type FilaGasto } from "./gasto";
import { CANALES, canalDeFuente, type Atribucion, type Canal } from "./canales";

export const DIA = 86_400_000;
export const OFFSET_UY = 3 * 3600_000; // Montevideo, UTC−3 todo el año

type Get = (q: string) => Promise<any>;
export type Orden = { id: string; cliente_id: string | null; tipo_orden: string | null; estado: string; precio_cobrado: number | string | null; funnel_session_id: string | null; created_at: string };
type Sesion = { anonymous_id: string; visitor_id: string | null; fuente: string | null; es_interno: boolean | null; created_at: string };

export interface FilaCanal {
  canal: Canal; nombre: string; pago: boolean;
  inversion: number; impresiones: number | null; clics: number | null; conversiones_plataforma: number | null;
  visitas: number; checkout: number; ventas: number; ingresos: number; clientes_nuevos: number;
  cac: number | null; roas: number | null;
}

export const ymd = (t: number) => new Date(t - OFFSET_UY).toISOString().slice(0, 10);
/** Inicio (UTC) del día de Montevideo que contiene t. */
export const inicioDia = (t: number) => new Date(`${ymd(t)}T00:00:00-03:00`).getTime();

/**
 * Carga una vez todo lo necesario desde `desde` (ms) y devuelve funciones
 * para medir cualquier ventana [ini, fin). `tc` = pesos por dólar.
 */
export async function prepararMedicion(getRaw: (q: string) => Promise<unknown>, opciones: { desde: number; atribucion: Atribucion; tc: number | Promise<number> }) {
  const get = getRaw as Get;
  const { desde, atribucion } = opciones;
  const [gasto, ordenes, sesiones, checkouts, tc] = await Promise.all([
    gastoPublicitario(get, ymd(desde)),
    get(`tarot_ordenes?select=id,cliente_id,tipo_orden,estado,precio_cobrado,funnel_session_id,created_at&order=created_at.asc&limit=10000`) as Promise<Orden[]>,
    get(`funnel_sessions?created_at=gte.${new Date(desde).toISOString()}&select=anonymous_id,visitor_id,fuente,es_interno,created_at&limit=50000`) as Promise<Sesion[]>,
    get(`funnel_events?created_at=gte.${new Date(desde).toISOString()}&event_name=eq.checkout_started&select=session_id&limit=50000`) as Promise<{ session_id: string }[]>,
    opciones.tc,
  ]);
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

  /** Ventas de la ventana que no quedaron unidas a una visita medida. */
  const sinOrigen = (ini: number, fin: number) => ventas.filter((o) => enRango(o.created_at, ini, fin) && !(o.funnel_session_id && sesionPorId.has(o.funnel_session_id))).length;

  /** Inversión (en pesos) de la ventana, todos los canales. */
  const inversion = (ini: number, fin: number) => gasto.reduce((a, g) => a + (fechaEnRango(g.fecha, ini, fin) ? aPesos(g.monto, g.moneda) : 0), 0);

  return { gasto: gasto as FilaGasto[], ventas, esNuevo, enRango, porCanal, sinOrigen, inversion, tc };
}
