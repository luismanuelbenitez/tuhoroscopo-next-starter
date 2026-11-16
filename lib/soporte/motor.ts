// Soporte Automatizado · motor (etapa 1, 2026-11-16).
//
//   mensaje de la clienta → contexto (sin IA) → cerebro (IA) → controles (sin IA) → caso
//
// ETAPA 1: NO SE ENVÍA NADA. Cada caso queda como borrador en
// Admin → Clientes → Soporte automatizado. Este archivo no importa ni llama a
// ninguna función de envío de WhatsApp: a propósito (regla permanente de
// Manuel: nada le escribe a una clienta sin su OK por escrito).
//
// Principio: la IA entiende y redacta; el sistema calcula, arma links, crea
// códigos (según Reglas comerciales) y controla. La IA nunca escribe montos,
// porcentajes ni links.

import Anthropic from "@anthropic-ai/sdk";
import type { Rest } from "@/lib/asistenteParte";
import { claveAnalista, costoReal, NOMBRE_CLAVE } from "@/lib/analista/informe";
import { leerRegla } from "@/lib/reglasComerciales";

export type Modo = "borrador" | "humano" | "automatico";
export interface Intencion { nombre: string; modo: Modo; descripcion: string }
export interface Politica { regla_descuento: string; ofrecer_descuento_en: string[]; max_descuento_cada_dias: number; texto_link: string }
export interface Config {
  version: number; activo: boolean; modo_prueba: boolean; telefono_prueba: string; modelo: string;
  identidad: string; reglas: string[]; frases_prohibidas: string[]; intenciones: Record<string, Intencion>;
  politica: Politica; confianza_minima: number; max_mensajes_ia: number; largo_maximo: number;
  nota: string; creado_por: string; created_at: string;
}
export const ACCIONES = ["ninguna", "link_checkout", "descuento", "reenviar_lectura", "humano"] as const;
export type Accion = (typeof ACCIONES)[number];
const TEMAS = ["amor", "decisiones", "trabajo", "general"] as const;
// Lo que el checkout manda cuando la clienta NO escribió una pregunta propia.
const PREGUNTAS_POR_DEFECTO = new Set(["Salud, Dinero y Amor", "Amor y vínculos", "Trabajo y proyectos", "Dinero y recursos", "Salud y bienestar", "Decisión personal"]);
const ESPERA_MS = 60_000;          // se espera 1 min por si la clienta manda varios mensajes seguidos
const VENTANA_MS = 24 * 3600_000;  // ventana de atención de WhatsApp

export async function leerConfig(rest: Rest): Promise<Config | null> {
  const r = await rest("soporte_config?select=*&order=version.desc&limit=1");
  if (!Array.isArray(r) || !r[0]) return null;
  return { ...r[0], confianza_minima: Number(r[0].confianza_minima) } as Config;
}

const soloDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");
const esRespuestaNuestra = (m: { direccion: string; origen: string | null }) => m.direccion === "outbound" && m.origen !== "automatico";
const primerNombre = (t: string | null | undefined) => (t ?? "").trim().split(/\s+/)[0] ?? "";

// ── Contexto (sin IA) ────────────────────────────────────────────────────────
interface Mensaje { id: string; direccion: string; tipo: string; texto: string | null; origen: string | null; created_at: string; timestamp_whatsapp: string | null }
export interface Contexto {
  nombre: string; telefono: string; cliente_id: string | null; orden_id: string | null;
  tema_ultima: string | null; nacimiento: string | null;
  ordenes: { fecha: string; estado: string; tema: string | null; pregunta: string | null; pregunta_propia: boolean; origen: string | null }[];
  lectura: { tema: string | null; pregunta_propia: boolean; pregunta: string | null; resumen: string | null; mensaje_final: string | null; cartas: { posicion: string | null; carta: string | null; invertida: boolean; interpretacion: string | null; consejo: string | null }[] } | null;
  conversacion: { quien: "clienta" | "nosotros"; tipo: string; texto: string; hace_min: number; automatico: boolean }[];
  ultimos_mensajes_clienta: string;
  ventana_horas_restantes: number;
  descuento_reciente: string | null;
  respuestas_ia_24h: number;
}

