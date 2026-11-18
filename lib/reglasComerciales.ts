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
  // Precio especial fijo en pesos (2026-11-17). Si está, manda sobre el porcentaje.
  precio_fijo_uyu: number | null;
  vigencia_horas: number | null; vence_el: string | null; max_usos_por_cliente: number;
  campania: string; textos: Record<string, string>;
  decidido_por: string; decidido_at: string; updated_at: string; actualizado_por: string | null;
  // Archivada = "eliminada" en el admin (2026-11-17): apagada y fuera de la vista principal. Nunca se borra.
  archivada_at: string | null; archivada_por: string | null;
}
export interface CambioHistorial { id: string; clave: string; fecha: string; por: string; nota: string; cambios: Record<string, unknown> }
export interface CodigoDeRegla {
  codigo: string; activo: boolean; tipo_descuento: string; valor_descuento: number | null; precio_fijo_uyu: number | null;
  fecha_fin: string | null; created_at: string; usos: number; ventas: number; ingresos: number;
}

const COLS = "clave,nombre,descripcion,tipo,activa,porcentaje,codigo,formato_codigo,precio_fijo_uyu,vigencia_horas,vence_el,max_usos_por_cliente,campania,textos,decidido_por,decidido_at,updated_at,actualizado_por,archivada_at,archivada_por";
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const aRegla = (r: Record<string, unknown>): Regla => ({ ...(r as unknown as Regla), porcentaje: Number(r.porcentaje), precio_fijo_uyu: num(r.precio_fijo_uyu), vigencia_horas: num(r.vigencia_horas), textos: (r.textos as Record<string, string>) ?? {} });

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
    ? ((await rest(`tarot_codigos_descuento?campania=in.(${campanias.map((c) => `"${c}"`).join(",")})&select=id,codigo,activo,tipo_descuento,valor_descuento,precio_fijo_uyu,fecha_fin,created_at,campania&order=created_at.desc`)) as Record<string, unknown>[])
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
        codigo: String(c.codigo), activo: !!c.activo, tipo_descuento: String(c.tipo_descuento), valor_descuento: num(c.valor_descuento), precio_fijo_uyu: num(c.precio_fijo_uyu),
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
  activa?: boolean; porcentaje?: number; codigo?: string; formato_codigo?: string; precio_fijo_uyu?: number | null;
  vigencia_horas?: number | null; vence_el?: string | null; max_usos_por_cliente?: number; textos?: Record<string, string>;
}

type Fallo = { ok: false; motivo: string; detalle?: string };
const falla = (motivo: string, detalle?: string): Fallo => ({ ok: false, motivo, detalle });

/** Valida los campos de una regla (al crearla y al editarla). Devuelve solo lo que vino, ya limpio. */
function validarCampos(c: CambiosRegla, tipo: TipoRegla): { ok: true; nuevo: Partial<Regla> } | Fallo {
  const nuevo: Partial<Regla> = {};
  if (c.activa !== undefined) nuevo.activa = !!c.activa;
  if (c.porcentaje !== undefined) {
    const p = Number(c.porcentaje);
    if (!(p > 0 && p <= 50)) return falla("porcentaje_invalido", "Entre 1 y 50 %.");
    nuevo.porcentaje = Math.round(p * 100) / 100;
  }
  if (c.codigo !== undefined && tipo === "codigo_fijo") {
    const k = limpiarCodigo(c.codigo);
    if (k.length < 3 || k.length > 20) return falla("codigo_invalido", "De 3 a 20 letras.");
    if (/\d/.test(k)) return falla("codigo_con_numero", "Sin números: un número en el código invita a pensar que hay más descuento.");
    nuevo.codigo = k;
  }
  if (c.formato_codigo !== undefined && tipo === "codigo_personal") {
    const f = c.formato_codigo.toUpperCase().replace(/\s/g, "");
    if (!f.includes("{NOMBRE}") || /[^A-Z{}]/.test(f.replace("{NOMBRE}", ""))) return falla("formato_invalido", "Tiene que incluir {NOMBRE} y solo letras (ej. {NOMBRE}VIP).");
    nuevo.formato_codigo = f;
  }
  if (c.precio_fijo_uyu !== undefined) {
    const p = c.precio_fijo_uyu === null ? null : Math.round(Number(c.precio_fijo_uyu));
    if (p !== null && !(p >= 100 && p <= 5000)) return falla("precio_invalido", "El precio especial va entre $100 y $5.000.");
    nuevo.precio_fijo_uyu = p;
  }
  if (c.vigencia_horas !== undefined) {
    const h = c.vigencia_horas === null ? null : Math.round(Number(c.vigencia_horas));
    if (h !== null && !(h >= 1 && h <= 24 * 90)) return falla("vigencia_invalida", "La vigencia va de 1 hora a 90 días.");
    nuevo.vigencia_horas = h;
  }
  if (c.vence_el !== undefined) nuevo.vence_el = c.vence_el || null;
  if (c.max_usos_por_cliente !== undefined) {
    const m = Math.round(Number(c.max_usos_por_cliente));
    if (!(m >= 1 && m <= 10)) return falla("usos_invalidos", "Usos por clienta: de 1 a 10.");
    nuevo.max_usos_por_cliente = m;
  }
  if (c.textos !== undefined) {
    const t: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.textos)) t[k] = String(v ?? "").slice(0, 600);
    if (Object.values(t).some((v) => /\d+\s*%/.test(v))) return falla("texto_con_porcentaje", "Los textos para la clienta no muestran el porcentaje.");
    nuevo.textos = t;
  }
  return { ok: true, nuevo };
}

