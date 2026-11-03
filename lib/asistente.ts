// Asistente CEO (2026-10-31): corre chequeos sobre el negocio y arma un
// estado por área (comercial, operación, finanzas, experiencia, técnico y
// datos) con hallazgos accionables. Lo usan la página /admin/tarot/asistente
// (en vivo, al entrar) y el parte diario de las 8:00.
// Solo lectura: nunca ejecuta acciones ni le escribe a un cliente. Los números
// los calcula el código; los textos explican qué pasó y qué hacer.

import { calcularEstrategico, type Getter } from "@/lib/estrategico";
import { armarEjecucion, resumirEjecuciones, REFERENCIA_MS, duracionHumana, type LogEjecucion } from "@/lib/ejecuciones";
import { hallazgosDePendientes, type Pendiente } from "@/lib/pendientes";
import { diagnosticar, type MetaPanel } from "@/lib/metaAds/diagnostico";

export type Gravedad = "critico" | "atencion" | "info" | "bien";
export type EstadoArea = "bien" | "atencion" | "critico";
export type AreaClave = "comercial" | "operacion" | "finanzas" | "experiencia" | "tecnico" | "datos";

export interface Hallazgo {
  clave: string;          // estable, para marcarlo como listo / ignorado
  area: AreaClave;
  gravedad: Gravedad;
  titulo: string;
  detalle: string;
  que_hacer: string | null;
  link: string | null;
}
export interface Area {
  clave: AreaClave;
  nombre: string;
  pregunta: string;
  estado: EstadoArea;
  titular: string;
  metricas: { label: string; valor: string }[];
  hallazgos: Hallazgo[];
}
export interface Chequeo {
  generado_at: string;
  estado_general: EstadoArea;
  resumen: string;
  areas: Area[];
  ocultos: number;
}

const DIA = 86_400_000;
// El scroll de /tarot se mide desde esta fecha; antes de tener 7 días completos
// el paso "mirar la oferta" aparece más bajo de lo real y no se usa para la fuga.
const SCROLL_MEDIDO_DESDE = Date.parse("2026-10-31T03:27:00Z");
const diaUy = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
const AREAS: Record<AreaClave, { nombre: string; pregunta: string }> = {
  comercial:   { nombre: "Comercial",   pregunta: "¿Vendo más o menos, y por qué?" },
  operacion:   { nombre: "Operación",   pregunta: "¿La máquina entrega bien?" },
  finanzas:    { nombre: "Finanzas",    pregunta: "¿Gano o pierdo plata?" },
  experiencia: { nombre: "Experiencia", pregunta: "¿A los clientes les gusta lo que reciben?" },
  tecnico:     { nombre: "Técnico",     pregunta: "¿Hay algo que se pueda romper?" },
  datos:       { nombre: "Datos",       pregunta: "¿Los números son confiables?" },
};
const ORDEN_GRAVEDAD: Record<Gravedad, number> = { critico: 0, atencion: 1, info: 2, bien: 3 };