async function armarContexto(rest: Rest, conv: Record<string, string | null>, mensajes: Mensaje[], ultimo: Mensaje): Promise<Contexto> {
  const ahora = Date.now();
  const clienteId = conv.cliente_id;
  const cliente = clienteId ? ((await rest(`tarot_clientes?id=eq.${clienteId}&select=nombre_completo,fecha_nacimiento`)) as Record<string, string>[])?.[0] : null;
  const ordenes = clienteId
    ? ((await rest(`tarot_ordenes?cliente_id=eq.${clienteId}&tipo_orden=eq.venta&select=id,estado,tema,pregunta_usuario,created_at,utm_source,nombre_snapshot,fecha_nacimiento_snapshot&order=created_at.desc&limit=5`)) as Record<string, string>[])
    : [];
  const entregada = (ordenes ?? []).find((o) => o.estado === "entregado") ?? null;

  let lectura: Contexto["lectura"] = null;
  if (entregada) {
    const l = ((await rest(`tarot_lecturas?orden_id=eq.${entregada.id}&estado=eq.completada&select=id,resumen_lectura,mensaje_final&order=created_at.desc&limit=1`)) as Record<string, string>[])?.[0];
    if (l) {
      const cartas = ((await rest(`tarot_lecturas_cartas?lectura_id=eq.${l.id}&select=numero_posicion,invertida,interpretacion,consejo,carta:tarot_cartas(nombre_es),posicion:tarot_posiciones_tirada(nombre)&order=numero_posicion`)) as Record<string, unknown>[]) ?? [];
      lectura = {
        tema: entregada.tema, pregunta: entregada.pregunta_usuario, pregunta_propia: !!entregada.pregunta_usuario && !PREGUNTAS_POR_DEFECTO.has(entregada.pregunta_usuario),
        resumen: l.resumen_lectura, mensaje_final: l.mensaje_final,
        cartas: cartas.map((c) => ({
          posicion: (c.posicion as { nombre?: string } | null)?.nombre ?? null, carta: (c.carta as { nombre_es?: string } | null)?.nombre_es ?? null,
          invertida: !!c.invertida, interpretacion: (c.interpretacion as string) ?? null, consejo: (c.consejo as string) ?? null,
        })),
      };
    }
  }

  // ¿Ya tuvo un descuento de segunda lectura hace poco? (la política lo limita)
  const tel = soloDigitos(conv.telefono_normalizado);
  const desde = new Date(ahora - 30 * 24 * 3600_000).toISOString();
  const codigos = tel ? ((await rest(`tarot_codigos_descuento?campania=eq.segunda_lectura&metadata->>telefono=eq.${tel}&created_at=gte.${desde}&select=codigo,created_at&order=created_at.desc&limit=1`)) as { codigo: string; created_at: string }[]) : [];

  // Tanda de la clienta: sus mensajes desde nuestra última respuesta de una
  // persona (la automática "recibimos tu mensaje" no cuenta como respuesta).
  const idxUltNuestro = mensajes.map((m) => esRespuestaNuestra(m)).lastIndexOf(true);
  const tanda = mensajes.slice(idxUltNuestro + 1).filter((m) => m.direccion === "inbound");
  const textoDe = (m: Mensaje) => (m.tipo === "text" ? (m.texto ?? "") : `[${m.tipo}${m.texto ? `: ${m.texto}` : ""}]`);
  const desdeVentana = new Date(ultimo.timestamp_whatsapp ?? ultimo.created_at).getTime();

  return {
    nombre: primerNombre(cliente?.nombre_completo ?? entregada?.nombre_snapshot ?? conv.wa_contact_name),
    telefono: tel, cliente_id: clienteId, orden_id: entregada?.id ?? conv.orden_id ?? null,
    tema_ultima: entregada?.tema ?? null, nacimiento: cliente?.fecha_nacimiento ?? entregada?.fecha_nacimiento_snapshot ?? null,
    ordenes: (ordenes ?? []).map((o) => ({
      fecha: o.created_at, estado: o.estado, tema: o.tema, pregunta: o.pregunta_usuario,
      pregunta_propia: !!o.pregunta_usuario && !PREGUNTAS_POR_DEFECTO.has(o.pregunta_usuario), origen: o.utm_source,
    })),
    lectura,
    conversacion: mensajes.slice(-20).map((m) => ({
      quien: m.direccion === "inbound" ? "clienta" : "nosotros", tipo: m.tipo, texto: textoDe(m).slice(0, 1500),
      hace_min: Math.round((ahora - new Date(m.created_at).getTime()) / 60_000), automatico: m.origen === "automatico",
    })),
    ultimos_mensajes_clienta: (tanda.length ? tanda : [ultimo]).map(textoDe).join("\n"),
    ventana_horas_restantes: Math.max(0, Math.round(((desdeVentana + VENTANA_MS - ahora) / 3600_000) * 10) / 10),
    descuento_reciente: codigos?.[0]?.codigo ?? null,
    respuestas_ia_24h: 0,
  };
}

