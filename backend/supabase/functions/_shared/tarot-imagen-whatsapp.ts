// ============================================================
// _shared/tarot-imagen-whatsapp.ts — Cabezal dinámico del template de
// WhatsApp ("TU ORÁCULO / TU TIRADA" + las 5 cartas reales + nombre real).
//
// Generación determinística (sin IA generativa): composición JSX → PNG vía
// @vercel/og (Satori, WASM puro) — alternativa oficialmente documentada por
// Supabase para generar imágenes en Edge Functions, porque Puppeteer/
// Chromium no corre ahí. https://supabase.com/docs/guides/functions/examples/og-image
//
// Dimensiones: 1600×800 (2:1), diseño base aprobado del sprint de cabezal
// dinámico (2026-09-04). Reemplaza el formato 1080×1080 (1:1) del sprint
// anterior de imagen de WhatsApp.
//
// SAFE AREA: WhatsApp puede recortar visualmente los laterales según
// dispositivo/preview. Todo contenido crítico (branding, cartas, nombre)
// vive dentro de [SAFE_LEFT, SAFE_RIGHT] = [160, 1440] — los 160px de cada
// borde solo llevan decoración (luna, sol, estrellas), nunca información.
// Ver LAYOUT más abajo para las constantes exactas y docs/modules/
// mobile-delivery-experience-reference.md § "Cabezal dinámico WhatsApp"
// para el diagrama completo.
//
// Fondo: NO se usa un PNG fijo — no hay ningún asset de fondo aprobado
// disponible en este entorno para incorporar. En su lugar, la capa de
// fondo (gradiente + luna/sol/estrellas/líneas ornamentales) se compone en
// JSX igual que el resto, pero deliberadamente aislada en su propio
// subárbol sin ningún dato de la orden — es "fondo fijo" en el sentido de
// que no depende de nada dinámico, y puede reemplazarse por una imagen real
// más adelante cambiando solo esa función, sin tocar las capas dinámicas.
//
// Formato PNG: salida nativa de ImageResponse, sin paso de encoding extra.
// Se evaluó JPG (Task K) — @vercel/og no expone un encoder JPEG sin
// dependencias adicionales, y el PNG ya se mantiene cómodo bajo el límite
// de WhatsApp (5MB, recomendado <1MB) — medido en QA real: ~800-870KB por
// imagen, ~2.4-2.7s de generación. No se justificó el cambio de formato.
//
// PERFORMANCE — hallazgo real de este sprint: un `boxShadow` en las 5
// cartas (pensado para darles profundidad) hacía que la función excediera
// WORKER_RESOURCE_LIMIT en el runtime real de Supabase (confirmado
// deployado, no en teoría) — Satori/resvg rasterizan el blur de box-shadow
// de forma cara. Se sacó por completo; el borde dorado ya separa
// visualmente la carta del fondo sin ese costo. Evitar reintroducir
// box-shadow en este archivo sin volver a medir contra el runtime real.
// ============================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { ImageResponse } from "npm:@vercel/og@^0";
import React from "npm:react@^19";

const h = React.createElement;

const BUCKET_ASSETS = "tarot-assets";
const IMAGE_SIGNED_TTL_SEG = 24 * 3600;

// ── LAYOUT — constantes explícitas (Task E) ──────────────────────────
// Toda esta sección es el único lugar que hay que tocar para ajustar el
// diseño visualmente en el futuro (Task W).
export const LAYOUT = {
  CANVAS_WIDTH: 1600,
  CANVAS_HEIGHT: 800,

  SAFE_MARGIN_X: 160,
  SAFE_LEFT: 160,
  SAFE_RIGHT: 1440,
  SAFE_WIDTH: 1280,

  BRANDING_TOP: 34,
  BRANDING_HEIGHT: 96,

  CARDS_WRAPPER_TOP: 160,
  CARDS_WRAPPER_HEIGHT: 380,
  CARD_WIDTH: 200,
  CARD_HEIGHT: 345, // ratio ≈0.579, igual que las cartas reales del mazo
  CARD_OVERLAP: 26, // superposición entre cartas adyacentes (efecto abanico)
  CARD_ROTATIONS: [-7, -3.5, 0, 3.5, 7] as const, // grados, carta 1→5

  NAME_BLOCK_TOP: 566,
  NAME_MAX_WIDTH: 1100, // dentro de SAFE_WIDTH (1280), con margen de respiro
  NAME_MAX_FONT: 64,
  NAME_MIN_FONT: 32,
} as const;

