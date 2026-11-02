// Configuración de Meta Ads en palabras (2026-11-02). Recibe el `config`
// guardado en meta_ads_objetos (tal cual lo da Meta) y devuelve líneas
// "Etiqueta: valor" legibles. Lo usan el panel y el Analista de conversión.

type C = Record<string, unknown>;
const arr = <T = C>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): C => (v && typeof v === "object" && !Array.isArray(v) ? (v as C) : {});

const OBJETIVO: Record<string, string> = {
  OUTCOME_SALES: "Ventas", OUTCOME_TRAFFIC: "Tráfico", OUTCOME_AWARENESS: "Reconocimiento", OUTCOME_ENGAGEMENT: "Interacción",
  OUTCOME_LEADS: "Clientes potenciales", OUTCOME_APP_PROMOTION: "Promoción de app",
};
const OPTIMIZACION: Record<string, string> = {
  OFFSITE_CONVERSIONS: "Conversiones en la web", LINK_CLICKS: "Clics en el enlace", LANDING_PAGE_VIEWS: "Visitas a la página de destino",
  REACH: "Alcance", IMPRESSIONS: "Impresiones", THRUPLAY: "Reproducciones completas (ThruPlay)", VALUE: "Valor de las conversiones",
  POST_ENGAGEMENT: "Interacción con la publicación", CONVERSATIONS: "Conversaciones", QUALITY_LEAD: "Clientes potenciales de calidad",
};
const PUJA: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "Volumen más alto (sin tope de costo)", COST_CAP: "Tope de costo por resultado",
  LOWEST_COST_WITH_BID_CAP: "Tope de puja", LOWEST_COST_WITH_MIN_ROAS: "ROAS mínimo",
};
const EVENTO: Record<string, string> = { PURCHASE: "Compra", INITIATED_CHECKOUT: "Inicio de pago", VIEW_CONTENT: "Ver contenido", ADD_TO_CART: "Agregar al carrito", LEAD: "Cliente potencial" };
const CTA: Record<string, string> = { LEARN_MORE: "Más información", SHOP_NOW: "Comprar", ORDER_NOW: "Pedir ahora", SIGN_UP: "Registrarte", BOOK_NOW: "Reservar", GET_OFFER: "Obtener oferta", CONTACT_US: "Contactarnos", WHATSAPP_MESSAGE: "Enviar WhatsApp" };
const GENERO: Record<number, string> = { 1: "Hombres", 2: "Mujeres" };

const PLATAFORMA: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads" };
const POSICION: Record<string, string> = {
  feed: "Feed", facebook_reels: "Reels", facebook_reels_overlay: "Anuncios sobre Reels", story: "Historias", video_feeds: "Videos",
  marketplace: "Marketplace", search: "Búsqueda", instream_video: "Video in-stream", right_hand_column: "Columna derecha", profile_feed: "Perfiles",
  stream: "Feed", reels: "Reels", story_ig: "Historias", explore: "Explorar", explore_home: "Explorar (inicio)", ig_search: "Búsqueda",
  profile_reels: "Reels del perfil", messenger_home: "Bandeja", classic: "Nativo, banner e intersticial", rewarded_video: "Video con recompensa",
};
function ubicaciones(t: C): string {
  const plataformas = arr<string>(t.publisher_platforms);
  if (!plataformas.length) return "Automáticas (Advantage+)";
  const pos = (k: string) => arr<string>(t[k]).map((p) => POSICION[p] ?? p).join(", ");
  return plataformas.map((p) => {
    const det = p === "facebook" ? pos("facebook_positions") : p === "instagram" ? pos("instagram_positions") : p === "messenger" ? pos("messenger_positions") : p === "audience_network" ? pos("audience_network_positions") : "";
    return `${PLATAFORMA[p] ?? p}${det ? ` (${det})` : " (todas)"}`;
  }).join(" · ");
}

function segmentacion(t: C): [string, string][] {
  const l: [string, string][] = [];
  const geo = obj(t.geo_locations);
  const lugares = [
    ...arr<string>(geo.countries),
    ...arr(geo.regions).map((r) => String(r.name ?? r.key)),
    ...arr(geo.cities).map((c) => `${c.name ?? c.key}${c.radius ? ` (+${c.radius} ${c.distance_unit === "kilometer" ? "km" : "mi"})` : ""}`),
  ];
  if (lugares.length) l.push(["Lugares", lugares.join(", ")]);
  if (arr<string>(geo.location_types).length) l.push(["Tipo de ubicación", arr<string>(geo.location_types).join(", ")]);
  l.push(["Edad", `${t.age_min ?? 18}–${t.age_max ?? "65+"}`]);
  const generos = arr<number>(t.genders);
  l.push(["Género", generos.length ? generos.map((g) => GENERO[g] ?? g).join(", ") : "Todos"]);
  const intereses = arr(t.flexible_spec).flatMap((f) => [...arr(f.interests), ...arr(f.behaviors), ...arr(f.life_events)].map((x) => String(x.name)));
  if (intereses.length) l.push(["Intereses / comportamientos", intereses.join(", ")]);
  const excl = obj(t.exclusions);
  const excluidos = [...arr(excl.interests), ...arr(excl.behaviors)].map((x) => String(x.name));
  if (excluidos.length) l.push(["Excluidos", excluidos.join(", ")]);
  if (arr(t.custom_audiences).length) l.push(["Públicos personalizados", arr(t.custom_audiences).map((a) => String(a.name ?? a.id)).join(", ")]);
  if (arr(t.excluded_custom_audiences).length) l.push(["Públicos excluidos", arr(t.excluded_custom_audiences).map((a) => String(a.name ?? a.id)).join(", ")]);
  if (arr<string>(t.locales).length) l.push(["Idiomas", arr<string>(t.locales).join(", ")]);
  const auto = obj(t.targeting_automation);
  if (auto.advantage_audience !== undefined) l.push(["Público Advantage+", auto.advantage_audience ? "Sí (Meta puede ampliar el público)" : "No"]);
  l.push(["Ubicaciones", ubicaciones(t)]);
  if (arr<string>(t.device_platforms).length) l.push(["Dispositivos", arr<string>(t.device_platforms).join(", ")]);
  return l;
}

