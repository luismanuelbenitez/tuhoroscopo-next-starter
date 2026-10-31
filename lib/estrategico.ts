// Cálculo del dashboard estratégico (lo usa /api/admin/tarot/estrategico).
// Dashboard estratégico (2026-10-31): responde ¿estoy vendiendo?, ¿dónde se
// cae la gente?, ¿cuánto me queda?, ¿al cliente le gustó? y ¿qué tengo que
// atender hoy?, comparando con el período anterior. Por defecto solo ventas
// cobradas: toda compra pagada por Mercado Pago es venta, aunque la haga
// alguien de casa (es plata real). Las cortesías no son ventas (`incluir=1`
// las suma). El embudo y el tráfico excluyen siempre los dispositivos propios.
// Solo lectura y en lote (~9 consultas por carga, sin EFs).

const FUERA = new Set(["formulario_completo", "pago_iniciado", "pago_rechazado", "pago_expirado", "cancelado"]);
const EN_CURSO = new Set(["pago_confirmado", "generando_lectura", "lectura_lista", "generando_pdf", "pdf_listo", "enviando_whatsapp"]);
const DIA = 86_400_000;
const DIAS_MES = 30.4375;
const TC_POR_DEFECTO = 40;
export const PERIODOS = new Set([1, 7, 30]);

type Orden = {
  id: string; cliente_id: string | null; tipo_orden: string | null; estado: string; precio_cobrado: number | string | null;
  moneda: string | null; funnel_session_id: string | null; created_at: string; updated_at: string;
  has_complaint: boolean | null; follow_up_status: string | null; nombre_snapshot: string | null;
};
type Costo = {
  id: string; nombre: string; categoria: string; tipo: "fijo" | "puntual"; monto: number | string; moneda: "USD" | "UYU";
  frecuencia: "mensual" | "anual" | null; fecha_desde: string; fecha_hasta: string | null; activo: boolean;
};
type Publicidad = { date: string; amount: number | string; currency: string | null; utm_campaign: string | null };
type Sesion = { anonymous_id: string; visitor_id: string | null; es_interno: boolean | null; fuente: string | null; checkout: boolean | null; created_at: string };

export type Getter = (q: string) => Promise<unknown>;