// Decisión (Task G): esta imagen NO imprime labels de posición bajo cada
// carta. Las posiciones canónicas actuales ("Tu momento actual", "El
// desafío", "Lo que no estás viendo", "Consejo para avanzar", "Lo que
// viene" — ver POSICIONES en app/lectura/[token]/page.tsx) ya se explican
// en la página mobile, con espacio real para cada una. Acá, agregar 5
// textos cortos bajo cartas ya comprimidas por el abanico competiría con
// el nombre por atención y forzaría cartas más chicas — la imagen de
// WhatsApp tiene un objetivo emocional ("esta tirada fue hecha para mí"),
// no educativo. Las cartas ganan el espacio.

// ── Fuentes ───────────────────────────────────────────────────────────
let fontBoldCache: ArrayBuffer | null = null;
let fontRegularCache: ArrayBuffer | null = null;

// Satori (el motor de @vercel/og) necesita TTF/OTF — Google Fonts sirve
// WOFF2 por defecto a navegadores modernos, pero cae a TTF si el
// User-Agent no anuncia soporte woff2 (truco estándar usado por los
// ejemplos oficiales de @vercel/og). Se pide el CSS con ese User-Agent,
// se extrae la URL del archivo TTF con una regex, y se descarga el binario.
// Fuente controlada por Google Fonts (no un archivo propio del proyecto) —
// evaluado en Task I: se prefirió no incrustar un binario de fuente en el
// repo por ahora; si Google Fonts alguna vez no responde, la generación
// falla de forma controlada (try/catch en generarImagenWhatsapp) y el
// pipeline se degrada al mensaje sin template — nunca rompe la entrega.
async function descargarFuenteTTF(pesoCss: string): Promise<ArrayBuffer> {
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@${pesoCss}&display=swap`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } },
  );
  const css = await cssRes.text();
  const match = css.match(/src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!match) throw new Error("No se pudo resolver la URL de la fuente TTF");
  const fontRes = await fetch(match[1]);
  return await fontRes.arrayBuffer();
}

// Cacheadas en memoria del isolate entre invocaciones calientes.
async function cargarFuentes(): Promise<{ bold: ArrayBuffer; regular: ArrayBuffer }> {
  if (!fontRegularCache) fontRegularCache = await descargarFuenteTTF("500");
  if (!fontBoldCache) fontBoldCache = await descargarFuenteTTF("700");
  return { bold: fontBoldCache, regular: fontRegularCache };
}

// ── Fitting de nombre (Task H) ───────────────────────────────────────
// Primera versión medía el ancho real parseando el TTF con opentype.js —
// más preciso, pero causó WORKER_RESOURCE_LIMIT real en el
// Edge Function (parsear la tabla de glifos completa de una fuente serif
// es una operación pesada para el runtime de Deno Deploy/Supabase, un
// costo que el sprint anterior nunca pagó porque solo mostraba una
// palabra sin fitting dinámico). Se reemplazó por una heurística de ancho
// promedio por caracter, calibrada para Cormorant Garamond Bold — más
// liviana, sigue sin truncar ni usar ellipsis, y con margen de sobra: el
// nombre más largo probado en QA ("Maximiliano Alejandro", 21 caracteres)
// entra cómodo incluso con esta estimación conservadora (ver reporte de
// cierre del sprint para las medidas reales).
export interface NombreAjustado {
  lineas: string[];
  fontSize: number;
}

const ANCHO_PROMEDIO_POR_CARACTER = 0.56; // fracción del fontSize (em)

function anchoTexto(texto: string, fontSize: number): number {
  return texto.length * ANCHO_PROMEDIO_POR_CARACTER * fontSize;
}

function tamanoQueEntra(texto: string, maxWidth: number, maxFont: number, minFont: number): number {
  let size = maxFont;
  while (size > minFont) {
    if (anchoTexto(texto, size) <= maxWidth) return size;
    size -= 1;
  }
  return minFont;
}

function partirEnDosLineas(nombre: string): [string, string] {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  if (palabras.length < 2) return [nombre, ""];
  // Punto de corte más cercano a la mitad de caracteres, nunca al final
  // (evita una segunda línea vacía) ni al principio.
  let mejorCorte = 1;
  let mejorDelta = Infinity;
  let acumulado = 0;
  for (let i = 0; i < palabras.length - 1; i++) {
    acumulado += palabras[i].length + 1;
    const delta = Math.abs(acumulado - nombre.length / 2);
    if (delta < mejorDelta) { mejorDelta = delta; mejorCorte = i + 1; }
  }
  return [palabras.slice(0, mejorCorte).join(" "), palabras.slice(mejorCorte).join(" ")];
}

export function fitNameToWidth(
  nombreCrudo: string,
  maxWidth = LAYOUT.NAME_MAX_WIDTH,
  maxFont = LAYOUT.NAME_MAX_FONT,
  minFont = LAYOUT.NAME_MIN_FONT,
): NombreAjustado {
  // Normaliza espacios múltiples (no altera acentos/ñ/apostrofes/guiones —
  // son parte del texto real, se cuentan igual que cualquier otro caracter).
  const nombre = nombreCrudo.trim().replace(/\s+/g, " ");
  if (!nombre) return { lineas: [""], fontSize: maxFont };

  const sizeUnaLinea = tamanoQueEntra(nombre, maxWidth, maxFont, minFont);
  if (anchoTexto(nombre, sizeUnaLinea) <= maxWidth || nombre.split(" ").length < 2) {
    return { lineas: [nombre], fontSize: sizeUnaLinea };
  }

  // Ni al tamaño mínimo entra en una línea → dos líneas (nunca tres).
  const [linea1, linea2] = partirEnDosLineas(nombre);
  const anchoMayor = Math.max(anchoTexto(linea1, minFont), anchoTexto(linea2, minFont));
  // Con dos líneas más cortas normalmente entra más grande que minFont —
  // se recalcula tomando la línea más ancha de las dos como referencia.
  const lineaReferencia = anchoTexto(linea1, minFont) >= anchoTexto(linea2, minFont) ? linea1 : linea2;
  const size = anchoMayor <= maxWidth ? tamanoQueEntra(lineaReferencia, maxWidth, maxFont, minFont) : minFont;
  return { lineas: [linea1, linea2], fontSize: size };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

interface CartaParaImagen {
  posicion: number;
  nombreCarta: string;
  invertida: boolean;
  storagePath: string | null;
}

async function descargarCartaComoDataUri(
  supabase: SupabaseClient,
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET_ASSETS).download(storagePath);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const ext = storagePath.split(".").pop()?.toLowerCase();
  const mime = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${toBase64(bytes)}`;
}