export function configEnPalabras(nivel: string, config: C, moneda: string | null = "UYU"): [string, string][] {
  const dinero = (v: unknown) => {
    if (v === undefined || v === null || v === "") return null;
    return `${moneda === "USD" ? "US$" : "$"} ${(Number(v) / 100).toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;
  };
  const fecha = (v: unknown) => (typeof v === "string" ? new Date(v).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" }) : null);
  const l: [string, string][] = [];
  const add = (k: string, v: string | null | undefined) => { if (v) l.push([k, v]); };

  if (nivel === "campana") {
    add("Objetivo", OBJETIVO[String(config.objective)] ?? String(config.objective ?? ""));
    add("Presupuesto diario (campaña)", dinero(config.daily_budget));
    add("Presupuesto total (campaña)", dinero(config.lifetime_budget));
    add("Límite de gasto", dinero(config.spend_cap));
    add("Estrategia de puja", PUJA[String(config.bid_strategy)] ?? (config.bid_strategy as string));
    const esp = arr<string>(config.special_ad_categories);
    add("Categoría especial", esp.length ? esp.join(", ") : "Ninguna");
    add("Inicio", fecha(config.start_time)); add("Fin", fecha(config.stop_time));
  } else if (nivel === "conjunto") {
    const po = obj(config.promoted_object);
    add("Optimiza para", `${OPTIMIZACION[String(config.optimization_goal)] ?? config.optimization_goal}${po.custom_event_type ? ` · evento: ${EVENTO[String(po.custom_event_type)] ?? po.custom_event_type}` : ""}`);
    add("Píxel", po.pixel_id ? String(po.pixel_id) : null);
    add("Presupuesto diario", dinero(config.daily_budget));
    add("Presupuesto total", dinero(config.lifetime_budget));
    add("Estrategia de puja", PUJA[String(config.bid_strategy)] ?? (config.bid_strategy as string));
    add("Puja / tope", dinero(config.bid_amount));
    add("Se cobra por", config.billing_event === "IMPRESSIONS" ? "Impresiones" : (config.billing_event as string));
    const atrib = arr(config.attribution_spec).map((a) => `${a.event_type === "CLICK_THROUGH" ? "clic" : a.event_type === "VIEW_THROUGH" ? "visualización" : a.event_type} ${a.window_days} d`);
    add("Atribución", atrib.join(" + ") || null);
    add("Destino", config.destination_type as string);
    add("Inicio", fecha(config.start_time)); add("Fin", fecha(config.end_time));
    l.push(...segmentacion(obj(config.targeting)));
  } else {
    const cr = obj(config.creative);
    const spec = obj(cr.object_story_spec);
    const video = obj(spec.video_data);
    const link = obj(spec.link_data);
    const feed = obj(cr.asset_feed_spec);
    const textos = [cr.body, video.message, link.message, ...arr(feed.bodies).map((b) => b.text)].filter(Boolean).map(String);
    const titulos = [cr.title, video.title, link.name, ...arr(feed.titles).map((b) => b.text)].filter(Boolean).map(String);
    const cta = String(obj(video.call_to_action).type ?? obj(link.call_to_action).type ?? cr.call_to_action_type ?? arr<string>(feed.call_to_action_types)[0] ?? "");
    add("Texto principal", [...new Set(textos)].join("  ‖  "));
    add("Título", [...new Set(titulos)].join("  ‖  "));
    add("Botón", CTA[cta] ?? cta);
    const destino = String(obj(obj(video.call_to_action).value).link ?? link.link ?? cr.link_url ?? arr(feed.link_urls).map((u) => u.website_url)[0] ?? "");
    add("Destino", destino);
    add("Parámetros de URL", cr.url_tags as string);
    add("Formato", cr.object_type as string);
    add("Vista previa", config.preview_shareable_link as string);
    add("Publicación en Instagram", cr.instagram_permalink_url as string);
  }
  return l;
}
