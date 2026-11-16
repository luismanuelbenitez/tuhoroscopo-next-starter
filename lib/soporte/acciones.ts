// Soporte Automatizado · acciones del panel (etapa 1, 2026-11-16).
// Aprobar NO envía nada: crea el código si corresponde, arma el texto final
// (respuesta + link/beneficio que agrega el sistema) y lo deja listo para que
// Manuel lo copie en la bandeja de WhatsApp.

import type { Rest } from "@/lib/asistenteParte";
import { crearCodigoPersonal } from "@/lib/reglasComerciales";
import { leerConfig, type Config, type Intencion } from "@/lib/soporte/motor";
import { MODELOS } from "@/lib/analista/informe";

const TEMAS = new Set(["amor", "decisiones", "trabajo", "general"]);

export async function listarCasos(rest: Rest, filtro: string) {
  const f = filtro === "pendientes" ? "&estado=eq.pendiente" : filtro === "humano" ? "&estado=in.(humano,error)" : filtro === "resueltos" ? "&estado=in.(aprobado,editado,descartado)" : "";
  return ((await rest(`soporte_casos?select=*${f}&order=created_at.desc&limit=60`)) as Record<string, unknown>[]) ?? [];
}

/** Aprueba un borrador (editado o no). Si la acción lo pide, crea el código y arma el link. */
export async function aprobarCaso(rest: Rest, id: string, textoEditado: string | undefined, por: string) {
  const caso = ((await rest(`soporte_casos?id=eq.${id}&select=*`)) as Record<string, any>[])?.[0];
  if (!caso) return { ok: false as const, motivo: "no_existe" };
  if (["aprobado", "editado", "descartado"].includes(caso.estado)) return { ok: false as const, motivo: "ya_resuelto" };
  const c = await leerConfig(rest);
  if (!c) return { ok: false as const, motivo: "sin_config" };

  const base = (textoEditado ?? caso.respuesta_ia ?? "").trim();
  if (!base) return { ok: false as const, motivo: "sin_texto" };
  const editado = textoEditado !== undefined && textoEditado.trim() !== (caso.respuesta_ia ?? "").trim();
  const ctx = caso.contexto ?? {};
  const tema = TEMAS.has(ctx.tema_sugerido) ? ctx.tema_sugerido : TEMAS.has(ctx.tema) ? ctx.tema : undefined;
  const nombre = (caso.nombre ?? "").trim();

  let agregado = "";
  let codigo: string | null = null;
  let link: string | null = null;
  if (caso.accion === "descuento" && nombre) {
    const r = await crearCodigoPersonal(rest, c.politica.regla_descuento, { nombre, tema, nacimiento: ctx.nacimiento ?? undefined, metadata: { telefono: caso.telefono, cliente_id: caso.cliente_id, origen: "soporte", caso_id: id } }, por);
    if (r.ok) { codigo = r.codigo; link = r.link; agregado = r.mensaje; }
  }
  if (!link && (caso.accion === "link_checkout" || caso.accion === "descuento")) {
    const p = new URLSearchParams();
    if (tema) p.set("tema", tema);
    if (nombre) p.set("nombre", nombre);
    if (ctx.nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(ctx.nacimiento)) p.set("nacimiento", ctx.nacimiento);
    p.set("utm_source", "whatsapp"); p.set("utm_medium", "soporte");
    link = `https://tuoraculo.uy/tarot/checkout?${p.toString()}`;
    agregado = (c.politica.texto_link || "{LINK}").replace("{LINK}", link);
  }
  const final = agregado ? `${base}\n${agregado}` : base;

  await rest(`soporte_casos?id=eq.${id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado: editado ? "editado" : "aprobado", respuesta_final: final, codigo_creado: codigo, link, resuelto_por: por, resuelto_at: new Date().toISOString() }),
  });
  // Lo aprobado enseña: queda como ejemplo (con el nombre de la clienta reemplazado).
  const ult = String(ctx.ultimos_mensajes_clienta ?? "").slice(0, 600);
  const anon = (t: string) => (nombre ? t.split(nombre).join("{NOMBRE}") : t);
  await rest("soporte_ejemplos", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ caso_id: id, intencion: caso.intencion ?? "otro", situacion: String(caso.resumen ?? "").slice(0, 600), mensaje_cliente: anon(ult), respuesta: anon(base) }),
  }).catch(() => null);
  return { ok: true as const, texto: final, codigo, link, editado };
}

export async function resolverCaso(rest: Rest, id: string, estado: "descartado" | "humano", por: string) {
  await rest(`soporte_casos?id=eq.${id}&estado=in.(pendiente,humano,error)`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado, resuelto_por: por, resuelto_at: estado === "descartado" ? new Date().toISOString() : null }),
  });
  return { ok: true as const };
}

export interface CambiosConfig {
  activo?: boolean; modo_prueba?: boolean; modelo?: string; identidad?: string; reglas?: string[]; frases_prohibidas?: string[];
  intenciones?: Record<string, Intencion>; politica?: Config["politica"]; confianza_minima?: number; max_mensajes_ia?: number; largo_maximo?: number;
}

/** Cada cambio del cerebro crea una versión nueva (con nota obligatoria). */
export async function guardarConfig(rest: Rest, cambios: CambiosConfig, nota: string, por: string) {
  const actual = await leerConfig(rest);
  if (!actual) return { ok: false as const, motivo: "sin_config" };
  if (!nota.trim()) return { ok: false as const, motivo: "falta_nota", detalle: "Escribí por qué cambia: queda en el historial de versiones." };
  const n: Config = { ...actual, ...cambios } as Config;
  if (!(n.modelo in MODELOS)) return { ok: false as const, motivo: "modelo_invalido" };
  if (!n.identidad?.trim()) return { ok: false as const, motivo: "identidad_vacia" };
  n.reglas = (n.reglas ?? []).map((x) => String(x).trim()).filter(Boolean);
  n.frases_prohibidas = (n.frases_prohibidas ?? []).map((x) => String(x).trim()).filter(Boolean);
  n.confianza_minima = Math.max(0, Math.min(1, Number(n.confianza_minima)));
  n.max_mensajes_ia = Math.max(1, Math.min(30, Math.round(Number(n.max_mensajes_ia))));
  n.largo_maximo = Math.max(200, Math.min(3000, Math.round(Number(n.largo_maximo))));
  // Etapa 1: ningún modo "automático" (no se envía nada).
  for (const k of Object.keys(n.intenciones)) {
    if (!["borrador", "humano"].includes(n.intenciones[k].modo)) n.intenciones[k] = { ...n.intenciones[k], modo: "borrador" };
  }
  await rest("soporte_config", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      version: actual.version + 1, activo: n.activo, modo_prueba: n.modo_prueba, telefono_prueba: actual.telefono_prueba, modelo: n.modelo,
      identidad: n.identidad, reglas: n.reglas, frases_prohibidas: n.frases_prohibidas, intenciones: n.intenciones, politica: n.politica,
      confianza_minima: n.confianza_minima, max_mensajes_ia: n.max_mensajes_ia, largo_maximo: n.largo_maximo,
      nota: nota.trim().slice(0, 1000), creado_por: por,
    }),
  });
  return { ok: true as const, version: actual.version + 1 };
}

export async function versiones(rest: Rest) {
  return ((await rest("soporte_config?select=version,nota,creado_por,created_at,modelo,activo,modo_prueba&order=version.desc&limit=50")) as Record<string, unknown>[]) ?? [];
}

export async function listarEjemplos(rest: Rest) {
  return ((await rest("soporte_ejemplos?select=id,intencion,situacion,mensaje_cliente,respuesta,activo,created_at&order=created_at.desc&limit=50")) as Record<string, unknown>[]) ?? [];
}

export async function cambiarEjemplo(rest: Rest, id: string, activo: boolean) {
  await rest(`soporte_ejemplos?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ activo }) });
  return { ok: true as const };
}