// ── Capa de fondo (estática, sin datos de la orden) ──────────────────
function celestialCircle(props: { left?: number; right?: number; top: number; size: number; color: string; opacity?: number }) {
  return h("div", {
    style: {
      display: "flex", position: "absolute", top: props.top,
      ...(props.left !== undefined ? { left: props.left } : { right: props.right }),
      width: props.size, height: props.size, borderRadius: props.size,
      background: props.color, opacity: props.opacity ?? 1,
    },
  });
}

function estrella(top: number, left: number, size: number, opacity: number) {
  return h("div", {
    style: {
      display: "flex", position: "absolute", top, left, width: size, height: size,
      borderRadius: size, background: "#F0E6FF", opacity,
    },
  });
}

function capaFondo() {
  const estrellas: React.ReactElement[] = [];
  // Estrellas solo en los márgenes laterales (fuera de SAFE_LEFT/SAFE_RIGHT)
  // y en la franja superior — si WhatsApp recorta los laterales, no se
  // pierde nada crítico, ver comentario de SAFE AREA arriba.
  const posicionesEstrellas: Array<[number, number, number, number]> = [
    [40, 45, 5, 0.55], [90, 90, 3, 0.4], [150, 55, 4, 0.5], [210, 100, 3, 0.35],
    [60, 1500, 4, 0.5], [120, 1545, 3, 0.4], [180, 1510, 5, 0.55], [230, 1470, 3, 0.35],
    [30, 300, 3, 0.3], [28, 700, 3, 0.28], [26, 900, 3, 0.25], [30, 1300, 3, 0.3],
  ];
  for (const [top, left, size, opacity] of posicionesEstrellas) {
    estrellas.push(estrella(top, left, size, opacity));
  }

  return h(
    "div",
    { style: { display: "flex", position: "absolute", top: 0, left: 0, width: LAYOUT.CANVAS_WIDTH, height: LAYOUT.CANVAS_HEIGHT } },
    // Luna — margen izquierdo
    celestialCircle({ left: 62, top: 46, size: 88, color: "#EDE6D6", opacity: 0.9 }),
    celestialCircle({ left: 92, top: 40, size: 88, color: "#130a2e", opacity: 0.55 }),
    // Sol — margen derecho
    celestialCircle({ right: 62, top: 46, size: 88, color: "#FFCE4D", opacity: 0.85 }),
    ...estrellas,
    // Líneas ornamentales finas, dentro de zona segura, bajo el branding
    h("div", {
      style: {
        display: "flex", position: "absolute", top: 152, left: LAYOUT.SAFE_LEFT + 60,
        width: 420, height: 1, background: "rgba(255,206,77,0.35)",
      },
    }),
    h("div", {
      style: {
        display: "flex", position: "absolute", top: 152, right: LAYOUT.SAFE_LEFT + 60,
        width: 420, height: 1, background: "rgba(255,206,77,0.35)",
      },
    }),
  );
}

