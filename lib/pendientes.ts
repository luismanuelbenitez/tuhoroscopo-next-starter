// Pendientes del negocio (2026-11-02). Lista propia (admin_pendientes) más las
// señales de otros módulos de inteligencia del admin, para tener en un solo
// lugar lo que hay que hacer:
//  - Normativa: temas legales abiertos (admin_normativa).
//  - Meta Ads: avisos en vivo del diagnóstico (lib/metaAds/diagnostico).
// Cualquier señal se puede convertir en pendiente (origen + origen_ref, sin
// duplicar). El Asistente CEO usa hallazgosDePendientes() y el Analista
// recibe los abiertos como contexto. Solo lectura de los otros módulos.

import { diagnosticar, type Gravedad as GravedadMeta, type MetaPanel } from "@/lib/metaAds/diagnostico";

export type Getter = (q: string) => Promise<unknown>;

export const AREAS_PENDIENTE = {
  anuncios: "Anuncios", redes: "Redes", web: "Web", ventas: "Ventas", producto: "Producto",
  legal: "Legal", finanzas: "Finanzas", tecnico: "Técnico", otros: "Otros",
} as const;
export const RESPONSABLES = { manuel: "Manuel", claude: "Claude", contador: "Contador", abogado: "Abogado", otro: "Otro" } as const;
export const ESTADOS_PENDIENTE = {
  abierto: "Abierto", en_curso: "En curso", esperando: "Esperando", resuelto: "Resuelto", descartado: "Descartado",
} as const;
export type AreaPendiente = keyof typeof AREAS_PENDIENTE;
export type EstadoPendiente = keyof typeof ESTADOS_PENDIENTE;
export const ESTADOS_ACTIVOS: EstadoPendiente[] = ["abierto", "en_curso", "esperando"];

export interface Pendiente {
  id: string; titulo: string; detalle: string | null; area: AreaPendiente; responsable: keyof typeof RESPONSABLES;
  prioridad: "alta" | "media" | "baja"; estado: EstadoPendiente; vence: string | null; enlace: string | null;
  origen: "manual" | "meta_ads" | "normativa" | "asistente"; origen_ref: string | null; notas: string | null;
  created_at: string; updated_at: string; resuelto_at: string | null;
  // Visto con "Marcar como leídas" (2026-11-05): ya no suma al número del menú.
  leido_at: string | null;
}

// Señal de otro módulo que todavía no es un pendiente propio.
export interface Senal {
  origen: "normativa" | "meta_ads";
  origen_ref: string;
  titulo: string;
  detalle: string;
  prioridad: "alta" | "media" | "baja";
  area: AreaPendiente;
  enlace: string;
  ya_es_pendiente: boolean;
}

const hoyUy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const estaVencido = (p: Pick<Pendiente, "vence" | "estado">) =>
  !!p.vence && ESTADOS_ACTIVOS.includes(p.estado) && p.vence < hoyUy();
export const venceHoy = (p: Pick<Pendiente, "vence" | "estado">) =>
  !!p.vence && ESTADOS_ACTIVOS.includes(p.estado) && p.vence === hoyUy();

const PRIORIDAD_META: Record<GravedadMeta, Senal["prioridad"]> = { rojo: "alta", naranja: "media", amarillo: "baja" };

/** Señales de Normativa y Meta Ads. Si un módulo falla, se omite (no rompe la lista). */
export async function leerSenales(get: Getter, refsPropias: Set<string>): Promise<Senal[]> {
  const [normativa, panel] = await Promise.all([
    (get(`admin_normativa?resolucion=in.(abierto,en_curso)&select=id,tema,posible_obligacion,prioridad,notas`) as Promise<
      { id: string; tema: string; posible_obligacion: string; prioridad: string; notas: string | null }[]>).catch(() => []),
    (get(`rpc/meta_ads_panel?p_dias=14`) as Promise<MetaPanel | null>).catch(() => null),
  ]);
  const senales: Senal[] = normativa.map((n) => ({
    origen: "normativa", origen_ref: `normativa:${n.id}`, titulo: n.tema, detalle: n.posible_obligacion,
    prioridad: (["alta", "media", "baja"].includes(n.prioridad) ? n.prioridad : "media") as Senal["prioridad"],
    area: "legal", enlace: "/admin/tarot/normativa", ya_es_pendiente: refsPropias.has(`normativa:${n.id}`),
  }));
  if (panel?.cuenta) {
    for (const a of diagnosticar(panel).avisos) {
      // La clave estable no lleva números que cambian cada hora.
      const ref = `meta_ads:${a.objeto_id ?? "cuenta"}:${a.titulo.replace(/[\d.,$]+/g, "").trim().slice(0, 80)}`;
      senales.push({
        origen: "meta_ads", origen_ref: ref, titulo: a.titulo, detalle: a.detalle, prioridad: PRIORIDAD_META[a.gravedad],
        area: "anuncios", enlace: "/admin/tarot/meta-ads", ya_es_pendiente: refsPropias.has(ref),
      });
    }
  }
  const orden = { alta: 0, media: 1, baja: 2 };
  return senales.sort((a, b) => orden[a.prioridad] - orden[b.prioridad]);
}

// ── Para el Asistente CEO ──────────────────────────────────────────────────
// Sin importar tipos del Asistente (evita dependencia circular): devuelve
// objetos con la misma forma que su Hallazgo.
type AreaAsistente = "comercial" | "operacion" | "finanzas" | "experiencia" | "tecnico" | "datos";
const AREA_ASISTENTE: Record<AreaPendiente, AreaAsistente> = {
  anuncios: "comercial", redes: "comercial", web: "comercial", ventas: "comercial", producto: "comercial",
  legal: "finanzas", finanzas: "finanzas", tecnico: "tecnico", otros: "operacion",
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function hallazgosDePendientes(pendientes: Pendiente[]) {
  const activos = pendientes.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
  const out: { clave: string; area: AreaAsistente; gravedad: "critico" | "atencion" | "info" | "bien"; titulo: string; detalle: string; que_hacer: string | null; link: string | null }[] = [];
  for (const p of activos.filter(estaVencido)) {
    out.push({
      clave: `pendiente_vencido:${p.id}`, area: AREA_ASISTENTE[p.area], gravedad: "atencion",
      titulo: `Pendiente vencido: ${p.titulo}`, detalle: `Vencía el ${p.vence!.slice(8, 10)}/${p.vence!.slice(5, 7)} · ${RESPONSABLES[p.responsable]}.`,
      que_hacer: p.detalle, link: "/admin/tarot/pendientes",
    });
  }
  for (const p of activos.filter(venceHoy)) {
    out.push({
      clave: `pendiente_hoy:${p.id}`, area: AREA_ASISTENTE[p.area], gravedad: "info",
      titulo: `Vence hoy: ${p.titulo}`, detalle: RESPONSABLES[p.responsable], que_hacer: p.detalle, link: "/admin/tarot/pendientes",
    });
  }
  const altas = activos.filter((p) => p.prioridad === "alta" && !estaVencido(p) && !venceHoy(p));
  if (altas.length) {
    out.push({
      clave: `pendientes_alta:${altas.map((p) => p.id.slice(0, 4)).sort().join("")}`, area: "operacion", gravedad: "info",
      titulo: `${plural(altas.length, "pendiente de prioridad alta", "pendientes de prioridad alta")}`,
      detalle: altas.slice(0, 4).map((p) => p.titulo).join(" · ") + (altas.length > 4 ? " …" : ""),
      que_hacer: "Revisalos en Pendientes.", link: "/admin/tarot/pendientes",
    });
  }
  return out;
}
