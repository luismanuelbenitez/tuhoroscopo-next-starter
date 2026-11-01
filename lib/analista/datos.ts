// Analista de conversión (2026-11-01): arma el paquete de datos que analiza
// la IA. Todo agregado y SIN datos personales: ni nombres, ni emails, ni
// teléfonos, ni IP; solo conteos, porcentajes y comportamientos. El tráfico
// y el embudo excluyen siempre los dispositivos propios (es_interno); las
// ventas cobradas cuentan todas (regla de negocio) y se informa cuántas son
// internas. Solo lectura.

export type Getter = (q: string) => Promise<unknown>;

export const FUENTES = {
  trafico: "De dónde llegan (fuente, ubicación de Meta, dispositivo, ciudad, hora)",
  calidad: "Calidad de la visita (rebote, tiempo y scroll) por fuente y ubicación",
  embudo: "Embudo completo: visita → /tarot → checkout → formulario → Mercado Pago → pago",
  formulario: "Formulario del checkout: campos completados, trabas, errores y cupones",
  secciones: "Secciones de /tarot vistas, botones de compra y preguntas abiertas",
  ventas: "Ventas cobradas: cantidad, ingresos, ticket, tema y origen",
  postcompra: "Experiencia después de comprar: abrió la lectura, PDF, recompra, reclamos",
  meta_csv: "Exportaciones de Meta (gasto, alcance y resultados) que subiste",
  bitacora: "Bitácora de cambios (qué cambiaste y cuándo)",
} as const;
export type Fuente = keyof typeof FUENTES;
export const FUENTES_POR_DEFECTO: Record<Fuente, boolean> = {
  trafico: true, calidad: true, embudo: true, formulario: true, secciones: true,
  ventas: true, postcompra: true, meta_csv: true, bitacora: true,
};

// Desde cuándo existe cada medición: el analista no debe leer "0" como "nadie".
export const MEDICION_DESDE = {
  sesiones_y_eventos: "2026-10-26",
  scroll_y_tiempo: "2026-10-31T03:27:00Z",
  formulario_y_secciones: "2026-11-01T19:05:00Z",
} as const;

type Sesion = {
  anonymous_id: string; visitor_id: string | null; es_recurrente: boolean | null; es_interno: boolean | null;
  fuente: string | null; utm_source: string | null; utm_campaign: string | null; utm_content: string | null;
  device_type: string | null; os: string | null; in_app: string | null; city: string | null; landing_path: string | null;
  started_at: string;
};
type Evento = { session_id: string; event_name: string; path: string | null; value: number | string | null; metadata: { detalle?: string } | null; created_at: string };
type Pago = { orden_id: string; monto: number | string; mp_status: string; created_at: string };
type Orden = {
  id: string; tipo_orden: string | null; tema: string | null; precio_cobrado: number | string | null; funnel_session_id: string | null;
  cliente_id: string | null; has_complaint: boolean | null; created_at: string;
};