/** Números de los últimos `dias`: casos, cómo se resolvieron, costo y ventas que salieron de soporte. */
export async function metricas(rest: Rest, dias = 30) {
  const desde = new Date(Date.now() - dias * 24 * 3600_000).toISOString();
  const casos = ((await rest(`soporte_casos?created_at=gte.${desde}&select=estado,intencion,costo_usd,tokens_entrada,tokens_salida,codigo_creado`)) as Record<string, any>[]) ?? [];
  const por = (k: string) => casos.reduce<Record<string, number>>((a, x) => { const v = String(x[k] ?? "—"); a[v] = (a[v] ?? 0) + 1; return a; }, {});
  const aprobados = casos.filter((x) => x.estado === "aprobado").length;
  const editados = casos.filter((x) => x.estado === "editado").length;
  const codigos = ((await rest(`tarot_codigos_descuento?metadata->>origen=eq.soporte&created_at=gte.${desde}&select=id`)) as { id: string }[]) ?? [];
  const usos = codigos.length
    ? ((await rest(`tarot_codigos_descuento_usos?codigo_id=in.(${codigos.map((x) => x.id).join(",")})&estado_uso=eq.aplicado&select=precio_aplicado`)) as { precio_aplicado: number | null }[]) ?? []
    : [];
  // Ventas por el link a precio normal (sin código): llegan con utm_medium=soporte.
  const ordenes = ((await rest(`tarot_ordenes?utm_medium=eq.soporte&estado=eq.entregado&created_at=gte.${desde}&select=precio_cobrado`)) as { precio_cobrado: number | null }[]) ?? [];
  return {
    dias, casos: casos.length, por_estado: por("estado"), por_intencion: por("intencion"),
    aprobados_sin_editar: aprobados, editados, tasa_sin_editar: aprobados + editados ? Math.round((aprobados / (aprobados + editados)) * 100) : null,
    costo_usd: Math.round(casos.reduce((s, x) => s + Number(x.costo_usd ?? 0), 0) * 10000) / 10000,
    tokens_entrada: casos.reduce((s, x) => s + Number(x.tokens_entrada ?? 0), 0), tokens_salida: casos.reduce((s, x) => s + Number(x.tokens_salida ?? 0), 0),
    codigos_creados: codigos.length, ventas: usos.length + ordenes.length,
    ingresos: usos.reduce((s, u) => s + Number(u.precio_aplicado ?? 0), 0) + ordenes.reduce((s, o) => s + Number(o.precio_cobrado ?? 0), 0),
  };
}
