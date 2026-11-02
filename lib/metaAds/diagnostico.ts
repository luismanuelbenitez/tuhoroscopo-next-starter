// Diagnóstico Meta Ads en palabras (2026-11-02). Funciones puras sobre los
// datos de meta_ads_panel(): las usan el panel /admin/tarot/meta-ads y el
// Asistente CEO. No consultan nada por su cuenta.

export interface MetaCuenta {
  id: string; nombre: string | null; moneda: string | null; zona_horaria: string | null; estado: number | null;
  motivo_deshabilitada: number | null; gastado_total: number | null; limite_gasto: number | null; saldo: number | null; synced_at: string;
}
export interface MetaObjeto {
  id: string; nivel: "campana" | "conjunto" | "anuncio"; campana_id: string | null; conjunto_id: string | null; nombre: string | null;
  estado: string | null; estado_efectivo: string | null; presupuesto_diario: number | null; presupuesto_total: number | null;
  presupuesto_restante: number | null; inicio: string | null; fin: string | null; utm_campaign: string | null; utm_content: string | null;
  problemas: { issues_info?: { error_message?: string; error_summary?: string; level?: string }[];
    ad_review_feedback?: { global?: Record<string, string> } ; learning_stage_info?: { status?: string } } | null;
  visto_at: string;
}
export interface MetaDia { fecha: string; gasto: number; impresiones: number; clics_enlace: number; vistas_pagina: number; compras_meta: number; visitas: number; checkout: number; ventas: number; ingresos: number }
export interface MetaHora { fecha: string; hora: number; gasto: number; impresiones: number; clics_enlace: number }
export interface MetaUbicacion { ubicacion: string; gasto: number; impresiones: number; clics_enlace: number; vistas_pagina: number; compras_meta: number }
export interface MetaPorAnuncio { anuncio_id: string; gasto: number; impresiones: number; clics_enlace: number; vistas_pagina: number; compras_meta: number; frecuencia_max: number | null }
export interface MetaPanel {
  cuenta: MetaCuenta | null; ultimo_sync: { ok: boolean; error: string | null; iniciado_at: string; terminado_at: string | null } | null;
  ultimo_sync_ok: string | null; objetos: MetaObjeto[]; dias: MetaDia[]; ubicaciones: MetaUbicacion[]; por_anuncio: MetaPorAnuncio[];
  horas: MetaHora[]; cambios: { id: number; objeto_id: string; nivel: string; nombre: string | null; tipo: string; antes: Record<string, string> | null; despues: Record<string, string> | null; detectado_at: string }[];
}

export type Gravedad = "rojo" | "naranja" | "amarillo";
export interface Aviso { gravedad: Gravedad; titulo: string; detalle: string; objeto_id?: string }

export const ESTADO_EFECTIVO: Record<string, { es: string; ok: boolean }> = {
  ACTIVE: { es: "Activo", ok: true },
  PAUSED: { es: "Pausado", ok: false },
  CAMPAIGN_PAUSED: { es: "Campaña pausada", ok: false },
  ADSET_PAUSED: { es: "Conjunto pausado", ok: false },
  IN_PROCESS: { es: "En preparación", ok: false },
  PENDING_REVIEW: { es: "En revisión", ok: false },
  PREAPPROVED: { es: "Preaprobado", ok: false },
  WITH_ISSUES: { es: "Con problemas", ok: false },
  DISAPPROVED: { es: "Rechazado", ok: false },
  PENDING_BILLING_INFO: { es: "Falta información de pago", ok: false },
  ARCHIVED: { es: "Archivado", ok: false },
  DELETED: { es: "Eliminado", ok: false },
};
export const estadoEs = (s: string | null) => (s ? ESTADO_EFECTIVO[s]?.es ?? s : "—");