// ── Cerebro (IA) ─────────────────────────────────────────────────────────────
interface Salida {
  intencion: string; confianza: number; riesgo: "bajo" | "medio" | "alto"; resumen: string; razon: string;
  accion: Accion; tema_sugerido: (typeof TEMAS)[number]; pregunta_sugerida: string; respuesta: string;
}

function esquema(intenciones: string[]) {
  return {
    type: "object", additionalProperties: false,
    required: ["intencion", "confianza", "riesgo", "resumen", "razon", "accion", "tema_sugerido", "pregunta_sugerida", "respuesta"],
    properties: {
      intencion: { type: "string", enum: intenciones },
      confianza: { type: "number", description: "De 0 a 1: qué tan segura estás de haber entendido bien y de que la respuesta es adecuada." },
      riesgo: { type: "string", enum: ["bajo", "medio", "alto"] },
      resumen: { type: "string", description: "Una frase: qué quiere la clienta." },
      razon: { type: "string", description: "1 o 2 frases para el equipo: por qué respondés así y qué carta usaste." },
      accion: { type: "string", enum: [...ACCIONES] },
      tema_sugerido: { type: "string", enum: [...TEMAS], description: "Tema para una lectura nueva, si se ofrece." },
      pregunta_sugerida: { type: "string", description: "Si se ofrece una lectura nueva: la pregunta de ejemplo para \"Escribir mi pregunta\". Vacío si no aplica." },
      respuesta: { type: "string", description: "El mensaje para la clienta, sin links, montos ni porcentajes." },
    },
  };
}

async function ejemplos(rest: Rest) {
  return ((await rest("soporte_ejemplos?activo=eq.true&select=intencion,situacion,mensaje_cliente,respuesta&order=created_at.desc&limit=8")) as Record<string, string>[]) ?? [];
}

function sistema(c: Config, ej: Record<string, string>[], descuentoActivo: boolean) {
  const intenciones = Object.entries(c.intenciones).map(([k, v]) => `- ${k}: ${v.nombre}. ${v.descripcion}`).join("\n");
  const ejemplosTxt = ej.map((e, i) => `Ejemplo ${i + 1} (${e.intencion})\nSituación: ${e.situacion}\nClienta: ${e.mensaje_cliente}\nRespuesta aprobada: ${e.respuesta.replace(/\{NOMBRE\}/g, "[nombre]")}`).join("\n\n");
  return `${c.identidad}

REGLAS QUE NUNCA SE ROMPEN
${c.reglas.map((r) => `- ${r}`).join("\n")}
- Nunca uses estas frases: ${c.frases_prohibidas.map((f) => `"${f}"`).join(", ")}.

INTENCIONES POSIBLES
${intenciones}

ACCIONES (elegí una; el sistema la ejecuta)
- ninguna: solo tu respuesta.
- link_checkout: la clienta quiere otra lectura o le conviene una. El sistema agrega al final un párrafo con el link de una lectura nueva con sus datos cargados. Vos NO escribas el link; podés decirle que toque "Escribir mi pregunta" y darle un ejemplo.
- descuento: igual que link_checkout, pero el sistema decide si además corresponde un precio especial${descuentoActivo ? "" : " (hoy no está disponible: usá link_checkout)"}. Nunca menciones el descuento ni su monto: lo agrega el sistema.
- reenviar_lectura: no puede abrir o no le llegó su lectura; el equipo se la reenvía. Decile que ya la estamos revisando.
- humano: reclamo, reembolso, angustia, crisis, enojo, salud, temas legales, o no estás segura. Tu respuesta: un mensaje breve y cálido diciendo que alguien del equipo le responde enseguida.

CÓMO USAR EL CONTEXTO
- "lectura" es SU lectura real: usá sus cartas por su nombre. Si "pregunta_propia" es false, la clienta no escribió una pregunta: su lectura es sobre su momento general en ese tema.
- "ultimos_mensajes_clienta" es lo que tenés que responder; "conversacion" es el hilo (los mensajes automáticos no los escribió una persona).
- Si no hay lectura (todavía no compró), respondé igual con calidez y, si quiere una lectura, usá link_checkout.

${ejemplosTxt ? `EJEMPLOS APROBADOS POR EL EQUIPO (imitá el tono, no copies)\n${ejemplosTxt}` : ""}`.trim();
}

