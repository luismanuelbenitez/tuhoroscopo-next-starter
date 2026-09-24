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
// dinámico (2026-09-04).
//
// SAFE AREA: WhatsApp puede recortar visualmente los laterales según
// dispositivo/preview. Todo contenido crítico (branding, cartas, nombre)
// vive dentro de [SAFE_LEFT, SAFE_RIGHT] = [160, 1440] — los 160px de cada
// borde solo llevan decoración del FONDO FIJO, nunca información dinámica.
// Ver LAYOUT más abajo para las constantes exactas.
//
// FONDO FIJO (sprint 2026-09-06, "experiencia inmersiva + fondo fijo del
// cabezal"): antes el fondo (gradiente + luna/sol/estrellas/líneas) se
// componía en JSX igual que el resto. Ahora es UNA imagen fija —
// _shared/assets/tarot-cabezal-fondo.jpg, embebida como data URI en
// _shared/tarot-cabezal-fondo-data.ts (ver ese archivo y
// _shared/assets/generar-fondo-data.mjs para cómo se regenera cuando se
// reemplaza el asset) — renderizada como un <img> a pantalla completa,
// misma técnica ya probada para las cartas (descargarCartaComoDataUri):
// Satori necesita los bytes ya resueltos en el árbol JSX, no puede hacer
// fetch a una ruta local ni a una URL pública en este runtime. Sobre esa
// imagen solo se renderiza lo que varía por orden: branding, nombre y las
// 5 cartas — nada de lo ambiental (cielo, nebulosa, estrellas principales,
// luna, sol) se vuelve a dibujar por código.
//
// SIN MARCO EN LAS CARTAS (mismo sprint): el mazo nuevo ya trae marco
// dorado, número romano y título impresos en cada carta. El borde dorado
// que este archivo dibujaba antes alrededor de cada carta (para separarla
// visualmente del fondo plano anterior) se sacó por completo — dibujarlo
// ahora sería un doble marco. La carta se renderiza tal cual está
// almacenada, sin decoración adicional.
//
// Formato PNG: salida nativa de ImageResponse, sin paso de encoding extra.
// Se evaluó JPG (Task K) — @vercel/og no expone un encoder JPEG sin
// dependencias adicionales, y el PNG ya se mantiene cómodo bajo el límite
// de WhatsApp (5MB, recomendado <1MB) — medido en QA real: ~800-870KB por
// imagen, ~2.4-2.7s de generación. No se justificó el cambio de formato.
//
// PERFORMANCE — hallazgo real de un sprint anterior: un `boxShadow` en las
// 5 cartas (pensado para darles profundidad) hacía que la función
// excediera WORKER_RESOURCE_LIMIT en el runtime real de Supabase
// (confirmado deployado, no en teoría) — Satori/resvg rasterizan el blur
// de box-shadow de forma cara. Evitar reintroducir box-shadow en este
// archivo sin volver a medir contra el runtime real (vía
// ef_tarot_debug_imagen_whatsapp).
// ============================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { ImageResponse } from "npm:@vercel/og@^0";
import React from "npm:react@^19";
import { FONDO_CABEZAL_DATA_URI } from "./tarot-cabezal-fondo-data.ts";

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

  // Nombre dentro del pergamino (2026-09-24, rediseño "alineado con el PDF"):
  // coordenadas medidas por muestreo de píxeles del asset real
  // (_shared/assets/tarot-cabezal-fondo.jpg) — la zona plana y legible de la
  // cinta de pergamino (excluyendo los extremos enrollados y el pequeño
  // emblema ornamental impreso en el borde superior/inferior de la cinta)
  // va de y≈52 a y≈108, centrada en x≈798, ancho medido ≈518px. Estas
  // coordenadas son propias de ESTE asset — si se reemplaza el fondo otra
  // vez, hay que volver a medir (no son una propiedad del diseño en
  // general, son geometría de esta imagen puntual). NAME_SCROLL_MAX_WIDTH
  // se dejó más angosto que el ancho medido a propósito, como margen de
  // seguridad contra los bordes curvos.
  NAME_SCROLL_CENTER_Y: 80,
  NAME_SCROLL_MAX_WIDTH: 420,
  NAME_SCROLL_MAX_FONT: 38,
  NAME_SCROLL_MIN_FONT: 22,

  // Fecha de nacimiento (opcional — solo si el cliente la cargó en el
  // checkout, ver fecha_nacimiento_snapshot). Debajo del pergamino, ya
  // sobre el fondo oscuro.
  BIRTHDATE_TOP: 206,

  CARDS_WRAPPER_TOP: 258,
  CARDS_WRAPPER_HEIGHT: 380,
  CARD_WIDTH: 200,
  CARD_HEIGHT: 345, // ratio ≈0.579, igual que las cartas reales del mazo
  // Reducido de 26 a 10 (2026-09-24, ajuste "premium"): con 26px las cartas
  // de los extremos perdían texto real del título impreso (ej. "CABALLERO
  // DE ORO" sin la S final) y parte del arte — 10px conserva el efecto
  // abanico/solapado sin cortar contenido legible. Hay margen de sobra:
  // con 10px el ancho total de las 5 cartas (968px) sigue muy por debajo
  // de SAFE_WIDTH (1280px).
  CARD_OVERLAP: 10,
  CARD_ROTATIONS: [-7, -3.5, 0, 3.5, 7] as const, // grados, carta 1→5

  // Marca al pie (2026-09-24): antes "TU ORÁCULO / TU TIRADA" era el título
  // principal, arriba de todo. Con el nombre ahora protagonista dentro del
  // pergamino, la marca pasa a un rol secundario de cierre, debajo de las
  // cartas.
  BRAND_FOOTER_TOP: 686,
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
// repo por ahora; si Google Fonts responde con un ERROR, la generación
// falla de forma controlada (try/catch en generarImagenWhatsapp) y el
// pipeline se degrada al mensaje sin template — nunca rompe la entrega.
//
// TIMEOUT EXPLÍCITO (hallazgo real, 2026-09-18): un fetch sin timeout que
// nunca recibe respuesta (no es un error, es simplemente ausencia de
// respuesta) no lanza excepción — se queda colgado hasta que la plataforma
// mata la función entera por su propio límite de ejecución, sin ejecutar
// ningún catch ni dejar ningún log. Eso dejó una orden real trabada en
// 'enviando_whatsapp'/tarot_envios_whatsapp.estado='enviando' de forma
// indefinida, sin ningún log de error — ver docs/product/DECISIONS.md.
// El try/catch de más arriba solo cubre errores reales de red/DNS/TLS, no
// esta clase de cuelgue silencioso.
const FONT_FETCH_TIMEOUT_MS = 8000;