const ESTADO_CUENTA: Record<number, string> = {
  1: "Activa", 2: "Deshabilitada", 3: "Pago pendiente", 7: "En revisión de riesgo", 8: "Liquidación pendiente",
  9: "En período de gracia (pago)", 100: "Cierre pendiente", 101: "Cerrada", 201: "Activa", 202: "Cerrada",
};
export const estadoCuentaEs = (n: number | null) => (n == null ? "—" : ESTADO_CUENTA[n] ?? `Estado ${n}`);

export const UBICACION_ES: Record<string, string> = {
  "facebook:feed": "Facebook · Feed", "facebook:facebook_reels": "Facebook · Reels", "facebook:story": "Facebook · Historias",
  "facebook:video_feeds": "Facebook · Videos", "facebook:marketplace": "Facebook · Marketplace", "facebook:search": "Facebook · Búsqueda",
  "facebook:instream_video": "Facebook · Video in-stream", "facebook:facebook_reels_overlay": "Facebook · Anuncios sobre Reels",
  "facebook:right_hand_column": "Facebook · Columna derecha", "facebook:profile_feed": "Facebook · Perfiles",
  "instagram:feed": "Instagram · Feed", "instagram:instagram_reels": "Instagram · Reels", "instagram:instagram_stories": "Instagram · Historias",
  "instagram:instagram_explore": "Instagram · Explorar", "instagram:instagram_explore_grid_home": "Instagram · Explorar (inicio)",
  "instagram:instagram_profile_feed": "Instagram · Perfil", "instagram:instagram_search": "Instagram · Búsqueda",
  "messenger:messenger_inbox": "Messenger · Bandeja", "messenger:messenger_stories": "Messenger · Historias",
  "threads:threads_feed": "Threads · Feed",
};
export const ubicacionEs = (u: string) =>
  UBICACION_ES[u] ?? (u.startsWith("audience_network") ? "Audience Network (apps y webs externas)" : u.replace(":", " · ").replace(/_/g, " "));