/** Valida y aplica cambios a una regla. Cada cambio exige una nota (el porqué) y queda en el historial. */
export async function guardarRegla(rest: Rest, clave: string, c: CambiosRegla, nota: string, por: string) {
  const actual = await leerRegla(rest, clave);
  if (!actual) return { ok: false as const, motivo: "regla_inexistente" };
  if (actual.archivada_at) return { ok: false as const, motivo: "regla_archivada", detalle: "La regla está archivada: restaurala para editarla." };
  if (!nota.trim()) return { ok: false as const, motivo: "falta_nota", detalle: "Escribí por qué cambia (queda en el historial)." };

  const v = validarCampos(c, actual.tipo);
  if (!v.ok) return v;
  const nuevo = v.nuevo;

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

export interface NuevaRegla extends CambiosRegla { nombre: string; descripcion: string; tipo: TipoRegla }

const TEXTOS_INICIALES: Record<TipoRegla, Record<string, string>> = {
  codigo_fijo: { titulo: "", cuerpo: "", boton: "", pie: "" },
  codigo_personal: { mensaje: "Te dejo tu precio especial para tu próxima lectura, válido hasta el {VENCE}: {LINK}" },
};

/**
 * Crea una regla nueva (2026-11-17). Un código fijo nace con su cupón; uno
 * personal, con su creador de códigos. Una regla nueva funciona como código
 * en el checkout y en links: mostrarla en una pantalla de la web es aparte.
 */
export async function crearRegla(rest: Rest, d: NuevaRegla, nota: string, por: string, precioBase: number | null) {
  const nombre = String(d.nombre ?? "").trim().slice(0, 120);
  const descripcion = String(d.descripcion ?? "").trim().slice(0, 1500);
  if (nombre.length < 3) return falla("falta_nombre", "Poné un nombre a la regla.");
  if (descripcion.length < 10) return falla("falta_descripcion", "Contá en una o dos frases qué es y cuándo se ofrece.");
  if (d.tipo !== "codigo_fijo" && d.tipo !== "codigo_personal") return falla("tipo_invalido");
  if (!nota.trim()) return falla("falta_nota", "Escribí por qué se crea (queda en el historial).");
  if (d.tipo === "codigo_fijo" && !d.codigo?.trim()) return falla("codigo_invalido", "Falta el código.");
  if (d.tipo === "codigo_personal" && !d.formato_codigo?.trim()) return falla("formato_invalido", "Falta el formato del código (ej. {NOMBRE}VIP).");

  // Precio especial o porcentaje: uno de los dos. Con precio, el % queda como referencia contra el precio de hoy.
  let porcentajeRef: number | null = null;
  if (d.precio_fijo_uyu != null) {
    if (precioBase === null) return falla("sin_precio_base", "No se pudo leer el precio actual de la lectura.");
    if (Number(d.precio_fijo_uyu) >= precioBase) return falla("precio_invalido", `El precio especial tiene que ser menor que el precio actual ($${precioBase}).`);
    porcentajeRef = Math.round((1 - Number(d.precio_fijo_uyu) / precioBase) * 10000) / 100;
  } else if (d.porcentaje == null) return falla("porcentaje_invalido", "Poné un precio especial o un porcentaje.");

  const v = validarCampos({ ...d, porcentaje: porcentajeRef === null ? d.porcentaje : undefined, textos: d.textos ?? TEXTOS_INICIALES[d.tipo] }, d.tipo);
  if (!v.ok) return v;
  if (porcentajeRef !== null) v.nuevo.porcentaje = porcentajeRef;
  if (d.tipo === "codigo_fijo") {
    const ya = (await rest(`tarot_codigos_descuento?codigo=eq.${encodeURIComponent(v.nuevo.codigo!)}&select=id`)) as unknown[];
    if (ya?.length) return falla("codigo_existente", `Ya existe un cupón ${v.nuevo.codigo}: elegí otro nombre.`);
  }

  // Clave interna y campaña a partir del nombre (únicas).
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "regla";
  let clave = "";
  for (const extra of ["", "_b", "_c", "_d", "_e", "_f"]) {
    const k = base + extra;
    const [r1, r2] = await Promise.all([
      rest(`tarot_reglas_comerciales?clave=eq.${k}&select=clave`) as Promise<unknown[]>,
      rest(`tarot_codigos_descuento?campania=eq.${k.replace(/_/g, "-")}&select=id&limit=1`) as Promise<unknown[]>,
    ]);
    if (!r1?.length && !r2?.length) { clave = k; break; }
  }
  if (!clave) return falla("clave_ocupada", "Ya hay reglas con un nombre muy parecido.");

  const ahora = new Date().toISOString();
  const fila = {
    clave, nombre, descripcion, tipo: d.tipo, activa: v.nuevo.activa ?? false,
    porcentaje: v.nuevo.porcentaje, precio_fijo_uyu: v.nuevo.precio_fijo_uyu ?? null,
    codigo: v.nuevo.codigo ?? null, formato_codigo: v.nuevo.formato_codigo ?? null,
    vigencia_horas: v.nuevo.vigencia_horas ?? (d.tipo === "codigo_personal" ? 48 : null), vence_el: v.nuevo.vence_el ?? null,
    max_usos_por_cliente: v.nuevo.max_usos_por_cliente ?? 1, campania: clave.replace(/_/g, "-"), textos: v.nuevo.textos ?? {},
    decidido_por: por, decidido_at: ahora, updated_at: ahora, actualizado_por: por,
  };
  await rest("tarot_reglas_comerciales", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(fila) });
  await rest("tarot_reglas_comerciales_historial", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ clave, por, nota: `Regla creada: ${nota.trim()}`.slice(0, 1000), cambios: { creada: fila } }) });
  const regla = await leerRegla(rest, clave);
  if (regla?.tipo === "codigo_fijo" && regla.codigo) await sincronizarCodigoFijo(rest, regla, regla);
  return { ok: true as const, clave };
}

