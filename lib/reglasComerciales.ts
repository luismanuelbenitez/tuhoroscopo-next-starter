// Reglas comerciales (2026-11-16, pedido de Manuel).
//
// Cada beneficio que se le ofrece a una clienta es una regla documentada y
// configurable (tarot_reglas_comerciales). El cupón de tarot_codigos_descuento
// es solo su ejecución: se vincula por `campania`. Así el admin muestra, por
// regla, qué se decidió, quién y cuándo (historial) y qué trajo (usos, ventas).
//
// Principios (Manuel):
//   - Los nombres de los códigos no llevan número ni porcentaje (VIP, CAMILAVIP).
//   - La pantalla de la clienta no muestra el porcentaje: "precio especial".
//   - Segunda lectura = gesto puntual; nunca "por ser clienta".
//   - La IA (futuro Soporte Automatizado) nunca decide montos: los lee de acá.

import type { Rest } from "@/lib/asistenteParte";

export type TipoRegla = "codigo_fijo" | "codigo_personal";
export interface Regla {
  clave: string; nombre: string; descripcion: string; tipo: TipoRegla; activa: boolean;
  porcentaje: number; codigo: string | null; formato_codigo: string | null;
  vigencia_horas: number | null; vence_el: string | null; max_usos_por_cliente: number;
  campania: string; textos: Record<string, string>;
  decidido_por: string; decidido_at: string; updated_at: string; actualizado_por: string | null;
}
export interface CambioHistorial { id: string; clave: string; fecha: string; por: string; nota: string; cambios: Record<string, unknown> }
export interface CodigoDeRegla {
  codigo: string; activo: boolean; tipo_descuento: string; valor_descuento: number | null;
  fecha_fin: string | null; created_at: string; usos: number; ventas: number; ingresos: number;
}

const COLS = "clave,nombre,descripcion,tipo,activa,porcentaje,codigo,formato_codigo,vigencia_horas,vence_el,max_usos_por_cliente,campania,textos,decidido_por,decidido_at,updated_at,actualizado_por";
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const aRegla = (r: Record<string, unknown>): Regla => ({ ...(r as unknown as Regla), porcentaje: Number(r.porcentaje), vigencia_horas: num(r.vigencia_horas), textos: (r.textos as Record<string, string>) ?? {} });

/** Código limpio: solo A–Z y 0–9, en mayúsculas ("Camila Díaz" → "CAMILADIAZ"). */
export const limpiarCodigo = (t: string) => t.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

export async function leerRegla(rest: Rest, clave: string): Promise<Regla | null> {
  const r = await rest(`tarot_reglas_comerciales?clave=eq.${encodeURIComponent(clave)}&select=${COLS}`);
  return Array.isArray(r) && r[0] ? aRegla(r[0]) : null;
}

/** Todas las reglas con su historial y la evidencia de sus códigos (usos aplicados = ventas). */
export async function leerReglas(rest: Rest) {
  const [reglas, historial] = await Promise.all([
    rest(`tarot_reglas_comerciales?select=${COLS}&order=clave`) as Promise<Record<string, unknown>[]>,
    rest("tarot_reglas_comerciales_historial?select=id,clave,fecha,por,nota,cambios&order=fecha.desc&limit=500") as Promise<CambioHistorial[]>,
  ]);
  const campanias = [...new Set((reglas ?? []).map((r) => String(r.campania)))];
  const codigos = campanias.length
    ? ((await rest(`tarot_codigos_descuento?campania=in.(${campanias.map((c) => `"${c}"`).join(",")})&select=id,codigo,activo,tipo_descuento,valor_descuento,fecha_fin,created_at,campania&order=created_at.desc`)) as Record<string, unknown>[])
    : [];
  const ids = codigos.map((c) => String(c.id));
  const usos = ids.length
    ? ((await rest(`tarot_codigos_descuento_usos?codigo_id=in.(${ids.join(",")})&estado_uso=eq.aplicado&select=codigo_id,precio_aplicado`)) as { codigo_id: string; precio_aplicado: number | null }[])
    : [];
  const porCodigo = new Map<string, { usos: number; ingresos: number }>();
  for (const u of usos ?? []) {
    const a = porCodigo.get(u.codigo_id) ?? { usos: 0, ingresos: 0 };
    a.usos += 1; a.ingresos += Number(u.precio_aplicado ?? 0);
    porCodigo.set(u.codigo_id, a);
  }
  return (reglas ?? []).map((r0) => {
    const r = aRegla(r0);
    const suyos: CodigoDeRegla[] = codigos.filter((c) => c.campania === r.campania).map((c) => {
      const e = porCodigo.get(String(c.id)) ?? { usos: 0, ingresos: 0 };
      return {
        codigo: String(c.codigo), activo: !!c.activo, tipo_descuento: String(c.tipo_descuento), valor_descuento: num(c.valor_descuento),
        fecha_fin: (c.fecha_fin as string) ?? null, created_at: String(c.created_at), usos: e.usos, ventas: e.usos, ingresos: e.ingresos,
      };
    });
    return {
      regla: r,
      historial: (historial ?? []).filter((h) => h.clave === r.clave),
      codigos: suyos,
      totales: { codigos: suyos.length, ventas: suyos.reduce((s, c) => s + c.ventas, 0), ingresos: suyos.reduce((s, c) => s + c.ingresos, 0) },
    };
  });
}