/** Todo el cálculo (separado del handler para poder probarlo sin sesión). */
export async function calcularEstrategico(getRaw: Getter, periodo: number, incluir: boolean, ahora = Date.now()) {
  const get = getRaw as (q: string) => Promise<any>;
  const iniActual = ahora - periodo * DIA;
  const iniAnterior = ahora - 2 * periodo * DIA;
  const desde = new Date(Math.min(iniAnterior, ahora - 30 * DIA)).toISOString();

    const [ordenes, sesiones, scrolls, checkouts, config, costos, publicidad] = (await Promise.all([
      get(`tarot_ordenes?select=id,cliente_id,tipo_orden,estado,precio_cobrado,moneda,funnel_session_id,created_at,updated_at,has_complaint,follow_up_status,nombre_snapshot&order=created_at.asc&limit=10000`),
      get(`funnel_sessions?created_at=gte.${desde}&select=anonymous_id,visitor_id,es_interno,fuente,checkout,created_at&limit=50000`),
      get(`funnel_events?created_at=gte.${desde}&event_name=eq.scroll_depth&path=eq.${encodeURIComponent("/tarot")}&value=in.(50,75,100)&select=session_id&limit=50000`),
      get(`funnel_events?created_at=gte.${desde}&event_name=eq.checkout_started&select=session_id&limit=50000`),
      get(`tarot_configuracion?clave=in.(tipo_cambio_usd_uyu,tts_costo_por_1000_caracteres_usd,whatsapp_costo_por_mensaje_usd)&select=clave,valor`),
      get(`tarot_costos?activo=eq.true&select=id,nombre,categoria,tipo,monto,moneda,frecuencia,fecha_desde,fecha_hasta,activo`),
      get(`campaign_costs?date=gte.${desde.slice(0, 10)}&select=date,amount,currency,utm_campaign&limit=5000`),
    ])) as [Orden[], Sesion[], { session_id: string }[], { session_id: string }[], { clave: string; valor: string }[], Costo[], Publicidad[]];

    const cfg = new Map(config.map((c) => [c.clave, c.valor]));
    const tcCfg = Number(cfg.get("tipo_cambio_usd_uyu"));
    const tc = Number.isFinite(tcCfg) && tcCfg > 0 ? tcCfg : TC_POR_DEFECTO;
    const ttsPor1000 = Number(cfg.get("tts_costo_por_1000_caracteres_usd")) || 0.015;
    const waPorMensaje = Number(cfg.get("whatsapp_costo_por_mensaje_usd")) || 0;
    const aPesos = (monto: number | string, moneda: string | null) => (Number(monto) || 0) * (moneda === "USD" ? tc : 1);

    // Tráfico propio: sesiones internas (las de las órdenes pueden ser viejas).
    const sesionesOrden = Array.from(new Set(ordenes.map((o) => o.funnel_session_id).filter(Boolean))) as string[];
    const internasOrden = sesionesOrden.length
      ? ((await get(`funnel_sessions?anonymous_id=in.(${sesionesOrden.map((s) => `"${s}"`).join(",")})&es_interno=eq.true&select=anonymous_id`)) as { anonymous_id: string }[])
      : [];
    const internas = new Set([...internasOrden.map((s) => s.anonymous_id), ...sesiones.filter((s) => s.es_interno).map((s) => s.anonymous_id)]);
    const esInterna = (o: Orden) => !!o.funnel_session_id && internas.has(o.funnel_session_id);
    const esCortesia = (o: Orden) => o.tipo_orden === "cortesia";
    const pagada = (o: Orden) => !FUERA.has(o.estado);
    const cuenta = (o: Orden) => pagada(o) && (incluir || !esCortesia(o));
    // Venta = cobrada por Mercado Pago (Manuel 2026-10-31: "ella pagó con su tarjeta").
    const ventaReal = (o: Orden) => pagada(o) && !esCortesia(o);

    // Datos por orden de lo que entró al pipeline en la ventana completa.
    const enVentana = ordenes.filter((o) => o.created_at >= desde && pagada(o));
    const ids = enVentana.map((o) => o.id);
    const lista = ids.map(encodeURIComponent).join(",");
    const [pagos, lecturas, evOrden, waEnviados] = (await Promise.all([
      ids.length ? get(`tarot_pagos?orden_id=in.(${lista})&select=orden_id,mp_status,neto:webhook_payload->transaction_details->>net_received_amount,fees:webhook_payload->fee_details`) : [],
      ids.length ? get(`tarot_lecturas?orden_id=in.(${lista})&select=orden_id,ia_costo_usd,audio_resumen_caracteres`) : [],
      ids.length ? get(`funnel_events?order_id=in.(${lista})&event_name=in.(mobile_reading_opened,mobile_pdf_clicked)&select=order_id,session_id,event_name,created_at&order=created_at.asc&limit=10000`) : [],
      ids.length ? get(`tarot_logs?orden_id=in.(${lista})&evento=eq.wa_enviado&select=orden_id&limit=10000`) : [],
    ])) as [
      { orden_id: string; mp_status: string | null; neto: string | null; fees: { amount?: number }[] | null }[],
      { orden_id: string; ia_costo_usd: number | string | null; audio_resumen_caracteres: number | null }[],
      { order_id: string; session_id: string | null; event_name: string; created_at: string }[],
      { orden_id: string }[],
    ];
    const sesLectura = Array.from(new Set(evOrden.filter((e) => e.event_name === "mobile_reading_opened" && e.session_id).map((e) => e.session_id as string)));
    const tiempos = sesLectura.length
      ? ((await get(`funnel_events?session_id=in.(${sesLectura.map((s) => `"${s}"`).join(",")})&event_name=eq.time_on_page&path=eq.${encodeURIComponent("/lectura/[token]")}&value=in.(60,120)&select=session_id`)) as { session_id: string }[])
      : [];
    const sesLeyoMinuto = new Set(tiempos.map((t) => t.session_id));

    const pagoDe = new Map<string, { neto: number | null; comision: number }>();
    for (const pg of pagos) {
      if (pg.mp_status && pg.mp_status !== "approved") continue;
      const fees = Array.isArray(pg.fees) ? pg.fees.reduce((a, f) => a + (Number(f.amount) || 0), 0) : 0;
      pagoDe.set(pg.orden_id, { neto: pg.neto != null && pg.neto !== "" ? Number(pg.neto) : null, comision: fees });
    }
    // Costos por orden: IA y audio (de cada lectura, incluidos intentos) y
    // cada plantilla de WhatsApp entregada (Meta la cobra como Marketing).
    const costoDe = new Map<string, { ia: number; audio: number; wa: number }>();
    for (const w of waEnviados) {
      const c = costoDe.get(w.orden_id) ?? { ia: 0, audio: 0, wa: 0 };
      c.wa += waPorMensaje * tc;
      costoDe.set(w.orden_id, c);
    }
    for (const l of lecturas) {
      const c = costoDe.get(l.orden_id) ?? { ia: 0, audio: 0, wa: 0 };
      c.ia += (Number(l.ia_costo_usd ?? 0) || 0) * tc;
      c.audio += ((Number(l.audio_resumen_caracteres ?? 0) || 0) / 1000) * ttsPor1000 * tc;
      costoDe.set(l.orden_id, c);
    }
    const aperturas = new Map<string, { primera: string; sesiones: Set<string>; pdf: number }>();
    for (const e of evOrden) {
      const a = aperturas.get(e.order_id) ?? { primera: "", sesiones: new Set<string>(), pdf: 0 };
      if (e.event_name === "mobile_reading_opened") {
        if (!a.primera) a.primera = e.created_at;
        if (e.session_id) a.sesiones.add(e.session_id);
      } else a.pdf += 1;
      aperturas.set(e.order_id, a);
    }

    // Personas: visitor_id (o la sesión si no hay). Fuera el tráfico propio y,
    // salvo `incluir`, quienes entraron por una cortesía.
    const personaDe = new Map(sesiones.map((s) => [s.anonymous_id, s.visitor_id ?? s.anonymous_id]));
    const excluidas = new Set<string>();
    for (const s of sesiones) if (s.es_interno) excluidas.add(personaDe.get(s.anonymous_id)!);
    if (!incluir) for (const o of ordenes) if (esCortesia(o) && o.funnel_session_id) excluidas.add(personaDe.get(o.funnel_session_id) ?? o.funnel_session_id);
    const conScroll = new Set(scrolls.map((e) => e.session_id));
    const conCheckout = new Set(checkouts.map((e) => e.session_id));

    const primeraVenta = new Map<string, string>();
    for (const o of ordenes) if (o.cliente_id && ventaReal(o) && !primeraVenta.has(o.cliente_id)) primeraVenta.set(o.cliente_id, o.id);

    function ventana(ini: number, fin: number) {
      const enRango = (iso: string) => { const t = new Date(iso).getTime(); return t >= ini && t < fin; };
      const ses = sesiones.filter((s) => enRango(s.created_at) && !excluidas.has(personaDe.get(s.anonymous_id)!));
      const personas = new Set<string>(), interes = new Set<string>(), checkout = new Set<string>(), fuente = new Map<string, string>();
      for (const s of ses) {
        const per = personaDe.get(s.anonymous_id)!;
        personas.add(per);
        if (!fuente.has(per)) fuente.set(per, s.fuente ?? "Directo");
        const hizoCheckout = !!s.checkout || conCheckout.has(s.anonymous_id);
        if (hizoCheckout) checkout.add(per);
        if (hizoCheckout || conScroll.has(s.anonymous_id)) interes.add(per);
      }
      const ventas = ordenes.filter((o) => enRango(o.created_at) && ventaReal(o));
      // Embudo: sin tráfico propio, para medir solo a visitantes de afuera.
      const pedidos = ordenes.filter((o) => enRango(o.created_at) && !esCortesia(o) && !esInterna(o)); // completaron el formulario
      const pagaronEmbudo = ventas.filter((o) => !esInterna(o)).length;
      const pagadasAll = ordenes.filter((o) => enRango(o.created_at) && cuenta(o));

      let bruto = 0, comision = 0, neto = 0, ia = 0, audio = 0, wa = 0;
      for (const o of ventas) {
        const precio = Number(o.precio_cobrado ?? 0) || 0;
        const pg = pagoDe.get(o.id);
        bruto += precio;
        comision += pg?.comision ?? 0;
        neto += pg?.neto ?? precio - (pg?.comision ?? 0);
        ia += costoDe.get(o.id)?.ia ?? 0;
        audio += costoDe.get(o.id)?.audio ?? 0;
        wa += costoDe.get(o.id)?.wa ?? 0;
      }
      // Costos fijos prorrateados a los días del período; puntuales y publicidad por fecha.
      let fijos = 0, puntuales = 0;
      for (const c of costos) {
        const desdeC = new Date(`${c.fecha_desde}T00:00:00-03:00`).getTime();
        if (c.tipo === "puntual") { if (desdeC >= ini && desdeC < fin) puntuales += aPesos(c.monto, c.moneda); continue; }
        const hastaC = c.fecha_hasta ? new Date(`${c.fecha_hasta}T00:00:00-03:00`).getTime() + DIA : Infinity;
        const dias = Math.max(0, Math.min(fin, hastaC) - Math.max(ini, desdeC)) / DIA;
        const mensual = aPesos(c.monto, c.moneda) / (c.frecuencia === "anual" ? 12 : 1);
        fijos += (mensual * dias) / DIAS_MES;
      }
      let ads = 0;
      const adsPorCampana = new Map<string, number>();
      for (const g of publicidad) {
        const t = new Date(`${g.date}T12:00:00-03:00`).getTime();
        if (t < ini || t >= fin) continue;
        const v = aPesos(g.amount, g.currency);
        ads += v;
        const k = g.utm_campaign ?? "(sin campaña)";
        adsPorCampana.set(k, (adsPorCampana.get(k) ?? 0) + v);
      }
      // Clientes nuevos: su primera venta real cae en el período.
      const nuevos = new Set(ventas.filter((o) => o.cliente_id && primeraVenta.get(o.cliente_id) === o.id).map((o) => o.cliente_id as string)).size;
      const queda = neto - ia - audio - wa;
      const cortesiasPer = ordenes.filter((o) => enRango(o.created_at) && pagada(o) && esCortesia(o));
      const costoCortesias = cortesiasPer.reduce((a, o) => a + (costoDe.get(o.id)?.ia ?? 0) + (costoDe.get(o.id)?.audio ?? 0) + (costoDe.get(o.id)?.wa ?? 0), 0);

      // Por origen (de la primera visita de cada persona; la venta, por la sesión de su orden).
      const origen = new Map<string, { personas: number; checkout: number; ventas: number; ingreso: number }>();
      const fila = (f: string) => { let r = origen.get(f); if (!r) { r = { personas: 0, checkout: 0, ventas: 0, ingreso: 0 }; origen.set(f, r); } return r; };
      for (const [per, f] of fuente) { fila(f).personas += 1; if (checkout.has(per)) fila(f).checkout += 1; }
      for (const o of ventas) {
        const s = o.funnel_session_id ? sesiones.find((x) => x.anonymous_id === o.funnel_session_id) : null;
        const r = fila(s?.fuente ?? "Directo");
        r.ventas += 1; r.ingreso += Number(o.precio_cobrado ?? 0) || 0;
      }

      // Experiencia del cliente sobre lo entregado en el período.
      const entregadas = pagadasAll.filter((o) => o.estado === "entregado" || o.estado === "entregado_simulado");
      const abrieron = entregadas.filter((o) => aperturas.get(o.id)?.primera);
      const demoras = abrieron.map((o) => new Date(aperturas.get(o.id)!.primera).getTime() - new Date(o.created_at).getTime()).filter((v) => v >= 0);
      const leyeron = abrieron.filter((o) => Array.from(aperturas.get(o.id)!.sesiones).some((s) => sesLeyoMinuto.has(s)));
      const bajaron = entregadas.filter((o) => (aperturas.get(o.id)?.pdf ?? 0) > 0);

      return {
        embudo: {
          personas: personas.size, interes: interes.size, checkout: checkout.size,
          formulario: pedidos.length, pagaron: pagaronEmbudo,
        },
        plata: {
          ventas: ventas.length, bruto, comision, neto, ia, audio, wa, queda,
          cortesias: cortesiasPer.length, costo_cortesias: costoCortesias,
          fijos, puntuales, publicidad: ads,
          // Resultado: lo que queda de las ventas menos todo lo demás (las cortesías también cuestan).
          resultado: queda - costoCortesias - fijos - puntuales - ads,
        },
        adquisicion: {
          clientes_nuevos: nuevos,
          cac: nuevos > 0 && ads > 0 ? ads / nuevos : null,
          retorno_por_peso: ads > 0 ? bruto / ads : null,
          por_campana: Array.from(adsPorCampana.entries()).map(([campana, gasto]) => ({ campana, gasto })),
        },
        origen: Array.from(origen.entries()).map(([fuente, r]) => ({ fuente, ...r })).sort((a, b) => b.ventas - a.ventas || b.personas - a.personas),
        experiencia: {
          entregadas: entregadas.length, abrieron: abrieron.length, leyeron_1min: leyeron.length, bajaron_pdf: bajaron.length,
          demora_apertura_mediana_ms: mediana(demoras),
          reclamos: pagadasAll.filter((o) => o.has_complaint).length,
        },
      };
    }

    const actual = ventana(iniActual, ahora + 1);
    // Lo que deja una venta típica: promedio de los últimos 30 días (o del período si es más largo).
    const ref = periodo >= 30 ? actual : ventana(ahora - 30 * DIA, ahora + 1);
    const margenVenta = ref.plata.ventas > 0 ? ref.plata.queda / ref.plata.ventas : null;
    const fijosMensuales = costos.filter((c) => c.tipo === "fijo" && (!c.fecha_hasta || new Date(c.fecha_hasta).getTime() >= ahora) && new Date(c.fecha_desde).getTime() <= ahora)
      .reduce((a, c) => a + aPesos(c.monto, c.moneda) / (c.frecuencia === "anual" ? 12 : 1), 0);
    const anterior = ventana(iniAnterior, iniActual);

    // Ventas por día, últimos 28 días (hora de Montevideo).
    const dia = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
    const porDia = new Map<string, number>();
    for (let i = 27; i >= 0; i--) porDia.set(dia(ahora - i * DIA), 0);
    for (const o of ordenes) {
      if (!ventaReal(o)) continue;
      const d = dia(new Date(o.created_at).getTime());
      if (porDia.has(d)) porDia.set(d, (porDia.get(d) ?? 0) + 1);
    }

    // Recompra: clientes con 2 o más ventas reales (histórico).
    const ventasPorCliente = new Map<string, number>();
    for (const o of ordenes) if (o.cliente_id && ventaReal(o)) ventasPorCliente.set(o.cliente_id, (ventasPorCliente.get(o.cliente_id) ?? 0) + 1);
    const clientes = ventasPorCliente.size;
    const recompraron = Array.from(ventasPorCliente.values()).filter((n) => n > 1).length;

    // Qué atender hoy.
    const hace30 = ahora - 30 * 60_000;
    const trabadas = ordenes.filter((o) => o.estado.startsWith("error") || (EN_CURSO.has(o.estado) && new Date(o.updated_at).getTime() < hace30))
      .map((o) => ({ id: o.id, cliente: o.nombre_snapshot, estado: o.estado }));
    const reclamosAbiertos = ordenes.filter((o) => o.has_complaint && !o.follow_up_status).map((o) => ({ id: o.id, cliente: o.nombre_snapshot }));

    return {
      ok: true as const, periodo, incluir,
      tipo_cambio: { valor: tc, estimado: !(Number.isFinite(tcCfg) && tcCfg > 0) },
      costos_unitarios: { whatsapp_usd: waPorMensaje, tts_por_1000_usd: ttsPor1000 },
      // Mes calendario (hora de Montevideo), para el avance hacia el punto de equilibrio.
      ventas_mes: ordenes.filter((o) => ventaReal(o) && dia(new Date(o.created_at).getTime()).slice(0, 7) === dia(ahora).slice(0, 7)).length,
      ultima_venta_at: [...ordenes].reverse().find((o) => ventaReal(o))?.created_at ?? null,
      fijos_mensuales: fijosMensuales,
      // Ventas por mes necesarias para cubrir los costos fijos con lo que deja cada venta.
      punto_equilibrio: margenVenta && margenVenta > 0 ? Math.ceil(fijosMensuales / margenVenta) : null,
      margen_por_venta: margenVenta,
      actual, anterior,
      ventas_por_dia: Array.from(porDia.entries()).map(([fecha, ventas]) => ({ fecha, ventas })),
      recompra: { clientes, recompraron },
      atender: { trabadas, reclamos: reclamosAbiertos },
    };
}

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