/**
 * "Eliminar" una regla = archivarla (2026-11-17). Queda apagada y fuera de la
 * vista principal, con su historial y su evidencia. Un código fijo apaga su
 * cupón (igual que apagar la regla). Los códigos personales que ya se le
 * dieron a una clienta NO se tocan: siguen valiendo hasta su vencimiento.
 */
export async function archivarRegla(rest: Rest, clave: string, archivar: boolean, nota: string, por: string) {
  const actual = await leerRegla(rest, clave);
  if (!actual) return falla("regla_inexistente");
  if (!nota.trim()) return falla("falta_nota", archivar ? "Escribí por qué se elimina (queda en el historial)." : "Escribí por qué se restaura.");
  if (archivar === !!actual.archivada_at) return { ok: true as const, sin_cambios: true };
  const ahora = new Date().toISOString();
  const cambios = archivar
    ? { archivada_at: ahora, archivada_por: por, activa: false }
    : { archivada_at: null, archivada_por: null }; // vuelve apagada: prenderla es otra decisión
  await rest(`tarot_reglas_comerciales?clave=eq.${encodeURIComponent(clave)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...cambios, updated_at: ahora, actualizado_por: por }),
  });
  await rest("tarot_reglas_comerciales_historial", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ clave, por, nota: `${archivar ? "Eliminada (archivada)" : "Restaurada (queda apagada)"}: ${nota.trim()}`.slice(0, 1000), cambios: archivar ? { archivada: [false, true], activa: [actual.activa, false] } : { archivada: [true, false] } }),
  });
  if (archivar && actual.tipo === "codigo_fijo" && actual.codigo) await sincronizarCodigoFijo(rest, actual, { ...actual, activa: false });
  return { ok: true as const };
}

async function sincronizarCodigoFijo(rest: Rest, antes: Regla, ahora: Regla) {
  // Precio especial fijo (2026-11-17): el cupón pasa a "precio_fijo" en pesos.
  // Sin precio fijo, porcentaje. Siempre solo UYU (Manuel 17/11: sin ARS).
  const descuento = ahora.precio_fijo_uyu
    ? { tipo_descuento: "precio_fijo", valor_descuento: null, precio_fijo_uyu: ahora.precio_fijo_uyu, monedas_aplicables: ["UYU"] }
    : { tipo_descuento: "porcentaje", valor_descuento: ahora.porcentaje, precio_fijo_uyu: null, monedas_aplicables: ["UYU"] };
  const datos = {
    ...descuento, activo: ahora.activa,
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
      body: JSON.stringify({ ...datos, codigo: ahora.codigo, descripcion: `Regla comercial: ${ahora.nombre}`, fecha_inicio: new Date().toISOString(), canal: "web", creado_por: "regla_comercial", metadata: { regla: ahora.clave } }),
    });
  }
  // Cambió el nombre del código: el anterior se desactiva (queda su evidencia).
  if (antes.codigo && antes.codigo !== ahora.codigo) {
    await rest(`tarot_codigos_descuento?codigo=eq.${encodeURIComponent(antes.codigo)}&campania=eq.${encodeURIComponent(ahora.campania)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ activo: false, updated_at: new Date().toISOString(), actualizado_por: "regla_comercial" }),
    });
  }
}