const DIA = 86_400_000;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const horaUY = (iso: string) => (new Date(iso).getUTCHours() + 21) % 24; // Uruguay: UTC-3 todo el año
const diaUY = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const contar = <T,>(xs: T[], clave: (x: T) => string | null | undefined) => {
  const m: Record<string, number> = {};
  for (const x of xs) { const k = clave(x) || "(sin dato)"; m[k] = (m[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
const top = (m: Record<string, number>, n: number) => Object.fromEntries(Object.entries(m).slice(0, n));
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// PostgREST corta en 1000 filas: se pide en páginas hasta traer todo.
async function todo<T>(get: Getter, q: string, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < max; off += 1000) {
    const pag = (await get(`${q}&limit=1000&offset=${off}`)) as T[];
    out.push(...pag);
    if (pag.length < 1000) break;
  }
  return out;
}

const ubicacionMeta = (s: Sesion) => {
  const u = (s.utm_source ?? "").toLowerCase();
  if (u === "an") return "Audience Network";
  if (u === "fb") return "Facebook";
  if (u === "ig") return "Instagram";
  if (u === "th") return "Threads";
  if (u === "msg" || u === "messenger") return "Messenger";
  return s.utm_source || "(sin ubicación)";
};

/** Todos los eventos de cada sesión, ya agrupados. */
function porSesion(eventos: Evento[]) {
  const m = new Map<string, Evento[]>();
  for (const e of eventos) {
    const l = m.get(e.session_id);
    if (l) l.push(e); else m.set(e.session_id, [e]);
  }
  return m;
}

function perfilSesion(evs: Evento[]) {
  const tiene = (n: string, f?: (e: Evento) => boolean) => evs.some((e) => e.event_name === n && (!f || f(e)));
  const maxValor = (n: string, path?: string) =>
    evs.filter((e) => e.event_name === n && (!path || e.path === path)).reduce((m, e) => Math.max(m, Number(e.value) || 0), 0);
  return {
    vio_tarot: tiene("landing_viewed") || tiene("page_view", (e) => e.path === "/tarot"),
    tiempo_max: maxValor("time_on_page"),
    scroll_tarot: maxValor("scroll_depth", "/tarot"),
    clic_cta: tiene("cta_click"),
    checkout: tiene("checkout_started"),
    empezo_form: tiene("form_started"),
    envio: tiene("form_submit"),
    a_mp: tiene("mp_redirect"),
    pago: tiene("payment_approved"),
  };
}
type Perfil = ReturnType<typeof perfilSesion>;

function calidadDe(sesiones: Sesion[], perfiles: Map<string, Perfil>) {
  const medidas = sesiones.filter((s) => s.started_at >= MEDICION_DESDE.scroll_y_tiempo);
  const p = (s: Sesion) => perfiles.get(s.anonymous_id);
  return {
    sesiones: sesiones.length,
    sesiones_con_medicion_de_tiempo: medidas.length,
    se_fueron_antes_de_10s: medidas.filter((s) => (p(s)?.tiempo_max ?? 0) < 10).length,
    se_quedaron_30s_o_mas: medidas.filter((s) => (p(s)?.tiempo_max ?? 0) >= 30).length,
    se_quedaron_60s_o_mas: medidas.filter((s) => (p(s)?.tiempo_max ?? 0) >= 60).length,
    bajaron_50pct_de_tarot: medidas.filter((s) => (p(s)?.scroll_tarot ?? 0) >= 50).length,
    llegaron_al_final_de_tarot: medidas.filter((s) => (p(s)?.scroll_tarot ?? 0) >= 100).length,
  };
}

function embudoDe(sesiones: Sesion[], perfiles: Map<string, Perfil>) {
  const n = (f: (p: Perfil) => boolean) => sesiones.filter((s) => { const p = perfiles.get(s.anonymous_id); return !!p && f(p); }).length;
  const etapas = {
    visitas: sesiones.length,
    vieron_tarot: n((p) => p.vio_tarot),
    clic_en_boton_de_compra: n((p) => p.clic_cta),
    llegaron_al_checkout: n((p) => p.checkout),
    empezaron_el_formulario: n((p) => p.empezo_form),
    enviaron_el_formulario: n((p) => p.envio),
    fueron_a_mercado_pago: n((p) => p.a_mp),
    pagaron: n((p) => p.pago),
  };
  return etapas;
}

export interface OpcionesPaquete {
  desde: Date;
  hasta: Date;
  fuentes: Record<Fuente, boolean>;
  contextoNegocio: string;
  minimoVisitas: number;
}

export async function armarPaquete(get: Getter, o: OpcionesPaquete) {
  const desdeISO = o.desde.toISOString();
  const hastaISO = o.hasta.toISOString();
  const largo = o.hasta.getTime() - o.desde.getTime();
  const antDesdeISO = new Date(o.desde.getTime() - largo).toISOString();
  const on = o.fuentes;

  const [sesionesTodas, eventos, pagos, precioCfg, csvs, bitacora] = await Promise.all([
    todo<Sesion>(get, `funnel_sessions?started_at=gte.${antDesdeISO}&started_at=lt.${hastaISO}&select=anonymous_id,visitor_id,es_recurrente,es_interno,fuente,utm_source,utm_campaign,utm_content,device_type,os,in_app,city,landing_path,started_at&order=started_at.asc`),
    todo<Evento>(get, `funnel_events?created_at=gte.${antDesdeISO}&created_at=lt.${hastaISO}&select=session_id,event_name,path,value,metadata,created_at&order=created_at.asc`, 200_000),
    todo<Pago>(get, `tarot_pagos?mp_status=eq.approved&created_at=gte.${antDesdeISO}&created_at=lt.${hastaISO}&select=orden_id,monto,mp_status,created_at&order=created_at.asc`),
    get(`tarot_configuracion?clave=eq.precio_base_uyu&select=valor`) as Promise<{ valor: string }[]>,
    on.meta_csv ? (get(`tarot_analista_meta_csv?select=nombre_archivo,desglose,periodo_desde,periodo_hasta,columnas,filas,notas&order=created_at.desc&limit=20`) as Promise<any[]>) : Promise.resolve([]),
    on.bitacora ? (get(`tarot_analista_bitacora?select=fecha,categoria,descripcion&order=fecha.asc&limit=200`) as Promise<any[]>) : Promise.resolve([]),
  ]);

  const enActual = (iso: string) => iso >= desdeISO;
  const externas = sesionesTodas.filter((s) => !s.es_interno);
  const actual = externas.filter((s) => enActual(s.started_at));
  const anterior = externas.filter((s) => !enActual(s.started_at));
  const internasIds = new Set(sesionesTodas.filter((s) => s.es_interno).map((s) => s.anonymous_id));
  const evsSesion = porSesion(eventos);
  const perfiles = new Map<string, Perfil>();
  for (const s of externas) perfiles.set(s.anonymous_id, perfilSesion(evsSesion.get(s.anonymous_id) ?? []));
  const evActual = eventos.filter((e) => enActual(e.created_at) && !internasIds.has(e.session_id));

  // Órdenes de los pagos aprobados (ventas cobradas).
  const idsOrden = Array.from(new Set(pagos.map((p) => p.orden_id)));
  const ordenes = idsOrden.length
    ? ((await get(`tarot_ordenes?id=in.(${idsOrden.join(",")})&select=id,tipo_orden,tema,precio_cobrado,funnel_session_id,cliente_id,has_complaint,created_at`)) as Orden[])
    : [];
  const ordenPorId = new Map(ordenes.map((x) => [x.id, x]));
  const sesionPorId = new Map(sesionesTodas.map((s) => [s.anonymous_id, s]));
  const ventasDe = (ps: Pago[]) => ps.map((p) => ({ p, o: ordenPorId.get(p.orden_id) })).filter((v) => v.o && v.o.tipo_orden !== "cortesia");

  const precio = Number(precioCfg?.[0]?.valor) || null;
  const paquete: Record<string, unknown> = {
    generado_el: new Date().toISOString(),
    periodo: { desde: desdeISO, hasta: hastaISO, dias: Math.round((largo / DIA) * 10) / 10 },
    periodo_anterior_para_comparar: { desde: antDesdeISO, hasta: desdeISO },
    negocio: {
      producto: "Lectura de tarot personalizada generada con IA, entregada en PDF por WhatsApp (y email opcional) en minutos, con versión web y audio.",
      precio_lista_uyu: precio,
      mercado: "Uruguay; pago único con Mercado Pago; tráfico pago principal: Meta (Facebook/Instagram).",
      contexto_de_manuel: o.contextoNegocio || "(sin contexto cargado)",
    },
    mediciones_disponibles_desde: MEDICION_DESDE,
    regla_de_rigor: { minimo_visitas_para_concluir: o.minimoVisitas },
    nota_privacidad: "Datos agregados y anónimos; se excluyen los dispositivos propios del negocio.",
  };

  if (on.trafico) {
    paquete.trafico = {
      visitas: actual.length,
      visitantes_distintos: new Set(actual.map((s) => s.visitor_id ?? s.anonymous_id)).size,
      visitas_de_recurrentes: actual.filter((s) => s.es_recurrente).length,
      por_fuente: contar(actual, (s) => s.fuente),
      meta_por_ubicacion: contar(actual.filter((s) => s.fuente === "Meta Ads" || s.utm_source), ubicacionMeta),
      por_campana: contar(actual.filter((s) => s.utm_campaign), (s) => `${s.utm_campaign} / ${s.utm_content ?? "-"}`),
      por_dispositivo: contar(actual, (s) => s.device_type),
      por_sistema: contar(actual, (s) => s.os),
      navegador_dentro_de_app: contar(actual, (s) => s.in_app ?? "no (navegador normal)"),
      pagina_de_llegada: top(contar(actual, (s) => s.landing_path), 8),
      ciudades_top: top(contar(actual, (s) => s.city), 10),
      por_hora_uy: contar(actual, (s) => String(horaUY(s.started_at)).padStart(2, "0")),
      por_dia: Object.fromEntries(Object.entries(contar(actual, (s) => diaUY(s.started_at))).sort()),
    };
  }

  if (on.calidad) {
    const porGrupo = (xs: Sesion[], clave: (s: Sesion) => string) => {
      const g: Record<string, Sesion[]> = {};
      for (const s of xs) (g[clave(s)] ??= []).push(s);
      return Object.fromEntries(Object.entries(g).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, calidadDe(v, perfiles)]));
    };
    paquete.calidad_de_visita = {
      total: calidadDe(actual, perfiles),
      por_fuente: porGrupo(actual, (s) => s.fuente ?? "(sin dato)"),
      meta_por_ubicacion: porGrupo(actual.filter((s) => s.fuente === "Meta Ads"), ubicacionMeta),
      por_dispositivo: porGrupo(actual, (s) => s.device_type ?? "(sin dato)"),
    };
  }

  if (on.embudo) {
    const g: Record<string, Sesion[]> = {};
    for (const s of actual) (g[s.fuente ?? "(sin dato)"] ??= []).push(s);
    paquete.embudo = {
      nota: "Etapas por visita (sesión). 'clic_en_boton_de_compra', 'empezaron/enviaron el formulario' y 'fueron_a_mercado_pago' existen recién desde la medición del formulario y secciones.",
      total: embudoDe(actual, perfiles),
      por_fuente: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, embudoDe(v, perfiles)])),
      meta_por_ubicacion: (() => {
        const m: Record<string, Sesion[]> = {};
        for (const s of actual.filter((x) => x.fuente === "Meta Ads")) (m[ubicacionMeta(s)] ??= []).push(s);
        return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, embudoDe(v, perfiles)]));
      })(),
    };
  }

  if (on.formulario) {
    const det = (n: string) => contar(evActual.filter((e) => e.event_name === n), (e) => e.metadata?.detalle);
    const tiemposCheckout = Array.from(porSesion(evActual.filter((e) => e.event_name === "time_on_page" && e.path === "/tarot/checkout")).values())
      .map((evs) => Math.max(...evs.map((e) => Number(e.value) || 0)));
    paquete.formulario_checkout = {
      nota: "Nombres de campo: nombre, telefono, email, fecha_nacimiento, tema, pregunta, pais, codigo_de_descuento, acepta_terminos. form_invalid = el navegador frenó el envío por un campo obligatorio vacío o mal.",
      primer_campo_tocado: det("form_started"),
      campos_completados: det("form_field_done"),
      frenado_por_campo_invalido: det("form_invalid"),
      envios: det("form_submit"),
      errores_al_enviar: det("form_error"),
      abrieron_codigo_de_descuento: evActual.filter((e) => e.event_name === "coupon_opened").length,
      resultado_del_codigo: det("coupon_result"),
      volvieron_a_tarot_desde_checkout: evActual.filter((e) => e.event_name === "checkout_back").length,
      tiempo_en_checkout_visitas_por_tramo: {
        menos_de_10s: tiemposCheckout.filter((t) => t < 10).length,
        "10_a_29s": tiemposCheckout.filter((t) => t >= 10 && t < 30).length,
        "30_a_59s": tiemposCheckout.filter((t) => t >= 30 && t < 60).length,
        "60_a_119s": tiemposCheckout.filter((t) => t >= 60 && t < 120).length,
        "120s_o_mas": tiemposCheckout.filter((t) => t >= 120).length,
      },
    };
  }

  if (on.secciones) {
    const det = (n: string) => contar(evActual.filter((e) => e.event_name === n), (e) => e.metadata?.detalle);
    paquete.secciones_tarot = {
      orden_en_la_pagina: ["header", "hero", "que_incluye", "asi_se_vive", "como_funciona", "por_tema", "testimonios", "dudas", "cta_final", "sticky (botón fijo abajo)"],
      visitas_que_vieron_cada_seccion: det("section_view"),
      clics_al_checkout_por_seccion: det("cta_click"),
      preguntas_frecuentes_abiertas: det("faq_open"),
    };
  }

  if (on.ventas) {
    const ventas = ventasDe(pagos.filter((p) => enActual(p.created_at)));
    const ventasAnt = ventasDe(pagos.filter((p) => !enActual(p.created_at)));
    const monto = (vs: typeof ventas) => vs.reduce((t, v) => t + (Number(v.p.monto) || 0), 0);
    paquete.ventas = {
      ventas_cobradas: ventas.length,
      de_dispositivos_propios: ventas.filter((v) => v.o?.funnel_session_id && internasIds.has(v.o.funnel_session_id)).length,
      ingresos_uyu: monto(ventas),
      ticket_promedio_uyu: ventas.length ? Math.round(monto(ventas) / ventas.length) : null,
      con_descuento: ventas.filter((v) => precio && Number(v.p.monto) < precio).length,
      por_tema: contar(ventas, (v) => v.o?.tema),
      por_fuente: contar(ventas, (v) => (v.o?.funnel_session_id ? sesionPorId.get(v.o.funnel_session_id)?.fuente : null) ?? "(sin sesión)"),
      por_hora_uy: contar(ventas, (v) => String(horaUY(v.p.created_at)).padStart(2, "0")),
      tasa_de_compra_sobre_visitas_pct: pct(ventas.filter((v) => !(v.o?.funnel_session_id && internasIds.has(v.o.funnel_session_id))).length, actual.length),
    };
    paquete.comparacion_con_periodo_anterior = {
      visitas: { actual: actual.length, anterior: anterior.length },
      ventas: { actual: ventas.length, anterior: ventasAnt.length },
      ingresos_uyu: { actual: monto(ventas), anterior: monto(ventasAnt) },
    };
  }

  if (on.postcompra) {
    const ventas = ventasDe(pagos.filter((p) => enActual(p.created_at)));
    const ids = ventas.map((v) => v.o!.id);
    const accesos = ids.length
      ? ((await get(`tarot_accesos_web?orden_id=in.(${ids.join(",")})&select=orden_id,opened_count,first_opened_at`)) as { orden_id: string; opened_count: number; first_opened_at: string | null }[])
      : [];
    const minutosHastaAbrir = accesos.filter((a) => a.first_opened_at).map((a) => {
      const pago = ventas.find((v) => v.o!.id === a.orden_id)?.p.created_at;
      return pago ? Math.round((new Date(a.first_opened_at!).getTime() - new Date(pago).getTime()) / 60000) : null;
    }).filter((x): x is number => x !== null && x >= 0);
    const clientes = ventas.map((v) => v.o!.cliente_id).filter(Boolean) as string[];
    const previas = clientes.length
      ? ((await get(`tarot_ordenes?cliente_id=in.(${Array.from(new Set(clientes)).join(",")})&tipo_orden=eq.venta&select=cliente_id,created_at`)) as { cliente_id: string; created_at: string }[])
      : [];
    const comprasPorCliente = contar(previas, (x) => x.cliente_id);
    paquete.post_compra = {
      lecturas_abiertas_en_la_web: accesos.filter((a) => (a.opened_count ?? 0) > 0).length,
      de_ventas: ventas.length,
      mediana_minutos_entre_pago_y_primera_apertura: mediana(minutosHastaAbrir),
      clics_en_descargar_pdf: evActual.filter((e) => e.event_name === "mobile_pdf_clicked").length,
      clientes_con_mas_de_una_compra: Object.values(comprasPorCliente).filter((n) => n > 1).length,
      reclamos: ventas.filter((v) => v.o?.has_complaint).length,
    };
  }

  if (on.meta_csv && csvs.length) {
    paquete.meta_exportaciones = csvs.map((c) => ({
      archivo: c.nombre_archivo, desglose: c.desglose, periodo: [c.periodo_desde, c.periodo_hasta],
      notas: c.notas, columnas: c.columnas, filas: (c.filas as unknown[]).slice(0, 150),
    }));
  }
  if (on.bitacora && bitacora.length) paquete.bitacora_de_cambios = bitacora;

  return paquete;
}
