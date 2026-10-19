// Tipos y formato compartidos por las páginas de Campañas del admin.

export interface MetricasCampanaUI {
  encolados: number; pendientes: number; enviados: number; simulados: number;
  entregados: number; leidos: number; errores: number; descartados: number;
  visitas: number; respuestas: number; rating_promedio: number | null;
  rating_1: number; rating_2: number; rating_3: number; rating_4: number; rating_5: number;
  con_comentario: number; autoriza_sitio: number; autoriza_difusion: number;
  candidatos_testimonio: number; costo_estimado_total: number; costo_real_envios: number;
}

export interface CostosUI {
  moneda: string;
  estimado: number;
  real: number | null;
  fuente: "real" | "estimado";
  por_envio_real: number | null;
  por_respuesta: number | null;
}

export interface CampanaResumen {
  id: string;
  slug: string;
  nombre: string;
  tipo: string;
  estado: string;
  canal: string;
  modo_envio: "simulado" | "real";
  descripcion: string | null;
  audiencia: Record<string, unknown>;
  disparador: Record<string, unknown>;
  mensaje: Record<string, unknown>;
  ventana_horaria: { desde?: number; hasta?: number; zona?: string };
  limite_diario: number;
  max_intentos: number;
  costo_estimado_por_envio: number | null;
  costo_moneda: string;
  costo_real_total: number | null;
  costo_real_fuente: string | null;
  activada_at: string | null;
  pausada_at: string | null;
  ultima_ejecucion_at: string | null;
  ultima_ejecucion_resumen: Record<string, unknown> | null;
  metricas: MetricasCampanaUI;
  elegibles: { total: number; vencidos: number; encolados: number };
  costos: CostosUI;
}

export const ESTADO_CAMPANA_UI: Record<string, { label: string; cls: string }> = {
  borrador:   { label: "Borrador",   cls: "bg-gray-800 text-gray-300" },
  activa:     { label: "Activa",     cls: "bg-emerald-900/50 text-emerald-300" },
  pausada:    { label: "Pausada",    cls: "bg-amber-900/50 text-amber-300" },
  finalizada: { label: "Finalizada", cls: "bg-sky-900/50 text-sky-300" },
};

export const TIPO_CAMPANA_UI: Record<string, string> = {
  feedback_experiencia: "Feedback de experiencia",
  reactivacion: "Reactivación",
  abandono: "Abandono",
  lanzamiento: "Lanzamiento",
  comunicacion: "Comunicación",
};

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtMoneda(v: number | null | undefined, moneda: string): string {
  if (v === null || v === undefined) return "—";
  return `${moneda} ${Number(v).toFixed(Number(v) < 1 ? 4 : 2)}`;
}

export function fmtPct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—";
}