// ── Capa de debug (Task P) — SOLO se activa explícitamente, nunca en el
// path de producción normal. ──────────────────────────────────────────
function capaDebug(nombreBoxWidth: number) {
  const linea = (x: number) => h("div", {
    style: { display: "flex", position: "absolute", top: 0, left: x, width: 2, height: LAYOUT.CANVAS_HEIGHT, background: "rgba(0,255,140,0.7)" },
  });
  const caja = (x: number, y: number, w: number, h_: number, color: string) => h("div", {
    style: { display: "flex", position: "absolute", left: x, top: y, width: w, height: h_, border: `2px solid ${color}` },
  });
  const cardsBoxes: React.ReactElement[] = [];
  const totalCardsWidth = LAYOUT.CARD_WIDTH + 4 * (LAYOUT.CARD_WIDTH - LAYOUT.CARD_OVERLAP);
  const cardsStartX = (LAYOUT.CANVAS_WIDTH - totalCardsWidth) / 2;
  for (let i = 0; i < 5; i++) {
    const x = cardsStartX + i * (LAYOUT.CARD_WIDTH - LAYOUT.CARD_OVERLAP);
    cardsBoxes.push(caja(x, LAYOUT.CARDS_WRAPPER_TOP + (LAYOUT.CARDS_WRAPPER_HEIGHT - LAYOUT.CARD_HEIGHT) / 2, LAYOUT.CARD_WIDTH, LAYOUT.CARD_HEIGHT, "rgba(255,0,120,0.8)"));
  }
  return h(
    "div",
    { style: { display: "flex", position: "absolute", top: 0, left: 0, width: LAYOUT.CANVAS_WIDTH, height: LAYOUT.CANVAS_HEIGHT } },
    linea(LAYOUT.SAFE_LEFT),
    linea(LAYOUT.SAFE_RIGHT),
    caja(0, 0, LAYOUT.CANVAS_WIDTH, LAYOUT.CANVAS_HEIGHT, "rgba(0,255,140,0.9)"),
    ...cardsBoxes,
    caja((LAYOUT.CANVAS_WIDTH - nombreBoxWidth) / 2, LAYOUT.NAME_BLOCK_TOP, nombreBoxWidth, 170, "rgba(80,160,255,0.9)"),
  );
}

/**
 * Genera (o reutiliza si ya existe) la imagen personalizada de una orden y
 * devuelve una signed URL fresca. Idempotente: el path en Storage es fijo
 * por orden (`tarot/whatsapp/{ordenId}.png`) — una segunda llamada con
 * `forzar: false` reusa el archivo ya generado y solo firma una URL nueva;
 * con `forzar: true` vuelve a componer la imagen desde cero (por si las
 * cartas de esa orden hubieran cambiado, o para regenerar manualmente).
 *
 * `debugLayout: true` dibuja la safe area y las bounding boxes — SOLO para
 * QA local/manual, nunca debe pasarse `true` desde el pipeline de entrega
 * real (ef_tarot_enviar_whatsapp no lo expone).
 */