async function fetchConTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function descargarFuenteTTF(pesoCss: string): Promise<ArrayBuffer> {
  const cssRes = await fetchConTimeout(
    `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@${pesoCss}&display=swap`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } },
  );
  const css = await cssRes.text();
  const match = css.match(/src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!match) throw new Error("No se pudo resolver la URL de la fuente TTF");
  const fontRes = await fetchConTimeout(match[1]);
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
  maxWidth = LAYOUT.NAME_SCROLL_MAX_WIDTH,
  maxFont = LAYOUT.NAME_SCROLL_MAX_FONT,
  minFont = LAYOUT.NAME_SCROLL_MIN_FONT,
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

// ── Capa de fondo (imagen fija, sin datos de la orden) ────────────────
// Un solo <img> a pantalla completa con el asset embebido — misma técnica
// que descargarCartaComoDataUri() de más abajo, ya probada contra el
// runtime real. Reemplaza toda la composición JSX de gradiente/luna/sol/
// estrellas/líneas del sprint anterior (ver header del archivo).
function capaFondo() {
  // position:absolute vive en el div wrapper, nunca directo en el <img> —
  // mismo patrón que usan las cartas más abajo (un div posicionado con un
  // <img> simple adentro). Satori no garantiza position:absolute aplicado
  // directamente sobre un elemento <img>.
  return h(
    "div",
    { style: { display: "flex", position: "absolute", top: 0, left: 0, width: LAYOUT.CANVAS_WIDTH, height: LAYOUT.CANVAS_HEIGHT } },
    h("img", {
      src: FONDO_CABEZAL_DATA_URI,
      width: LAYOUT.CANVAS_WIDTH,
      height: LAYOUT.CANVAS_HEIGHT,
      style: { width: LAYOUT.CANVAS_WIDTH, height: LAYOUT.CANVAS_HEIGHT, objectFit: "cover" },
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
    caja((LAYOUT.CANVAS_WIDTH - nombreBoxWidth) / 2, LAYOUT.NAME_SCROLL_CENTER_Y - 50, nombreBoxWidth, 100, "rgba(80,160,255,0.9)"),
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
    .select("nombre_snapshot, fecha_nacimiento_snapshot")
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

  // Fecha de nacimiento (2026-09-24, rediseño): opcional — el checkout no la
  // exige (ver TarotCheckoutContent.tsx, campo "opcional — ayuda a
  // personalizar"). Mismo formato ya usado en el resto del proyecto para
  // fechas orientadas al cliente (ver ef_tarot_enviar_email.ts,
  // ef_tarot_admin_orden_experiencia.ts): "es-UY", día + mes largo + año.
  const fechaNacimientoTexto = orden.fecha_nacimiento_snapshot
    ? new Date(`${orden.fecha_nacimiento_snapshot}T00:00:00`).toLocaleDateString("es-UY", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

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
            position: "relative", // ancla la sombra y el glow (absolute) más abajo
            width: LAYOUT.CARD_WIDTH, height: LAYOUT.CARD_HEIGHT,
            marginLeft: i === 0 ? 0 : -LAYOUT.CARD_OVERLAP,
            // Sin marco/borde propio (Task del sprint "fondo fijo del
            // cabezal", 2026-09-06): el mazo nuevo ya trae marco dorado,
            // número romano y título impresos en la carta — agregar un
            // borde acá sería un doble marco. background solo es fallback
            // para el caso sin imagen (más abajo).
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
        // Glow detrás de la protagonista (2026-09-24) — gradiente radial
        // plano, NUNCA blur/box-shadow (ver comentario de performance en
        // el header del archivo: un blur real ya rompió WORKER_RESOURCE_LIMIT
        // en este runtime). Un `background: radial-gradient` es solo
        // interpolación de color, sin filtro — mismo costo que el
        // gradiente ya usado en el fondo del canvas raíz, probado en
        // producción sin problema.
        // Sombra dura (2026-09-24) — rectángulo sólido sin blur, desplazado
        // solo hacia abajo (independiente del solapamiento horizontal entre
        // cartas). Da sensación de profundidad/cartas levantadas del fondo
        // sin tocar box-shadow.
        h("div", {
          style: {
            display: "flex", position: "absolute",
            top: 12, left: 0,
            width: LAYOUT.CARD_WIDTH, height: LAYOUT.CARD_HEIGHT,
            background: "rgba(4,2,12,0.55)",
          },
        }),
        h(
          "div",
          {
            style: {
              display: "flex", position: "relative", width: "100%", height: "100%",
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

  // Color tinta oscura (2026-09-24, rediseño): el nombre ahora se dibuja
  // DENTRO del pergamino del fondo, no sobre el cielo oscuro — el dorado
  // claro (#FFCE4D) de antes perdería casi todo el contraste ahí. Mismo
  // tono que usa el PDF para texto sobre pergamino (C_DARK_BROWN,
  // ef_tarot_generar_pdf/index.ts) — "alineado con el PDF" es el pedido
  // explícito de este rediseño.
  const nameLines = nombreAjustado.lineas.filter(Boolean).map((linea, i) =>
    h(
      "span",
      {
        key: i,
        style: {
          fontSize: nombreAjustado.fontSize, color: "#291408", fontWeight: 700,
          fontFamily: "Cormorant Garamond", lineHeight: 1.08,
          marginTop: i === 0 ? 0 : 2,
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
    // Nombre, dentro del pergamino (2026-09-24) — reemplaza el título
    // "TU ORÁCULO / TU TIRADA" + "Tirada realizada para" del diseño
    // anterior. Wrapper de altura fija centrado en NAME_SCROLL_CENTER_Y:
    // así 1 o 2 líneas quedan siempre centradas verticalmente en la zona
    // plana y legible del pergamino, sin recalcular la altura del bloque.
    h(
      "div",
      {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          position: "absolute", top: LAYOUT.NAME_SCROLL_CENTER_Y - 50, height: 100, width: LAYOUT.CANVAS_WIDTH,
        },
      },
      ...nameLines,
    ),
    // Fecha de nacimiento (opcional) — debajo del pergamino, ya sobre el
    // fondo oscuro. Se omite el bloque entero si la orden no la tiene
    // cargada (campo opcional en el checkout).
    fechaNacimientoTexto
      ? h(
          "div",
          { style: { display: "flex", position: "absolute", top: LAYOUT.BIRTHDATE_TOP, width: LAYOUT.CANVAS_WIDTH, justifyContent: "center" } },
          h("span", { style: { fontSize: 24, color: "#c9bfa8", letterSpacing: 2, fontFamily: "Cormorant Garamond" } }, fechaNacimientoTexto),
        )
      : null,
    // Cartas
    h(
      "div",
      {
        style: {
          display: "flex", position: "absolute", top: LAYOUT.CARDS_WRAPPER_TOP, width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CARDS_WRAPPER_HEIGHT, alignItems: "center", justifyContent: "center",
        },
      },
      // Glow detrás de la protagonista — EVALUADO Y DESCARTADO (2026-09-24).
      // Se probaron 3 variantes (radial-gradient anidado dentro de la carta
      // con transform:scale(); el mismo gradiente como hermano independiente
      // en dos tamaños distintos) — dos de las tres causaron un crash real
      // del runtime (WORKER_RESOURCE_LIMIT, status 546, confirmado en logs).
      // La única variante que no rompió (340×300, sin overlap vertical con
      // la carta) terminaba tapada casi por completo por las cartas vecinas
      // y no se veía. Sin patrón claro y reproducible que distinga la
      // variante segura de las que rompen — no vale el riesgo de dejar algo
      // inestable en el pipeline real de entrega. Si se retoma esto en el
      // futuro, mejor camino: un glow pre-renderizado como asset fijo (PNG
      // con transparencia, mismo truco que el fondo del cabezal en
      // tarot-cabezal-fondo-data.ts) en vez de un gradiente calculado en
      // cada invocación — eso sacaría el costo del runtime por completo.
      cardsRow,
    ),
    // Veladura de unificación (2026-09-24) — degradé plano (sin blur) sobre
    // la fila de cartas: las 5 cartas tienen paletas muy distintas entre sí
    // (cielo celeste, oscuros, dorados) y quedaban como imágenes sueltas
    // pegadas al fondo. Un lavado cálido muy sutil arriba/abajo (transparente
    // en el centro, para no tapar el arte) las liga tonalmente con el
    // navy/dorado del fondo fijo.
    h("div", {
      style: {
        display: "flex", position: "absolute", top: LAYOUT.CARDS_WRAPPER_TOP, width: LAYOUT.CANVAS_WIDTH,
        height: LAYOUT.CARDS_WRAPPER_HEIGHT,
        background: "linear-gradient(180deg, rgba(255,206,77,0.07) 0%, rgba(255,206,77,0) 20%, rgba(255,206,77,0) 80%, rgba(8,4,20,0.22) 100%)",
      },
    }),
    // Marca, al pie (2026-09-24) — antes era el título principal arriba de
    // todo ("TU ORÁCULO / TU TIRADA"); con el nombre ahora protagonista
    // dentro del pergamino, la marca pasa a un cierre discreto debajo de
    // las cartas. Remate ornamental (línea-diamante-línea dorado, mismo
    // lenguaje visual que Ornamento() en app/lectura/[token]/page.tsx)
    // arriba del wordmark en vez de flotar solo en el fondo vacío.
    h(
      "div",
      {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center", position: "absolute",
          top: LAYOUT.BRAND_FOOTER_TOP, width: LAYOUT.CANVAS_WIDTH,
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", marginBottom: 18 } },
        h("div", { style: { display: "flex", width: 80, height: 2, background: "linear-gradient(90deg, rgba(255,206,77,0), rgba(255,206,77,0.85))" } }),
        // Rombo vía div rotado, no caracter Unicode ("✦") — Cormorant
        // Garamond no trae ese glifo y Satori no tiene fallback de fuente
        // del sistema como un navegador: rendereaba como un tofu box roto.
        // Mismo truco que ya usa Ornamento() en app/lectura/[token]/page.tsx.
        h("div", { style: { display: "flex", width: 10, height: 10, marginLeft: 16, marginRight: 16, background: "rgba(255,206,77,0.9)", transform: "rotate(45deg)" } }),
        h("div", { style: { display: "flex", width: 80, height: 2, background: "linear-gradient(90deg, rgba(255,206,77,0.85), rgba(255,206,77,0))" } }),
      ),
      h("span", { style: { fontSize: 22, letterSpacing: 9, color: "#FFCE4D", fontFamily: "Cormorant Garamond", fontWeight: 700 } }, "TU ORÁCULO"),
    ),
    opts.debugLayout ? capaDebug(LAYOUT.NAME_SCROLL_MAX_WIDTH) : null,
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