async function pensar(c: Config, ctx: Contexto, ej: Record<string, string>[], descuentoActivo: boolean) {
  const apiKey = claveAnalista();
  if (!apiKey) throw new Error(`Falta ${NOMBRE_CLAVE} en las variables de entorno.`);
  const client = new Anthropic({ apiKey });
  const { telefono: _t, cliente_id: _c, orden_id: _o, nacimiento: _n, ...paraIa } = ctx; // datos que la IA no necesita
  const msg = await client.messages.create({
    model: c.modelo,
    max_tokens: 4000,
    system: sistema(c, ej, descuentoActivo),
    output_config: { effort: "medium", format: { type: "json_schema", schema: esquema(Object.keys(c.intenciones)) as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: `Contexto (JSON):\n${JSON.stringify(paraIa)}\n\nRespondé a: ${ctx.ultimos_mensajes_clienta}` }],
  });
  if (msg.stop_reason === "refusal") throw new Error("El modelo no quiso responder (refusal).");
  if (msg.stop_reason === "max_tokens") throw new Error("La respuesta del modelo se cortó por largo.");
  const texto = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const entrada = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
  return { salida: JSON.parse(texto) as Salida, entrada, salidaTokens: msg.usage.output_tokens, costo: costoReal(c.modelo, entrada, msg.usage.output_tokens) };
}

// ── Controles (sin IA) ───────────────────────────────────────────────────────
export interface Control { tipo: "falla" | "ajuste" | "aviso"; texto: string }

export function controlar(c: Config, ctx: Contexto, s: Salida, descuentoActivo: boolean) {
  const controles: Control[] = [];
  const r = s.respuesta ?? "";
  const bajo = r.toLowerCase();
  for (const f of c.frases_prohibidas) if (f && bajo.includes(f.toLowerCase())) controles.push({ tipo: "falla", texto: `Frase prohibida: "${f}".` });
  if (r.length > c.largo_maximo) controles.push({ tipo: "falla", texto: `Muy larga: ${r.length} caracteres (máximo ${c.largo_maximo}).` });
  if (/\d+\s*%/.test(r)) controles.push({ tipo: "falla", texto: "Menciona un porcentaje." });
  if (/\$\s*\d|\d+\s*pesos/i.test(r)) controles.push({ tipo: "falla", texto: "Menciona un monto." });
  if (/https?:\/\/|www\.|tuoraculo\.uy/i.test(r)) controles.push({ tipo: "falla", texto: "Escribe un link (los links los agrega el sistema)." });
  if (!r.trim()) controles.push({ tipo: "falla", texto: "Respuesta vacía." });

  let accion = s.accion;
  if (accion === "descuento") {
    const motivo = !descuentoActivo ? "la regla de segunda lectura está apagada"
      : !c.politica.ofrecer_descuento_en.includes(s.intencion) ? `la política no lo ofrece para "${s.intencion}"`
      : ctx.descuento_reciente ? `ya tuvo un código hace menos de ${c.politica.max_descuento_cada_dias} días (${ctx.descuento_reciente})`
      : !ctx.ordenes.some((o) => o.estado === "entregado") ? "todavía no compró ninguna lectura"
      : null;
    if (motivo) { accion = "link_checkout"; controles.push({ tipo: "ajuste", texto: `Sin descuento: ${motivo}. Se ofrece el link a precio normal.` }); }
  }
  if (ctx.ventana_horas_restantes <= 0) controles.push({ tipo: "falla", texto: "La ventana de 24 h está cerrada: solo se le puede escribir con una plantilla." });
  else if (ctx.ventana_horas_restantes < 3) controles.push({ tipo: "aviso", texto: `Quedan ${ctx.ventana_horas_restantes} h de ventana para responder.` });

  const modo = c.intenciones[s.intencion]?.modo ?? "borrador";
  const aHumano = accion === "humano" || modo === "humano" || s.riesgo === "alto" || s.confianza < c.confianza_minima || controles.some((x) => x.tipo === "falla");
  if (s.confianza < c.confianza_minima) controles.push({ tipo: "aviso", texto: `Confianza baja (${Math.round(s.confianza * 100)} %).` });
  return { controles, accion, estado: aHumano ? ("humano" as const) : ("pendiente" as const) };
}