export interface CambiosRegla {
  activa?: boolean; porcentaje?: number; codigo?: string; formato_codigo?: string;
  vigencia_horas?: number | null; vence_el?: string | null; max_usos_por_cliente?: number; textos?: Record<string, string>;
}

/** Valida y aplica cambios a una regla. Cada cambio exige una nota (el porqué) y queda en el historial. */
export async function guardarRegla(rest: Rest, clave: string, c: CambiosRegla, nota: string, por: string) {
  const actual = await leerRegla(rest, clave);
  if (!actual) return { ok: false as const, motivo: "regla_inexistente" };
  if (!nota.trim()) return { ok: false as const, motivo: "falta_nota", detalle: "Escribí por qué cambia (queda en el historial)." };

  const nuevo: Partial<Regla> = {};
  if (c.activa !== undefined) nuevo.activa = !!c.activa;
  if (c.porcentaje !== undefined) {
    const p = Number(c.porcentaje);
    if (!(p > 0 && p <= 50)) return { ok: false as const, motivo: "porcentaje_invalido", detalle: "Entre 1 y 50 %." };
    nuevo.porcentaje = Math.round(p * 100) / 100;
  }
  if (c.codigo !== undefined && actual.tipo === "codigo_fijo") {
    const k = limpiarCodigo(c.codigo);
    if (k.length < 3 || k.length > 20) return { ok: false as const, motivo: "codigo_invalido", detalle: "De 3 a 20 letras o números." };
    if (/\d/.test(k)) return { ok: false as const, motivo: "codigo_con_numero", detalle: "Sin números: un número en el código invita a pensar que hay más descuento." };
    nuevo.codigo = k;
  }
  if (c.formato_codigo !== undefined && actual.tipo === "codigo_personal") {
    const f = c.formato_codigo.toUpperCase().replace(/\s/g, "");
    if (!f.includes("{NOMBRE}") || /[^A-Z{}]/.test(f.replace("{NOMBRE}", ""))) return { ok: false as const, motivo: "formato_invalido", detalle: "Tiene que incluir {NOMBRE} y solo letras (ej. {NOMBRE}VIP)." };
    nuevo.formato_codigo = f;
  }
  if (c.vigencia_horas !== undefined) {
    const h = c.vigencia_horas === null ? null : Math.round(Number(c.vigencia_horas));
    if (h !== null && !(h >= 1 && h <= 24 * 90)) return { ok: false as const, motivo: "vigencia_invalida" };
    nuevo.vigencia_horas = h;
  }
  if (c.vence_el !== undefined) nuevo.vence_el = c.vence_el || null;
  if (c.max_usos_por_cliente !== undefined) {
    const m = Math.round(Number(c.max_usos_por_cliente));
    if (!(m >= 1 && m <= 10)) return { ok: false as const, motivo: "usos_invalidos" };
    nuevo.max_usos_por_cliente = m;
  }
  if (c.textos !== undefined) {
    const t: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.textos)) t[k] = String(v ?? "").slice(0, 600);
    const conCifra = Object.values(t).some((v) => /\d+\s*%/.test(v));
    if (conCifra) return { ok: false as const, motivo: "texto_con_porcentaje", detalle: "Los textos para la clienta no muestran el porcentaje." };
    nuevo.textos = t;
  }

  const diff: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(nuevo)) {
    const antes = (actual as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(antes) !== JSON.stringify(v)) diff[k] = [antes, v];
  }
  if (!Object.keys(diff).length) return { ok: true as const, sin_cambios: true };

  await rest(`tarot_reglas_comerciales?clave=eq.${encodeURIComponent(clave)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...nuevo, updated_at: new Date().toISOString(), actualizado_por: por, decidido_por: por, decidido_at: new Date().toISOString() }),
  });
  await rest("tarot_reglas_comerciales_historial", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ clave, por, nota: nota.trim().slice(0, 1000), cambios: diff }) });

  // La regla manda sobre su cupón compartido: se sincroniza.
  const final = { ...actual, ...nuevo } as Regla;
  if (final.tipo === "codigo_fijo" && final.codigo) await sincronizarCodigoFijo(rest, actual, final);
  return { ok: true as const, cambios: diff };
}

async function sincronizarCodigoFijo(rest: Rest, antes: Regla, ahora: Regla) {
  const datos = {
    tipo_descuento: "porcentaje", valor_descuento: ahora.porcentaje, activo: ahora.activa,
    fecha_fin: ahora.vence_el, max_usos_por_cliente: ahora.max_usos_por_cliente, campania: ahora.campania,
    updated_at: new Date().toISOString(), actualizado_por: "regla_comercial",
  };
  const existe = (await rest(`tarot_codigos_descuento?codigo=eq.${encodeURIComponent(ahora.codigo!)}&select=id,campania`)) as { id: string; campania: string | null }[];
  if (existe?.[0]) {
    if (existe[0].campania && existe[0].campania !== ahora.campania) throw new Error(`El código ${ahora.codigo} ya existe en otra campaña.`);
    await rest(`tarot_codigos_descuento?id=eq.${existe[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(datos) });
  } else {
    await rest("tarot_codigos_descuento", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...datos, codigo: ahora.codigo, descripcion: `Regla comercial: ${ahora.nombre}`, monedas_aplicables: ["UYU", "ARS"], fecha_inicio: new Date().toISOString(), canal: "web", creado_por: "regla_comercial", metadata: { regla: ahora.clave } }),
    });
  }
  // Cambió el nombre del código: el anterior se desactiva (queda su evidencia).
  if (antes.codigo && antes.codigo !== ahora.codigo) {
    await rest(`tarot_codigos_descuento?codigo=eq.${encodeURIComponent(antes.codigo)}&campania=eq.${encodeURIComponent(ahora.campania)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ activo: false, updated_at: new Date().toISOString(), actualizado_por: "regla_comercial" }),
    });
  }
}

const TEMAS = new Set(["amor", "decisiones", "trabajo", "general"]);
const fechaCorta = (d: Date) => d.toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "numeric", timeZone: "America/Montevideo" });

/** Crea el código personal de una regla (ej. CAMILAVIP) y arma el link y el mensaje para mandarle. */
export async function crearCodigoPersonal(rest: Rest, clave: string, d: { nombre: string; tema?: string; nacimiento?: string; metadata?: Record<string, unknown> }, por: string) {
  const r = await leerRegla(rest, clave);
  if (!r || r.tipo !== "codigo_personal" || !r.formato_codigo) return { ok: false as const, motivo: "regla_invalida" };
  if (!r.activa) return { ok: false as const, motivo: "regla_inactiva", detalle: "La regla está desactivada." };
  const base = limpiarCodigo(d.nombre.trim().split(/\s+/)[0] ?? "").slice(0, 14);
  if (base.length < 2) return { ok: false as const, motivo: "nombre_invalido" };

  // Si ya existe (otra Camila), se agrega una letra: CAMILAVIP → CAMILABVIP. Nunca números.
  let codigo = "";
  for (const extra of ["", "B", "C", "D", "E", "F", "G", "H"]) {
    const k = r.formato_codigo.replace("{NOMBRE}", base + extra);
    const ya = (await rest(`tarot_codigos_descuento?codigo=eq.${encodeURIComponent(k)}&select=id`)) as unknown[];
    if (!ya?.length) { codigo = k; break; }
  }
  if (!codigo) return { ok: false as const, motivo: "sin_codigo_libre" };

  const vence = new Date(Date.now() + (r.vigencia_horas ?? 48) * 3600_000);
  await rest("tarot_codigos_descuento", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      codigo, descripcion: `Regla comercial: ${r.nombre} · ${d.nombre.trim().slice(0, 60)}`, tipo_descuento: "porcentaje", valor_descuento: r.porcentaje,
      monedas_aplicables: ["UYU"], fecha_inicio: new Date().toISOString(), fecha_fin: vence.toISOString(),
      max_usos_total: null, max_usos_por_cliente: r.max_usos_por_cliente, campania: r.campania, canal: "whatsapp",
      activo: true, creado_por: por, metadata: { ...(d.metadata ?? {}), regla: r.clave },
    }),
  });

  const p = new URLSearchParams();
  if (d.tema && TEMAS.has(d.tema)) p.set("tema", d.tema);
  p.set("nombre", d.nombre.trim().split(/\s+/)[0]);
  if (d.nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(d.nacimiento)) p.set("nacimiento", d.nacimiento);
  p.set("codigo", codigo);
  const link = `https://tuoraculo.uy/tarot/checkout?${p.toString()}`;
  const mensaje = (r.textos.mensaje ?? "").replace("{VENCE}", fechaCorta(vence)).replace("{LINK}", link).replace("{CODIGO}", codigo);
  return { ok: true as const, codigo, vence: vence.toISOString(), link, mensaje };
}
