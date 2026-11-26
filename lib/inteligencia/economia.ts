// Inteligencia comercial (2026-11-24): el modelo económico del producto.
// Funciones puras (sin base de datos): las usan el servidor y el simulador de
// la pantalla "Objetivos y economía", así el cálculo es uno solo.
//
// Definiciones (iguales en toda la consola):
//   Margen de contribución por venta = precio − costos variables por venta
//     (comisión de Mercado Pago, IA, audio, WhatsApp). Es lo que deja una
//     venta antes de pagar publicidad y costos fijos.
//   CAC de equilibrio por primera compra = margen de contribución: pagar más
//     por cliente nuevo hace perder plata en la primera venta (todavía sin
//     contar los costos fijos; no es un "máximo rentable" del negocio).
//   CAC objetivo = lo que se decide pagar como máximo para llegar a la
//     ganancia deseada (lo define el dueño; no se calcula solo).
//   CAC combinado = inversión publicitaria ÷ todos los clientes nuevos (de
//     cualquier canal). CAC de canales pagos = inversión ÷ clientes nuevos
//     atribuidos a canales pagos. CAC por canal = inversión del canal ÷ sus clientes nuevos.
//   Costo total por cliente nuevo = (inversión + costos fijos y puntuales +
//     cortesías) ÷ clientes nuevos. No es un CAC: incluye costos del negocio
//     que no son de adquisición.

export const DIAS_MES = 30.4375;

export interface EntradaModelo {
  precio: number;
  costo_variable: number; // por venta
  cac: number; // por cliente nuevo
  fijos_mensuales: number;
  ganancia_deseada: number; // por mes
  /** Parte de las ventas que hay que conseguir con publicidad (0–1). El resto
   *  (orgánicas, directas, recompras) no paga CAC. Sin dato = 1 (todas). */
  pct_publicidad?: number;
}

export interface ResultadoModelo {
  margen_antes_publicidad: number;
  contribucion_por_venta: number; // margen − CAC
  ventas_necesarias_mes: number | null; // null = imposible con ese CAC
  ventas_por_dia: number | null;
  inversion_publicitaria_mes: number | null;
  facturacion_mes: number | null;
}

export function modelo(e: EntradaModelo): ResultadoModelo {
  const margen = e.precio - e.costo_variable;
  const pct = e.pct_publicidad == null ? 1 : Math.min(Math.max(e.pct_publicidad, 0), 1);
  // Costo de adquisición promedio por venta: solo las ventas que vienen de publicidad pagan CAC.
  const contribucion = margen - e.cac * pct;
  const necesarias = contribucion > 0 ? Math.ceil((e.fijos_mensuales + e.ganancia_deseada) / contribucion) : null;
  return {
    margen_antes_publicidad: margen,
    contribucion_por_venta: contribucion,
    ventas_necesarias_mes: necesarias,
    ventas_por_dia: necesarias != null ? necesarias / DIAS_MES : null,
    inversion_publicitaria_mes: necesarias != null ? necesarias * e.cac * pct : null,
    facturacion_mes: necesarias != null ? necesarias * e.precio : null,
  };
}

/** CAC más alto que permite la ganancia deseada vendiendo N por mes (null = no alcanza ni con CAC 0). */
export function cacParaVolumen(margen: number, fijos: number, ganancia: number, ventasMes: number): number | null {
  const v = margen - (fijos + ganancia) / ventasMes;
  return v > 0 ? v : null;
}

/** Resultado del mes con un volumen dado (escenario, no pronóstico). */
export function resultadoConVolumen(e: EntradaModelo, ventasMes: number): number {
  const pct = e.pct_publicidad == null ? 1 : Math.min(Math.max(e.pct_publicidad, 0), 1);
  return ventasMes * (e.precio - e.costo_variable - e.cac * pct) - e.fijos_mensuales;
}