// ── Procesar ─────────────────────────────────────────────────────────────────
type Resultado = { conversacion_id: string; resultado: string; caso_id?: string };

/** Revisa las conversaciones donde la clienta espera respuesta y arma los borradores. */
export async function procesarPendientes(rest: Rest, o: { max?: number; origen?: "cron" | "manual" } = {}) {
  const c = await leerConfig(rest);
  if (!c) return { ok: false as const, motivo: "sin_config" };
  if (!c.activo) return { ok: true as const, apagado: true, resultados: [] as Resultado[] };
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  const hasta = new Date(Date.now() - (o.origen === "manual" ? 0 : ESPERA_MS)).toISOString();
  // Cualquier dirección: si lo último es la respuesta automática, la clienta sigue esperando.
  const convs = ((await rest(`tarot_whatsapp_conversaciones?ultimo_mensaje_at=gte.${desde}&ultimo_mensaje_at=lte.${hasta}&select=id,telefono_normalizado&order=ultimo_mensaje_at.asc&limit=40`)) as { id: string; telefono_normalizado: string }[]) ?? [];
  const resultados: Resultado[] = [];
  for (const cv of convs) {
    if (resultados.filter((r) => r.resultado === "caso").length >= (o.max ?? 5)) break;
    if (c.modo_prueba && soloDigitos(cv.telefono_normalizado) !== soloDigitos(c.telefono_prueba)) continue;
    resultados.push(await procesarConversacion(rest, cv.id, o.origen ?? "cron", c));
  }
  return { ok: true as const, apagado: false, resultados };
}