const fmt = (n: number, moneda: string | null) => `${moneda === "USD" ? "US$" : "$"} ${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;

// Hora actual (0–23) y fecha en el huso de la cuenta.
function ahoraEn(tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { fecha: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) };
}

export function diagnosticar(d: MetaPanel): { avisos: Aviso[]; semaforo: { gravedad: Gravedad | "verde" | "gris"; titulo: string; detalle: string } } {
  const avisos: Aviso[] = [];
  const moneda = d.cuenta?.moneda ?? null;
  const tz = d.cuenta?.zona_horaria ?? "America/Montevideo";
  const { fecha: hoy, hora } = ahoraEn(tz);
  const porId = new Map(d.objetos.map((o) => [o.id, o]));

  if (!d.cuenta) {
    return { avisos, semaforo: { gravedad: "gris", titulo: "Sin datos todavía", detalle: "La conexión con Meta no se sincronizó nunca." } };
  }

  // Cuenta
  if (d.cuenta.estado != null && ![1, 201].includes(d.cuenta.estado)) {
    avisos.push({ gravedad: "rojo", titulo: `Cuenta publicitaria: ${estadoCuentaEs(d.cuenta.estado)}`, detalle: "Con la cuenta así, Meta no muestra ningún anuncio. Revisá Facturación y pagos en el Administrador de anuncios." });
  }
  if (d.cuenta.limite_gasto && d.cuenta.gastado_total != null && d.cuenta.gastado_total >= d.cuenta.limite_gasto * 0.95) {
    avisos.push({ gravedad: "rojo", titulo: "Límite de gasto de la cuenta alcanzado", detalle: `Gastado ${fmt(d.cuenta.gastado_total, moneda)} de un límite de ${fmt(d.cuenta.limite_gasto, moneda)}.` });
  }

  // Campañas / conjuntos / anuncios encendidos a mano
  const encendidos = d.objetos.filter((o) => o.estado === "ACTIVE");
  for (const o of encendidos) {
    const nivel = o.nivel === "campana" ? "Campaña" : o.nivel === "conjunto" ? "Conjunto" : "Anuncio";
    const ef = o.estado_efectivo;
    if (ef && ef !== "ACTIVE" && !["CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(ef)) {
      const grave: Gravedad = ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"].includes(ef) ? "rojo" : "naranja";
      avisos.push({ gravedad: grave, titulo: `${nivel} «${o.nombre}»: ${estadoEs(ef)}`, detalle: ef === "IN_PROCESS" || ef === "PENDING_REVIEW" ? "Meta lo está revisando; mientras tanto no se muestra." : "No se está mostrando.", objeto_id: o.id });
    }
    for (const i of o.problemas?.issues_info ?? []) {
      avisos.push({ gravedad: "rojo", titulo: `${nivel} «${o.nombre}»: problema informado por Meta`, detalle: i.error_message || i.error_summary || "Sin detalle", objeto_id: o.id });
    }
    const rechazo = o.problemas?.ad_review_feedback?.global;
    if (rechazo) avisos.push({ gravedad: "rojo", titulo: `Anuncio «${o.nombre}» con observaciones de revisión`, detalle: Object.entries(rechazo).map(([k, v]) => `${k}: ${v}`).join(" · "), objeto_id: o.id });
    if (o.problemas?.learning_stage_info?.status === "FAIL") {
      avisos.push({ gravedad: "amarillo", titulo: `Conjunto «${o.nombre}»: aprendizaje limitado`, detalle: "Meta no junta suficientes resultados para optimizar. Suele mejorar con más presupuesto o un evento de optimización más frecuente (ej. vistas de página en vez de compras).", objeto_id: o.id });
    }
    if (o.fin) {
      const restanMs = new Date(o.fin).getTime() - Date.now();
      if (restanMs <= 0) avisos.push({ gravedad: "naranja", titulo: `${nivel} «${o.nombre}» terminó`, detalle: `La fecha de fin era ${new Date(o.fin).toLocaleDateString("es-UY")}.`, objeto_id: o.id });
      else if (restanMs < 2 * 86_400_000) avisos.push({ gravedad: "naranja", titulo: `${nivel} «${o.nombre}» termina pronto`, detalle: `Fecha de fin: ${new Date(o.fin).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })}.`, objeto_id: o.id });
    }
    if (o.presupuesto_total && o.presupuesto_restante != null) {
      const parte = o.presupuesto_restante / o.presupuesto_total;
      if (o.presupuesto_restante <= 0) avisos.push({ gravedad: "rojo", titulo: `${nivel} «${o.nombre}»: presupuesto total agotado`, detalle: `Presupuesto ${fmt(o.presupuesto_total, moneda)}, no queda nada.`, objeto_id: o.id });
      else if (parte < 0.2) avisos.push({ gravedad: "naranja", titulo: `${nivel} «${o.nombre}»: queda poco presupuesto`, detalle: `Quedan ${fmt(o.presupuesto_restante, moneda)} de ${fmt(o.presupuesto_total, moneda)}.`, objeto_id: o.id });
    }
  }

  // Entrega: anuncios activos pero sin gasto en las últimas 3 horas (se mira
  // desde el mediodía, para no alarmar por la madrugada)
  const anunciosActivos = d.objetos.filter((o) => o.nivel === "anuncio" && o.estado_efectivo === "ACTIVE");
  const horasHoy = d.horas.filter((h) => String(h.fecha).slice(0, 10) === hoy);
  const ultimaConGasto = [...d.horas].filter((h) => h.gasto > 0).sort((a, b) => (a.fecha + String(a.hora).padStart(2, "0")).localeCompare(b.fecha + String(b.hora).padStart(2, "0"))).pop();
  if (anunciosActivos.length && hora >= 12) {
    const recientes = horasHoy.filter((h) => h.hora >= hora - 3 && h.hora < hora);
    if (!recientes.some((h) => h.gasto > 0)) {
      avisos.push({ gravedad: "rojo", titulo: "Figura activo pero no está gastando", detalle: ultimaConGasto ? `Último gasto registrado: ${String(ultimaConGasto.fecha).slice(0, 10)} a las ${ultimaConGasto.hora}:00.` : "Sin gasto en hoy ni ayer." });
    }
  }

  // Audience Network
  const an = d.ubicaciones.filter((u) => u.ubicacion.startsWith("audience_network") && u.gasto > 0);
  if (an.length) {
    const g = an.reduce((s, u) => s + u.gasto, 0);
    avisos.push({ gravedad: "naranja", titulo: "Gasto en Audience Network", detalle: `${fmt(g, moneda)} en apps y webs externas en el período. Suelen ser clics de baja calidad.` });
  }

  // Frecuencia
  for (const a of d.por_anuncio) {
    if ((a.frecuencia_max ?? 0) > 3) {
      avisos.push({ gravedad: "amarillo", titulo: `«${porId.get(a.anuncio_id)?.nombre ?? a.anuncio_id}»: frecuencia ${a.frecuencia_max?.toFixed(1)}`, detalle: "La misma persona lo ve más de 3 veces por día: el público se cansa. Conviene renovar el creativo o ampliar el público.", objeto_id: a.anuncio_id });
    }
  }

  // Gasto de hoy muy por encima del promedio
  const previos = d.dias.filter((x) => x.fecha < hoy).slice(-7).filter((x) => x.gasto > 0);
  const gastoHoy = d.dias.find((x) => x.fecha === hoy)?.gasto ?? 0;
  if (previos.length >= 3) {
    const prom = previos.reduce((s, x) => s + x.gasto, 0) / previos.length;
    if (gastoHoy > prom * 1.5) avisos.push({ gravedad: "amarillo", titulo: "Hoy se gasta más que de costumbre", detalle: `Hoy ${fmt(gastoHoy, moneda)} contra un promedio de ${fmt(prom, moneda)} por día.` });
  }

  // Datos viejos
  const ultimoOk = d.ultimo_sync_ok ? new Date(d.ultimo_sync_ok).getTime() : 0;
  if (Date.now() - ultimoOk > 3 * 3_600_000) {
    avisos.push({ gravedad: "amarillo", titulo: "Datos de Meta desactualizados", detalle: d.ultimo_sync && !d.ultimo_sync.ok && d.ultimo_sync.error ? `La última sincronización falló: ${d.ultimo_sync.error}` : "Hace más de 3 horas que no se sincroniza." });
  }

  const orden: Gravedad[] = ["rojo", "naranja", "amarillo"];
  avisos.sort((a, b) => orden.indexOf(a.gravedad) - orden.indexOf(b.gravedad));

  const rojo = avisos.find((a) => a.gravedad === "rojo") ?? (anunciosActivos.length ? undefined : avisos.find((a) => a.gravedad === "naranja" && a.objeto_id));
  const ultimaHora = ultimaConGasto ? `última impresión con gasto: ${ultimaConGasto.hora}:00 del ${String(ultimaConGasto.fecha).slice(8, 10)}/${String(ultimaConGasto.fecha).slice(5, 7)}` : "sin gasto reciente";
  const semaforo = rojo
    ? { gravedad: rojo.gravedad, titulo: rojo.titulo, detalle: rojo.detalle }
    : anunciosActivos.length
      ? { gravedad: "verde" as const, titulo: `Se está mostrando · ${anunciosActivos.length} anuncio${anunciosActivos.length === 1 ? "" : "s"} activo${anunciosActivos.length === 1 ? "" : "s"}`, detalle: `Hoy gastó ${fmt(gastoHoy, moneda)} · ${ultimaHora}` }
      : { gravedad: "gris" as const, titulo: "No hay anuncios activos", detalle: "Todos los anuncios están pausados o terminados." };
  return { avisos, semaforo };
}
