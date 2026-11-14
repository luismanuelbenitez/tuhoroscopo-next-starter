// Módulo de gobernanza de Google Ads (2026-11-14). Tipos del motor.
//
// El motor es genérico a propósito (Manuel: "si me sirve a mí le puede servir
// a otros"): no sabe de tarot, de Uruguay ni de esta base. Recibe una foto de
// la cuenta y de la web (EntradaGobernanza), una configuración con los
// umbrales del negocio (ConfigGobernanza) y devuelve hallazgos en 4 columnas.
// La idea fuerza: cada regla sabe cuántos datos necesita para opinar; si no
// los hay, dice "esperá" en vez de inventar una conclusión.

export type Comparacion = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | string | null;

export interface EntradaGobernanza {
  dias: number;
  /** Moneda de la cuenta de Google (gasto) y del negocio (ventas). tipo_cambio: 1 de cuenta = N de venta. */
  moneda: { cuenta: string; venta: string; tipo_cambio: number };
  /** ¿Google recibe las compras (conversiones) de la web? */
  medicion_compras: boolean;
  campanas: {
    id: string; nombre: string; estado_principal: string;
    presupuesto_total: number | null; presupuesto_diario: number | null;
    inicio: string | null; fin: string | null;
    perdida_ranking: number | null; perdida_presupuesto: number | null; cuota: number | null;
    /** Gastado desde que arrancó (moneda de la cuenta). */
    gastado_total: number;
  }[];
  /** Gasto del período según Google (moneda de la cuenta). */
  periodo: { costo: number; clics: number; impresiones: number; conversiones: number };
  /** Palabras clave (últimos 30 días). costo en moneda de la cuenta. */
  palabras: {
    /** Identificador de la palabra en la plataforma (Google: "grupo~criterio"). Hace falta para aplicar cambios. */
    id?: string;
    palabra: string; concordancia: string; grupo: string; activa: boolean;
    nivel: number | null; ctr: Comparacion; anuncio: Comparacion; pagina: Comparacion;
    aprobacion: string | null; impresiones: number; clics: number; costo: number;
  }[];
  /** Búsquedas reales que activaron el anuncio (últimos 30 días). */
  terminos: { termino: string; impresiones: number; clics: number; costo: number }[];
  negativas: { texto: string; concordancia: string }[];
  anuncios: { grupo: string; activo: boolean; url: string | null; fuerza: string | null; aprobacion: string | null }[];
  /** Lo que midió la web de las visitas de Google en el período (ingresos en moneda de venta). */
  web: { visitas: number; checkout: number; empezaron_form: number; fueron_a_pagar: number; ventas: number; ingresos: number };
  /** Visitas y ventas por palabra clave (últimos 30 días, por utm_term={keyword}). */
  web_por_palabra: { palabra: string; visitas: number; checkout: number; ventas: number }[];
  velocidad: { lcp_movil_ms: number | null };
  /** Último cambio de configuración detectado en la cuenta (histórico). */
  ultimo_cambio: { version: number; desde: string } | null;
  /** Impresiones desde ese cambio (para saber si ya hay datos para juzgarlo). */
  impresiones_desde_cambio: number;
  /** Conversiones de Google en 30 días (para concordancia amplia). */
  conversiones_30d: number;
}

export interface ConfigGobernanza {
  /** Lo que deja una venta (moneda de venta). */
  valor_venta: number;
  /** Cuánto se acepta pagar por una venta (moneda de venta). Por defecto = valor_venta (no perder plata). */
  cpa_objetivo: number;
  /** Páginas a las que deberían llevar los anuncios (vacío = no se controla). */
  paginas_destino: string[];
  /** Palabras que casi nunca compran (se sugieren como negativas). */
  negativas_base: string[];
  minimos: {
    /** Impresiones de una palabra para tomar en serio su Nivel de Calidad. */
    impresiones_nota: number;
    /** Días y impresiones a esperar después de un cambio antes de juzgarlo. */
    dias_tras_cambio: number;
    impresiones_tras_cambio: number;
    /** Visitas para juzgar si la página lleva al checkout. */
    visitas_pagina: number;
    /** Llegadas al checkout para juzgarlo. */
    llegadas_checkout: number;
    /** Conversiones en 30 días antes de usar concordancia amplia. */
    conversiones_amplia: number;
    /** Ventas para confiar en el costo por venta. */
    ventas_para_cpa: number;
  };
  lcp_max_ms: number;
}

export type Columna = "frenar" | "escalar" | "oportunidad" | "esperar" | "ok";

export interface Hallazgo {
  id: string;
  columna: Columna;
  /** 3 = urgente, 2 = importante, 1 = menor. */
  gravedad: 1 | 2 | 3;
  titulo: string;
  detalle: string;
  /** Qué hacer, en una frase. */
  accion?: string;
  /** Elementos concretos (palabras, búsquedas…). */
  objetos?: string[];
  /** Qué dato falta para opinar (columna "esperar"). */
  falta?: string;
  /** El cambio que propone sube el gasto: el módulo nunca lo aplica (REGLA MÁXIMA). */
  sube_gasto?: boolean;
}

export interface Kpis {
  gasto_cuenta: number; gasto_venta: number; clics: number; impresiones: number;
  ventas: number; ingresos: number;
  costo_por_venta: number | null; retorno: number | null; conversion: number | null;
  /** ¿Alcanzan las ventas para confiar en costo por venta y retorno? */
  suficientes: boolean;
}

export interface ResultadoGobernanza {
  salud: { puntaje: number; estado: "bien" | "mejorable" | "mal" };
  kpis: Kpis;
  hallazgos: Hallazgo[];
  /** "No toques nada hasta…": cuándo hay datos para juzgar el último cambio. */
  revision: { esperar: boolean; hasta: string | null; motivo: string };
}