export async function procesarConversacion(rest: Rest, conversacionId: string, origen: "cron" | "manual", cfg?: Config): Promise<Resultado> {
  const c = cfg ?? (await leerConfig(rest));
  if (!c) return { conversacion_id: conversacionId, resultado: "sin_config" };
  const conv = ((await rest(`tarot_whatsapp_conversaciones?id=eq.${conversacionId}&select=id,telefono_normalizado,cliente_id,orden_id,wa_contact_name`)) as Record<string, string | null>[])?.[0];
  if (!conv) return { conversacion_id: conversacionId, resultado: "no_existe" };
  const mensajes = (((await rest(`tarot_whatsapp_mensajes?conversacion_id=eq.${conversacionId}&tipo=neq.reaction&select=id,direccion,tipo,texto,origen,created_at,timestamp_whatsapp&order=created_at.desc&limit=30`)) as Mensaje[]) ?? []).reverse();
  // El último mensaje que cuenta: se ignora la respuesta automática.
  const reales = mensajes.filter((m) => !(m.direccion === "outbound" && m.origen === "automatico"));
  const ultimo = reales[reales.length - 1];
  if (!ultimo || ultimo.direccion !== "inbound") return { conversacion_id: conversacionId, resultado: "ya_respondida" };
  if (origen === "cron" && Date.now() - new Date(ultimo.created_at).getTime() < ESPERA_MS) return { conversacion_id: conversacionId, resultado: "esperando_mas_mensajes" };
  const ya = (await rest(`soporte_casos?mensaje_id=eq.${ultimo.id}&select=id`)) as unknown[];
  if (ya?.length) return { conversacion_id: conversacionId, resultado: "ya_tiene_caso" };

  const t0 = Date.now();
  const base = { conversacion_id: conversacionId, mensaje_id: ultimo.id, telefono: soloDigitos(conv.telefono_normalizado), config_version: c.version, modelo: c.modelo, origen };
  const insertar = async (fila: Record<string, unknown>) => {
    const r = (await rest("soporte_casos", { method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify({ ...base, ...fila }) })) as { id: string }[];
    return r?.[0]?.id;
  };

  let ctx: Contexto;
  try {
    ctx = await armarContexto(rest, conv, mensajes, ultimo);
    const desde = new Date(Date.now() - VENTANA_MS).toISOString();
    const previos = ((await rest(`soporte_casos?conversacion_id=eq.${conversacionId}&created_at=gte.${desde}&select=id`)) as unknown[]) ?? [];
    ctx.respuestas_ia_24h = previos.length;
  } catch (e) {
    const id = await insertar({ estado: "error", error: `Contexto: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) });
    return { conversacion_id: conversacionId, resultado: "error", caso_id: id };
  }
  const datosCaso = { cliente_id: ctx.cliente_id, orden_id: ctx.orden_id, nombre: ctx.nombre || null };
  const resumenCtx = { ultimos_mensajes_clienta: ctx.ultimos_mensajes_clienta, tiene_lectura: !!ctx.lectura, tema: ctx.tema_ultima, pregunta_propia: ctx.lectura?.pregunta_propia ?? null, ventana_horas_restantes: ctx.ventana_horas_restantes, descuento_reciente: ctx.descuento_reciente, nacimiento: ctx.nacimiento, ordenes: ctx.ordenes.length };

  // Conversación larga: la IA ya respondió varias veces en 24 h → pasa a Manuel sin gastar.
  if (ctx.respuestas_ia_24h >= c.max_mensajes_ia) {
    const id = await insertar({ ...datosCaso, estado: "humano", accion: "humano", contexto: resumenCtx, resumen: "Conversación larga", controles: [{ tipo: "aviso", texto: `Ya hubo ${ctx.respuestas_ia_24h} casos en 24 h: la toma una persona.` }] });
    return { conversacion_id: conversacionId, resultado: "caso", caso_id: id };
  }

  try {
    const regla = await leerRegla(rest, c.politica.regla_descuento).catch(() => null);
    const descuentoActivo = !!regla?.activa;
    const ej = await ejemplos(rest);
    const p = await pensar(c, ctx, ej, descuentoActivo);
    const k = controlar(c, ctx, p.salida, descuentoActivo);
    const id = await insertar({
      ...datosCaso, estado: k.estado, intencion: p.salida.intencion, confianza: Math.max(0, Math.min(1, Number(p.salida.confianza) || 0)),
      riesgo: p.salida.riesgo, resumen: p.salida.resumen, razon: p.salida.razon, accion: k.accion,
      pregunta_sugerida: p.salida.pregunta_sugerida || null, respuesta_ia: p.salida.respuesta, controles: k.controles,
      contexto: { ...resumenCtx, tema_sugerido: p.salida.tema_sugerido },
      tokens_entrada: p.entrada, tokens_salida: p.salidaTokens, costo_usd: Math.round(p.costo * 100000) / 100000, duracion_ms: Date.now() - t0,
    });
    return { conversacion_id: conversacionId, resultado: "caso", caso_id: id };
  } catch (e) {
    const m = e instanceof Anthropic.APIError ? `API de Anthropic ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    const id = await insertar({ ...datosCaso, estado: "error", error: m.slice(0, 500), contexto: resumenCtx, duracion_ms: Date.now() - t0 });
    return { conversacion_id: conversacionId, resultado: "error", caso_id: id };
  }
}

/** Prueba sin guardar nada: arma el contexto con el hilo hasta `hastaMensajeId` y devuelve lo que propondría el cerebro. */
export async function simularCaso(rest: Rest, conversacionId: string, hastaMensajeId: string) {
  const c = await leerConfig(rest);
  if (!c) return { ok: false as const, motivo: "sin_config" };
  const conv = ((await rest(`tarot_whatsapp_conversaciones?id=eq.${conversacionId}&select=id,telefono_normalizado,cliente_id,orden_id,wa_contact_name`)) as Record<string, string | null>[])?.[0];
  if (!conv) return { ok: false as const, motivo: "no_existe" };
  const todos = (((await rest(`tarot_whatsapp_mensajes?conversacion_id=eq.${conversacionId}&tipo=neq.reaction&select=id,direccion,tipo,texto,origen,created_at,timestamp_whatsapp&order=created_at.desc&limit=60`)) as Mensaje[]) ?? []).reverse();
  const hasta = todos.findIndex((m) => m.id === hastaMensajeId);
  if (hasta < 0) return { ok: false as const, motivo: "mensaje_no_encontrado" };
  const mensajes = todos.slice(0, hasta + 1);
  const ctx = await armarContexto(rest, conv, mensajes, mensajes[mensajes.length - 1]);
  const regla = await leerRegla(rest, c.politica.regla_descuento).catch(() => null);
  const p = await pensar(c, ctx, await ejemplos(rest), !!regla?.activa);
  return { ok: true as const, contexto: ctx, salida: p.salida, control: controlar(c, ctx, p.salida, !!regla?.activa), tokens: { entrada: p.entrada, salida: p.salidaTokens }, costo_usd: p.costo };
}