// ── Botón "otra lectura" con precio especial (Manuel 2026-11-17) ──────────
// Regla "otra_lectura" (código fijo, ej. LECTURAVIP a $590). Se ofrece desde
// la entrega de la lectura y durante `vigencia_horas` (2 semanas). La entrega
// se deduce del acceso web: vence 30 días después de crearse
// (backend/supabase/functions/_shared/tarot-accesos.ts, DIAS_VALIDEZ).
const DIAS_ACCESO_LECTURA = 30;

export interface OfertaOtraLectura {
  codigo: string; precio: number; precioAntes: number | null; venceTexto: string; textos: Record<string, string>;
}

export async function ofertaOtraLectura(rest: Rest, expiraAccesoAt: string, precioBase: number | null): Promise<OfertaOtraLectura | null> {
  const r = await leerRegla(rest, "otra_lectura");
  if (!r || !r.activa || !r.codigo || !r.vigencia_horas) return null;
  const expira = new Date(expiraAccesoAt).getTime();
  if (!Number.isFinite(expira)) return null;
  const entrega = expira - DIAS_ACCESO_LECTURA * 86_400_000;
  const hasta = new Date(entrega + r.vigencia_horas * 3_600_000);
  if (Date.now() >= hasta.getTime()) return null;
  if (r.vence_el && Date.now() >= new Date(r.vence_el).getTime()) return null;
  const precio = r.precio_fijo_uyu ?? (precioBase !== null ? Math.round(precioBase * (1 - r.porcentaje / 100)) : null);
  if (precio === null || (precioBase !== null && precio >= precioBase)) return null;
  return { codigo: r.codigo, precio, precioAntes: precioBase, venceTexto: `el ${fechaCorta(hasta).replace(",", "")}`, textos: r.textos };
}

/**
 * Precio que muestra el checkout al llegar con ?codigo= (opción A, 2026-11-17):
 * SOLO LECTURA del cupón, sin validarlo — validar reserva un uso. La
 * validación real (límite por clienta incluido) sigue siendo la de
 * ef_tarot_validar_codigo, al escribir el WhatsApp o antes de pagar.
 */
export async function precioPrevioConCodigo(rest: Rest, codigo: string, precioBase: number | null): Promise<number | null> {
  const k = codigo.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,50}$/.test(k) || precioBase === null) return null;
  const r = (await rest(`tarot_codigos_descuento?codigo=eq.${encodeURIComponent(k)}&activo=eq.true&select=tipo_descuento,valor_descuento,precio_fijo_uyu,fecha_inicio,fecha_fin,monedas_aplicables,habilita_orden_gratuita`)) as Record<string, unknown>[];
  const c = r?.[0];
  if (!c || c.habilita_orden_gratuita) return null;
  const ahora = Date.now();
  if (c.fecha_inicio && new Date(String(c.fecha_inicio)).getTime() > ahora) return null;
  if (c.fecha_fin && new Date(String(c.fecha_fin)).getTime() <= ahora) return null;
  if (Array.isArray(c.monedas_aplicables) && !c.monedas_aplicables.includes("UYU")) return null;
  const v = num(c.valor_descuento);
  let precio: number | null = null;
  if (c.tipo_descuento === "precio_fijo") precio = num(c.precio_fijo_uyu);
  else if (c.tipo_descuento === "porcentaje" && v !== null) precio = Number((precioBase * (1 - v / 100)).toFixed(2));
  else if (c.tipo_descuento === "monto_fijo" && v !== null) precio = Math.max(0, precioBase - v);
  return precio !== null && precio > 0 && precio < precioBase ? precio : null;
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
      codigo, descripcion: `Regla comercial: ${r.nombre} · ${d.nombre.trim().slice(0, 60)}`,
      ...(r.precio_fijo_uyu
        ? { tipo_descuento: "precio_fijo", valor_descuento: null, precio_fijo_uyu: r.precio_fijo_uyu }
        : { tipo_descuento: "porcentaje", valor_descuento: r.porcentaje }),
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