export async function generarImagenWhatsapp(
  supabase: SupabaseClient,
  ordenId: string,
  opts: { forzar?: boolean; debugLayout?: boolean } = {},
): Promise<{ signedUrl: string; bytes?: Uint8Array } | null> {
  const storagePath = `tarot/whatsapp/${ordenId}.png`;

  if (!opts.forzar && !opts.debugLayout) {
    const { data: existente } = await supabase.storage.from(BUCKET_ASSETS).list("tarot/whatsapp", {
      search: `${ordenId}.png`,
    });
    if (existente && existente.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET_ASSETS)
        .createSignedUrl(storagePath, IMAGE_SIGNED_TTL_SEG);
      if (signed?.signedUrl) return { signedUrl: signed.signedUrl };
    }
  }

  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("nombre_snapshot")
    .eq("id", ordenId)
    .maybeSingle();
  if (!orden?.nombre_snapshot) return null;

  const { data: lectura } = await supabase
    .from("tarot_lecturas")
    .select("contenido_json")
    .eq("orden_id", ordenId)
    .eq("es_vigente", true)
    .maybeSingle();

  const cartasContenido = (lectura?.contenido_json as {
    cartas?: Array<{ posicion: number; carta_id: string; nombre_carta: string; orientacion: string }>;
  } | null)?.cartas;

  if (!cartasContenido || cartasContenido.length !== 5) return null;

  // Bug real encontrado en la auditoría de este sprint: la versión anterior
  // buscaba la imagen de cada carta por nombre_es. Hay dos mazos ACTIVOS
  // simultáneamente (rws-thc, rws-classic) y las 78 cartas de uno colisionan
  // en nombre con las 78 del otro ("El Loco", "As de Bastos", etc. existen
  // en ambos) — buscar por nombre podía traer la imagen del mazo equivocado.
  // contenido_json.cartas ya incluye carta_id (fijado por
  // ef_tarot_generar_lectura al momento del sorteo) — se busca por ahí,
  // exacto, sin ambigüedad posible.
  const idsCartas = cartasContenido.map((c) => c.carta_id).filter(Boolean);
  const { data: cartasImg } = idsCartas.length
    ? await supabase.from("tarot_cartas").select("id, imagen_storage_path, imagen_url").in("id", idsCartas)
    : { data: [] as Array<{ id: string; imagen_storage_path: string | null; imagen_url: string | null }> };

  const pathPorId = new Map<string, string>();
  for (const c of cartasImg ?? []) {
    const path = c.imagen_storage_path ?? c.imagen_url ?? "";
    if (path) pathPorId.set(c.id, path);
  }

  const cartas: CartaParaImagen[] = [...cartasContenido]
    .sort((a, b) => a.posicion - b.posicion)
    .map((c) => ({
      posicion: c.posicion,
      nombreCarta: c.nombre_carta,
      invertida: c.orientacion === "invertida",
      storagePath: pathPorId.get(c.carta_id) ?? null,
    }));

  const dataUris = await Promise.all(
    cartas.map((c) => descargarCartaComoDataUri(supabase, c.storagePath)),
  );

  const { bold, regular } = await cargarFuentes();

  // Nombre completo (snapshot de la orden, NUNCA el perfil mutable del
  // cliente — mismo principio "CLIENTE CANÓNICO ≠ SNAPSHOT" ya aplicado en
  // el resto del proyecto). A diferencia del sprint anterior (que mostraba
  // solo la primera palabra), acá se muestra el nombre completo: nombres
  // compuestos uruguayos/rioplatenses habituales ("Luis Manuel", "María
  // Fernanda") son el primer nombre en sí, no "nombre + apellido" — cortar
  // a la primera palabra los mostraría incompletos. fitNameToWidth()
  // maneja el caso en que igual sea muy largo.
  const nombreAjustado = fitNameToWidth(orden.nombre_snapshot);

  const totalCardsWidth = LAYOUT.CARD_WIDTH + 4 * (LAYOUT.CARD_WIDTH - LAYOUT.CARD_OVERLAP);

  const cardsRow = h(
    "div",
    {
      style: {
        display: "flex", flexDirection: "row", alignItems: "center",
        width: totalCardsWidth, height: LAYOUT.CARD_HEIGHT,
      },
    },
    ...cartas.map((c, i) => {
      const rotacion = LAYOUT.CARD_ROTATIONS[i] ?? 0;
      const esProtagonista = i === 2;
      return h(
        "div",
        {
          key: c.posicion,
          style: {
            display: "flex",
            width: LAYOUT.CARD_WIDTH, height: LAYOUT.CARD_HEIGHT,
            marginLeft: i === 0 ? 0 : -LAYOUT.CARD_OVERLAP,
            borderRadius: 12, overflow: "hidden",
            border: "3px solid rgba(255,206,77,0.45)",
            background: "#1a1030",
            // Satori solo acepta "transform" con una función real — "none"
            // no parsea (a diferencia de un navegador real), por eso la
            // propiedad se omite del todo cuando no hace falta ningún
            // transform. Bug ya encontrado y documentado en el sprint
            // anterior — se repite la misma regla acá para la rotación del
            // abanico y para la inversión de la carta.
            ...((rotacion !== 0 || esProtagonista)
              ? { transform: `rotate(${rotacion}deg)${esProtagonista ? " scale(1.06)" : ""}` }
              : {}),
            zIndex: esProtagonista ? 10 : i,
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex", width: "100%", height: "100%",
              ...(c.invertida ? { transform: "rotate(180deg)" } : {}),
            },
          },
          dataUris[i]
            ? h("img", { src: dataUris[i] as string, width: LAYOUT.CARD_WIDTH, height: LAYOUT.CARD_HEIGHT, style: { objectFit: "cover" } })
            : h("div", { style: { display: "flex", width: "100%", height: "100%" } }),
        ),
      );
    }),
  );

  const nameLines = nombreAjustado.lineas.filter(Boolean).map((linea, i) =>
    h(
      "span",
      {
        key: i,
        style: {
          fontSize: nombreAjustado.fontSize, color: "#FFCE4D", fontWeight: 700,
          fontFamily: "Cormorant Garamond", lineHeight: 1.08,
          marginTop: i === 0 ? 6 : 2,
        },
      },
      linea,
    ),
  );

  const raiz = h(
    "div",
    {
      style: {
        width: `${LAYOUT.CANVAS_WIDTH}px`, height: `${LAYOUT.CANVAS_HEIGHT}px`,
        display: "flex", flexDirection: "column", alignItems: "center",
        position: "relative", overflow: "hidden",
        background: "linear-gradient(160deg, #130a2e 0%, #0d0820 55%, #0c0618 100%)",
        fontFamily: "Cormorant Garamond",
      },
    },
    capaFondo(),
    // Branding
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", alignItems: "center", position: "absolute", top: LAYOUT.BRANDING_TOP, width: LAYOUT.CANVAS_WIDTH } },
      h("span", { style: { fontSize: 26, letterSpacing: 10, color: "#FFCE4D", fontFamily: "Cormorant Garamond", fontWeight: 700 } }, "TU ORÁCULO"),
      h("span", { style: { fontSize: 48, color: "#F0F1F5", fontWeight: 700, marginTop: 8, fontFamily: "Cormorant Garamond" } }, "TU TIRADA"),
    ),
    // Cartas
    h(
      "div",
      {
        style: {
          display: "flex", position: "absolute", top: LAYOUT.CARDS_WRAPPER_TOP, width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CARDS_WRAPPER_HEIGHT, alignItems: "center", justifyContent: "center",
        },
      },
      cardsRow,
    ),
    // Nombre
    h(
      "div",
      {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", position: "absolute",
          top: LAYOUT.NAME_BLOCK_TOP, width: LAYOUT.CANVAS_WIDTH,
        },
      },
      h("span", { style: { fontSize: 24, color: "#8b84a3", letterSpacing: 3, fontFamily: "Cormorant Garamond" } }, "Tirada realizada para"),
      ...nameLines,
    ),
    opts.debugLayout ? capaDebug(LAYOUT.NAME_MAX_WIDTH) : null,
  );

  const img = new ImageResponse(raiz, {
    width: LAYOUT.CANVAS_WIDTH,
    height: LAYOUT.CANVAS_HEIGHT,
    fonts: [
      { name: "Cormorant Garamond", data: regular, weight: 500, style: "normal" },
      { name: "Cormorant Garamond", data: bold, weight: 700, style: "normal" },
    ],
  });

  const bytes = new Uint8Array(await img.arrayBuffer());

  if (opts.debugLayout) {
    // Modo debug: no toca Storage, devuelve los bytes para inspección local.
    return { signedUrl: "", bytes };
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_ASSETS)
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true });
  if (uploadErr) return null;

  const { data: signed, error: signedErr } = await supabase.storage
    .from(BUCKET_ASSETS)
    .createSignedUrl(storagePath, IMAGE_SIGNED_TTL_SEG);
  if (signedErr || !signed?.signedUrl) return null;

  return { signedUrl: signed.signedUrl, bytes };
}