const pesos = (v: number) => `${v < 0 ? "−" : ""}$ ${Math.round(Math.abs(v)).toLocaleString("es-UY")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Corre todos los chequeos. `get` hace GET a PostgREST con service role. */
export async function correrChequeos(getRaw: Getter, ahora = Date.now()): Promise<Chequeo> {
  const get = getRaw as (q: string) => Promise<any>;
  const desde7 = new Date(ahora - 7 * DIA).toISOString();
  const desde1 = new Date(ahora - DIA).toISOString();
  const desde30 = new Date(ahora - 30 * DIA).toISOString();

  const [s7, s30, ords7, alertas, reenvios, costos, ultimaPublicidad, errores24, lecturas30, ocultosRows] = await Promise.all([
    calcularEstrategico(getRaw, 7, false, ahora),
    calcularEstrategico(getRaw, 30, false, ahora),
    get(`tarot_ordenes?estado=not.in.(formulario_completo,pago_iniciado,pago_rechazado,pago_expirado)&created_at=gte.${desde7}&select=id&limit=500`),
    get(`tarot_alertas_eventos?leida_at=is.null&select=id&limit=500`),
    get(`tarot_solicitudes_reenvio?estado=eq.pendiente_autorizacion&select=id,orden_id&limit=100`),
    get(`tarot_costos?select=nombre,tipo,monto,moneda,frecuencia,fecha_desde,activo,notas`),
    get(`campaign_costs?select=date&order=date.desc&limit=1`),
    get(`tarot_logs?created_at=gte.${desde1}&nivel=in.(error,critical)&select=evento,funcion_origen&limit=1000`),
    get(`tarot_lecturas?created_at=gte.${desde30}&estado=eq.completada&select=created_at,ia_costo_usd&limit=2000`),
    get(`tarot_asistente_hallazgos?oculto_hasta=gt.${new Date(ahora).toISOString()}&select=clave`),
  ]) as [
    Awaited<ReturnType<typeof calcularEstrategico>>, Awaited<ReturnType<typeof calcularEstrategico>>,
    { id: string }[], { id: string }[], { id: string; orden_id: string }[],
    { nombre: string; tipo: string; monto: string | number; moneda: string; frecuencia: string | null; fecha_desde: string; activo: boolean; notas: string | null }[],
    { date: string }[], { evento: string; funcion_origen: string | null }[], { created_at: string; ia_costo_usd: number | string | null }[], { clave: string }[],
  ];

  const ids7 = ords7.map((o) => o.id);
  const logs7 = ids7.length
    ? ((await get(`tarot_logs?orden_id=in.(${ids7.map(encodeURIComponent).join(",")})&select=orden_id,evento,nivel,mensaje,duracion_ms,funcion_origen,created_at&order=created_at.asc&limit=10000`)) as LogEjecucion[])
    : [];
  const porOrden = new Map<string, LogEjecucion[]>();
  for (const l of logs7) { const a = porOrden.get(l.orden_id); if (a) a.push(l); else porOrden.set(l.orden_id, [l]); }
  const ejec = resumirEjecuciones(Array.from(porOrden.values()).map((l) => armarEjecucion(l, ahora)));

  const H: Hallazgo[] = [];
  const add = (h: Hallazgo) => H.push(h);

  // ── Comercial ──────────────────────────────────────────────────────────────
  const a7 = s7.actual, b7 = s7.anterior;
  // Días de calendario (Montevideo) desde la última venta: 0 = hoy, 1 = ayer.
  const diasSinVenta = s7.ultima_venta_at
    ? Math.round((Date.parse(diaUy(ahora)) - Date.parse(diaUy(new Date(s7.ultima_venta_at).getTime()))) / DIA)
    : null;
  if (a7.plata.ventas === 0) {
    add({ clave: "sin_ventas_7d", area: "comercial", gravedad: "atencion", titulo: "Sin ventas en los últimos 7 días",
      detalle: diasSinVenta != null ? `La última venta real fue hace ${plural(diasSinVenta, "día", "días")}.` : "Todavía no hay ventas reales.",
      que_hacer: "Revisá si la publicidad está activa y mirá el embudo para ver dónde se va la gente.", link: "/admin/tarot" });
  } else if (a7.plata.ventas < b7.plata.ventas) {
    add({ clave: "ventas_bajan", area: "comercial", gravedad: "info", titulo: `Ventas en baja: ${a7.plata.ventas} contra ${b7.plata.ventas} la semana anterior`,
      detalle: "Comparación de los últimos 7 días con los 7 anteriores.", que_hacer: null, link: "/admin/tarot" });
  } else if (a7.plata.ventas > b7.plata.ventas) {
    add({ clave: "ventas_suben", area: "comercial", gravedad: "bien", titulo: `Ventas en alza: ${a7.plata.ventas} contra ${b7.plata.ventas} la semana anterior`,
      detalle: "Comparación de los últimos 7 días con los 7 anteriores.", que_hacer: null, link: "/admin/tarot" });
  }
  const e = a7.embudo;
  const pasos = [
    { n: e.personas, nombre: "entrar a la web y mirar la oferta", sig: e.interes, que: "La mayoría se va sin bajar ni hasta la mitad de la página de Tarot. Probá cambiar lo primero que ven (título, imagen, precio visible) o revisá si el anuncio promete lo mismo que muestra la página." },
    { n: e.interes, nombre: "mirar la oferta y abrir el formulario", sig: e.checkout, que: "Ven la oferta pero no se animan. Revisá precio, confianza (testimonios, garantía) y que el botón \"Quiero mi lectura\" se vea claro." },
    { n: e.checkout, nombre: "abrir el formulario y completarlo", sig: e.formulario, que: "Abren el formulario y lo abandonan. Revisá cuántos datos se piden, si en el celular se completa fácil y si aparece algún error." },
    { n: e.formulario, nombre: "completar el formulario y pagar", sig: e.pagaron, que: "Llegan a Mercado Pago y no pagan. Revisá medios de pago disponibles y si el link de pago funciona." },
  ];
  const scrollCompleto = ahora - 7 * DIA >= SCROLL_MEDIDO_DESDE;
  const peor = pasos.filter((p, i) => p.n >= 3 && (i > 0 || scrollCompleto)).map((p) => ({ ...p, perdida: p.n - p.sig })).sort((x, y) => y.perdida - x.perdida)[0];
  if (peor && peor.perdida > 0) {
    add({ clave: `embudo_caida:${peor.nombre}`, area: "comercial", gravedad: "atencion", titulo: `La mayor fuga está entre ${peor.nombre}`,
      detalle: `En 7 días: de ${peor.n} siguieron ${peor.sig} (${pct(peor.sig, peor.n)}). Se fueron ${peor.perdida}.`, que_hacer: peor.que, link: "/admin/tarot" });
  }
  for (const o of a7.origen) {
    if (/meta ads|campaña|google ads/i.test(o.fuente) && o.personas >= 15 && o.ventas === 0) {
      add({ clave: `canal_sin_ventas:${o.fuente}`, area: "comercial", gravedad: "info", titulo: `${o.fuente}: ${o.personas} personas y ninguna venta`,
        detalle: `En 7 días, ${o.checkout} de ellas abrieron el formulario.`, que_hacer: "Revisá la segmentación y que el anuncio prometa lo mismo que muestra la página; si no mejora, pausalo.", link: "/admin/tarot" });
    }
  }

  // ── Operación ──────────────────────────────────────────────────────────────
  for (const t of s7.atender.trabadas) {
    add({ clave: `orden_trabada:${t.id}`, area: "operacion", gravedad: "critico", titulo: `La compra de ${t.cliente ?? "un cliente"} está trabada o con error`,
      detalle: `Estado actual: ${t.estado}.`, que_hacer: "Abrí la ficha de la orden: ahí está el checklist de qué paso falló y la acción para reintentarlo.", link: `/admin/tarot/ordenes?orden_id=${t.id}` });
  }
  if (ejec.con_error > 0) {
    add({ clave: `ejecuciones_error:${ejec.con_error}`, area: "operacion", gravedad: "atencion", titulo: `${plural(ejec.con_error, "compra no salió sola", "compras no salieron solas")} en 7 días`,
      detalle: `${ejec.sin_problemas} de ${ejec.compras} llegaron de punta a punta sin intervención.`, que_hacer: "Mirá en Ejecuciones en qué paso falló cada una.", link: "/admin/tarot/ejecuciones" });
  }
  for (const p of ejec.pasos) {
    if (p.problemas > 0) {
      add({ clave: `paso_problemas:${p.clave}:${p.problemas}`, area: "operacion", gravedad: "info", titulo: `${p.nombre}: ${plural(p.problemas, "falla o reintento", "fallas o reintentos")} en 7 días`,
        detalle: "Se resolvieron solos o con reintento, pero conviene mirarlo si se repite.", que_hacer: null, link: "/admin/tarot/ejecuciones" });
    }
    const ref = REFERENCIA_MS[p.clave];
    if (p.mediana_ms != null && p.mediana_ms > ref * 1.5) {
      add({ clave: `paso_lento:${p.clave}`, area: "operacion", gravedad: "atencion", titulo: `${p.nombre} anda lento: ${duracionHumana(p.mediana_ms)} (lo normal es ~${duracionHumana(ref)})`,
        detalle: "Tiempo típico de los últimos 7 días.", que_hacer: p.clave === "lectura" ? "Puede ser lentitud del proveedor de IA. Si sigue, revisá el estado de Anthropic." : "Revisá en Ejecuciones si es un caso puntual o general.", link: "/admin/tarot/ejecuciones" });
    }
  }
  if (reenvios.length > 0) {
    add({ clave: `reenvios_pendientes:${reenvios.length}`, area: "operacion", gravedad: "atencion", titulo: `${plural(reenvios.length, "reenvío espera", "reenvíos esperan")} tu autorización`,
      detalle: "Nada se le reenvía a un cliente sin que lo autorices.", que_hacer: "Revisalos en Entregas y autorizá o rechazá.", link: "/admin/tarot/entregas" });
  }
  if (alertas.length > 0) {
    add({ clave: `alertas_sin_leer:${alertas.length}`, area: "operacion", gravedad: "info", titulo: `${plural(alertas.length, "alerta sin leer", "alertas sin leer")}`,
      detalle: "", que_hacer: "Leelas en Alertas; las que son de pruebas podés marcarlas como leídas.", link: "/admin/tarot/alertas" });
  }

  // ── Finanzas ───────────────────────────────────────────────────────────────
  const p30 = s30.actual.plata, ad30 = s30.actual.adquisicion;
  if (p30.resultado < 0) {
    add({ clave: "resultado_negativo", area: "finanzas", gravedad: "atencion", titulo: `Últimos 30 días en pérdida: ${pesos(p30.resultado)}`,
      detalle: `Las ventas dejaron ${pesos(p30.queda)}; los costos fijos del período fueron ${pesos(p30.fijos)}, la publicidad ${pesos(p30.publicidad)} y las cortesías ${pesos(p30.costo_cortesias)}.`,
      que_hacer: s30.punto_equilibrio != null ? `Necesitás ${plural(s30.punto_equilibrio, "venta", "ventas")} por mes para cubrir los costos fijos.` : null, link: "/admin/tarot/presupuesto" });
  } else if (p30.ventas > 0) {
    add({ clave: "resultado_positivo", area: "finanzas", gravedad: "bien", titulo: `Últimos 30 días en ganancia: ${pesos(p30.resultado)}`, detalle: "", que_hacer: null, link: "/admin/tarot/presupuesto" });
  }
  if (s30.punto_equilibrio != null) {
    const faltan = s30.punto_equilibrio - s30.ventas_mes;
    const diaMes = new Date(ahora - 3 * 3600_000).getUTCDate();
    add({ clave: `equilibrio_mes:${s30.ventas_mes}`, area: "finanzas", gravedad: faltan > 0 ? "info" : "bien",
      titulo: faltan > 0 ? `Este mes vas ${s30.ventas_mes} de ${s30.punto_equilibrio} ventas para cubrir los costos fijos` : `Este mes ya cubriste los costos fijos (${s30.ventas_mes} ventas)`,
      detalle: `Día ${diaMes} del mes. Cada venta deja ${pesos(s30.margen_por_venta ?? 0)}; los costos fijos son ${pesos(s30.fijos_mensuales)} por mes.`, que_hacer: null, link: "/admin/tarot/presupuesto" });
  }
  if (ad30.cac != null && s30.margen_por_venta != null && ad30.cac > s30.margen_por_venta) {
    add({ clave: "cac_mayor_margen", area: "finanzas", gravedad: "critico", titulo: `Conseguir un cliente cuesta más de lo que deja: CAC ${pesos(ad30.cac)} contra ${pesos(s30.margen_por_venta)} por venta`,
      detalle: "Cada cliente nuevo te hace perder plata en la primera compra.", que_hacer: "Bajá el costo por venta (mejor segmentación, mejor página) o apostá a la recompra.", link: "/admin/tarot/presupuesto" });
  }
  if (p30.cortesias > 0) {
    add({ clave: `cortesias:${p30.cortesias}`, area: "finanzas", gravedad: "info", titulo: `${plural(p30.cortesias, "cortesía regalada", "cortesías regaladas")} en 30 días: ${pesos(p30.costo_cortesias)}`,
      detalle: "Costo de IA, audio y WhatsApp.", que_hacer: null, link: "/admin/tarot/codigos" });
  }
  for (const c of costos) {
    if (!c.activo || c.tipo !== "fijo" || c.frecuencia !== "anual") continue;
    const base = new Date(`${c.fecha_desde}T00:00:00-03:00`);
    const prox = new Date(base);
    while (prox.getTime() <= ahora) prox.setFullYear(prox.getFullYear() + 1);
    const dias = Math.ceil((prox.getTime() - ahora) / DIA);
    if (dias <= 30) {
      add({ clave: `vence:${c.nombre}:${prox.toISOString().slice(0, 10)}`, area: "finanzas", gravedad: dias <= 7 ? "atencion" : "info",
        titulo: `${c.nombre} se renueva en ${plural(dias, "día", "días")}`, detalle: `${c.moneda === "USD" ? "US$" : "$"} ${Number(c.monto)} por año.`, que_hacer: "Verificá que el medio de pago esté vigente.", link: "/admin/tarot/presupuesto" });
    }
  }

  // ── Experiencia ────────────────────────────────────────────────────────────
  const x30 = s30.actual.experiencia;
  for (const r of s7.atender.reclamos) {
    add({ clave: `reclamo:${r.id}`, area: "experiencia", gravedad: "critico", titulo: `Reclamo sin responder de ${r.cliente ?? "un cliente"}`,
      detalle: "", que_hacer: "Respondé desde la ficha de la orden o desde la bandeja de WhatsApp.", link: `/admin/tarot/ordenes?orden_id=${r.id}` });
  }
  if (x30.entregadas > 0) {
    const noAbrieron = x30.entregadas - x30.abrieron;
    add({ clave: `aperturas:${x30.abrieron}:${x30.entregadas}`, area: "experiencia", gravedad: noAbrieron > 0 ? "info" : "bien",
      titulo: noAbrieron > 0 ? `${plural(noAbrieron, "cliente no abrió", "clientes no abrieron")} su lectura (30 días)` : `Todos los clientes abrieron su lectura (30 días)`,
      detalle: `${x30.abrieron} de ${x30.entregadas} la abrieron · ${x30.bajaron_pdf} bajaron el PDF · ${x30.leyeron_1min} la leyeron más de 1 minuto.`,
      que_hacer: noAbrieron > 0 ? "Si querés, escribiles vos desde la bandeja de WhatsApp (nada se envía solo)." : null, link: "/admin/tarot/ordenes" });
  }
  if (s7.recompra.clientes >= 3) {
    add({ clave: `recompra:${s7.recompra.recompraron}`, area: "experiencia", gravedad: "info", titulo: `${s7.recompra.recompraron} de ${s7.recompra.clientes} clientes volvieron a comprar`,
      detalle: "Histórico de ventas reales.", que_hacer: s7.recompra.recompraron === 0 ? "Una segunda lectura con descuento a los 30 días puede ayudar (cuando quieras activar campañas)." : null, link: "/admin/tarot/clientes-unicos" });
  }

  // ── Técnico ────────────────────────────────────────────────────────────────
  if (errores24.length > 0) {
    const porEvento = new Map<string, number>();
    for (const r of errores24) porEvento.set(r.evento, (porEvento.get(r.evento) ?? 0) + 1);
    const top = Array.from(porEvento.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ev, n]) => `${ev} ×${n}`).join(", ");
    add({ clave: `errores_24h:${errores24.length}`, area: "tecnico", gravedad: errores24.length >= 5 ? "atencion" : "info", titulo: `${plural(errores24.length, "error registrado", "errores registrados")} en las últimas 24 h`,
      detalle: top, que_hacer: "Mirá el detalle en Logs; si son de una compra, en Ejecuciones.", link: "/admin/tarot/logs" });
  }
  const costoLect = (desde: number) => {
    const v = lecturas30.filter((l) => new Date(l.created_at).getTime() >= desde).map((l) => Number(l.ia_costo_usd ?? 0)).filter((n) => n > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const ia7 = costoLect(ahora - 7 * DIA), ia30 = costoLect(ahora - 30 * DIA);
  if (ia7 != null && ia30 != null && ia7 > ia30 * 1.4) {
    add({ clave: "costo_ia_sube", area: "tecnico", gravedad: "atencion", titulo: `El costo de IA por lectura subió: US$ ${ia7.toFixed(3)} contra US$ ${ia30.toFixed(3)} del mes`,
      detalle: "Puede ser un cambio de prompt o de modelo, o reintentos.", que_hacer: "Revisá Lecturas y la configuración de IA.", link: "/admin/tarot/lecturas" });
  }
  const supabase = costos.find((c) => /supabase/i.test(c.nombre));
  if (supabase && !supabase.activo) {
    add({ clave: "supabase_free", area: "tecnico", gravedad: s30.ventas_mes >= 5 ? "atencion" : "info", titulo: "Supabase sigue en el plan gratis",
      detalle: "El plan gratis no tiene respaldos automáticos y se pausa si no hay actividad.", que_hacer: "Mientras tanto, corré el respaldo semanal (C:\\dev\\respaldos\\respaldar.ps1). Pasá a Pro cuando empiecen las ventas regulares.", link: "/admin/tarot/presupuesto" });
  }

  // ── Datos ──────────────────────────────────────────────────────────────────
  if (s30.tipo_cambio.estimado) {
    add({ clave: "tipo_cambio_sin_cargar", area: "datos", gravedad: "atencion", titulo: "Falta cargar el tipo de cambio",
      detalle: "Los costos en dólares se están calculando con un dólar estimado a 40.", que_hacer: "Cargalo en Presupuesto → Valores de referencia.", link: "/admin/tarot/presupuesto" });
  }
  const ultPub = ultimaPublicidad[0]?.date ?? null;
  const diasPub = ultPub ? Math.floor((ahora - new Date(`${ultPub}T12:00:00-03:00`).getTime()) / DIA) : null;
  const hayTraficoPago = a7.origen.some((o) => /meta ads|campaña/i.test(o.fuente) && o.personas > 0);
  if (hayTraficoPago && (diasPub == null || diasPub > 7)) {
    add({ clave: "publicidad_sin_cargar", area: "datos", gravedad: "atencion", titulo: diasPub == null ? "Hay tráfico de anuncios pero nunca cargaste el gasto" : `Hace ${diasPub} días que no cargás el gasto de publicidad`,
      detalle: "Sin el gasto no se puede calcular el CAC ni si la publicidad rinde.", que_hacer: "Cargalo en Presupuesto → Publicidad (alcanza con el total de la semana).", link: "/admin/tarot/presupuesto" });
  }
  const aConfirmar = costos.filter((c) => c.activo && /confirmar/i.test(c.notas ?? ""));
  if (aConfirmar.length) {
    add({ clave: `costos_a_confirmar:${aConfirmar.map((c) => c.nombre).join("|")}`, area: "datos", gravedad: "info", titulo: `${plural(aConfirmar.length, "costo para confirmar", "costos para confirmar")}: ${aConfirmar.map((c) => c.nombre).join(", ")}`,
      detalle: "Están cargados con un monto aproximado.", que_hacer: "Revisalos contra la factura y borrá la nota \"confirmar\".", link: "/admin/tarot/presupuesto" });
  }

  // ── Pendientes y Meta Ads (2026-11-02) ─────────────────────────────────────
  // Otros módulos de inteligencia del admin. Si alguno falla, se omite.
  const [pendientes, panelMeta] = await Promise.all([
    (get(`admin_pendientes?estado=in.(abierto,en_curso,esperando)&select=*`) as Promise<Pendiente[]>).catch(() => [] as Pendiente[]),
    (get(`rpc/meta_ads_panel?p_dias=14`) as Promise<MetaPanel | null>).catch(() => null),
  ]);
  for (const h of hallazgosDePendientes(pendientes)) add(h);
  if (panelMeta?.cuenta) {
    for (const a of diagnosticar(panelMeta).avisos.filter((x) => x.gravedad !== "amarillo")) {
      add({ clave: `meta_ads:${a.objeto_id ?? "cuenta"}:${a.titulo.replace(/[\d.,$]+/g, "").trim().slice(0, 80)}`, area: "comercial",
        gravedad: a.gravedad === "rojo" ? "atencion" : "info", titulo: `Meta Ads: ${a.titulo}`, detalle: a.detalle,
        que_hacer: "Revisalo en Meta Ads; si hay que hacer algo, convertilo en pendiente.", link: "/admin/tarot/meta-ads" });
    }
  }

  // ── Armado por área ────────────────────────────────────────────────────────
  const ocultos = new Set(ocultosRows.map((r) => r.clave));
  const visibles = H.filter((h) => !ocultos.has(h.clave)).sort((a, b) => ORDEN_GRAVEDAD[a.gravedad] - ORDEN_GRAVEDAD[b.gravedad]);
  const metricas: Record<AreaClave, { label: string; valor: string }[]> = {
    comercial: [
      { label: "Ventas 7 días", valor: `${a7.plata.ventas} (antes ${b7.plata.ventas})` },
      { label: "Visitantes 7 días", valor: String(e.personas) },
      { label: "Última venta", valor: diasSinVenta == null ? "—" : diasSinVenta === 0 ? "hoy" : diasSinVenta === 1 ? "ayer" : `hace ${diasSinVenta} días` },
    ],
    operacion: [
      { label: "Salieron solas (7 días)", valor: `${ejec.sin_problemas} de ${ejec.compras}` },
      { label: "Entrega normal", valor: duracionHumana(ejec.entrega_mediana_ms) },
      { label: "En curso ahora", valor: String(ejec.en_curso) },
    ],
    finanzas: [
      { label: "Resultado 30 días", valor: pesos(p30.resultado) },
      { label: "Ventas del mes", valor: s30.punto_equilibrio != null ? `${s30.ventas_mes} de ${s30.punto_equilibrio} para cubrir fijos` : String(s30.ventas_mes) },
      { label: "CAC", valor: ad30.cac != null ? pesos(ad30.cac) : "sin publicidad cargada" },
    ],
    experiencia: [
      { label: "Abrieron la lectura (30 días)", valor: x30.entregadas ? `${x30.abrieron} de ${x30.entregadas}` : "—" },
      { label: "Bajaron el PDF", valor: x30.entregadas ? `${x30.bajaron_pdf} de ${x30.entregadas}` : "—" },
      { label: "Reclamos abiertos", valor: String(s7.atender.reclamos.length) },
    ],
    tecnico: [
      { label: "Errores 24 h", valor: String(errores24.length) },
      { label: "Costo IA por lectura", valor: ia7 != null ? `US$ ${ia7.toFixed(3)}` : "—" },
      { label: "Alertas sin leer", valor: String(alertas.length) },
    ],
    datos: [
      { label: "Dólar", valor: s30.tipo_cambio.estimado ? "estimado (40)" : String(s30.tipo_cambio.valor) },
      { label: "Último gasto de publicidad", valor: ultPub ? `${ultPub.slice(8, 10)}/${ultPub.slice(5, 7)}` : "nunca" },
      { label: "Costos a confirmar", valor: String(aConfirmar.length) },
    ],
  };

  const areas: Area[] = (Object.keys(AREAS) as AreaClave[]).map((clave) => {
    const hs = visibles.filter((h) => h.area === clave);
    const estado: EstadoArea = hs.some((h) => h.gravedad === "critico") ? "critico" : hs.some((h) => h.gravedad === "atencion") ? "atencion" : "bien";
    const problema = hs.find((h) => h.gravedad === "critico" || h.gravedad === "atencion");
    const bueno = hs.find((h) => h.gravedad === "bien");
    return {
      clave, ...AREAS[clave], estado, hallazgos: hs, metricas: metricas[clave],
      titular: problema?.titulo ?? bueno?.titulo ?? "Sin novedades",
    };
  });

  const criticos = visibles.filter((h) => h.gravedad === "critico").length;
  const atencion = visibles.filter((h) => h.gravedad === "atencion").length;
  const estado_general: EstadoArea = criticos ? "critico" : atencion ? "atencion" : "bien";
  const partes = [
    criticos ? plural(criticos, "cosa urgente", "cosas urgentes") : null,
    atencion ? plural(atencion, "punto para atender", "puntos para atender") : null,
  ].filter(Boolean);
  const resumen = [
    partes.length ? `Hay ${partes.join(" y ")}.` : "Todo en orden: nada urgente.",
    `Ventas: ${a7.plata.ventas} en 7 días (antes ${b7.plata.ventas}).`,
    `Operación: ${ejec.sin_problemas} de ${ejec.compras} compras salieron solas.`,
    `Finanzas: ${p30.resultado >= 0 ? "ganancia" : "pérdida"} de ${pesos(Math.abs(p30.resultado))} en 30 días.`,
  ].join(" ");

  return { generado_at: new Date(ahora).toISOString(), estado_general, resumen, areas, ocultos: H.length - visibles.length };
}
