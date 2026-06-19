// ============================================================
// ef_tarot_generar_pdf — Sprint 4.2 v7
// Template mistico-v2 (2480×3508 px, escala 0.24 px→pt).
// 3 páginas: tirada visual | interpretaciones | síntesis
//
// COORDENADAS EN PÍXELES (top-left = 0,0, como editor de imágenes).
// pX(px) → convierte x/w/h de pixels a puntos PDF.
// pY(py) → convierte y de pixels (desde arriba) a y PDF (desde abajo).
// Para cajas: y en PDF = pY(py_top + px_height) = esquina inferior-izq.
//
// DEBUG MODE: pasar { "debug": true } en el body → dibuja grilla
// de coordenadas y recuadros de cada zona sobre el PDF.
// Usar para calibrar posiciones de texto/imágenes.
//
// REGLAS CRÍTICAS:
//   1. Solo procesa órdenes en estado "lectura_lista" o "error_pdf".
//   2. Idempotente: si PDF ya listo, ignorar (salvo force=true).
//   3. Fuente única: contenido_json de tarot_lecturas.
//   4. imagen_storage_path resuelto por nombre_es en tarot_cartas.
//   5. No toca tablas del SaaS THC.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import {
  PDFDocument, PDFFont, PDFImage, PDFPage,
  StandardFonts, rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN            = "ef_tarot_generar_pdf";
const BUCKET_ASSETS = "tarot-assets";
const PLANTILLA     = "mistico-v2";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── A4 en puntos PDF (origen: esquina inferior izquierda) ─────
const PW = 595.28, PH = 841.89;

// ── Conversión px → pt ────────────────────────────────────────
// Template: 2480×3508 px → A4 595×842 pt (factor 0.24)
// Origen px: esquina superior izquierda (como cualquier editor).
// pY convierte y desde-arriba a y desde-abajo (sistema PDF).
// Para imágenes: y PDF = pY(px_top + px_height) = esquina inferior.
// Los font sizes se mantienen en puntos tipográficos (no px).
const SCALE = 0.24;
function pX(px: number): number { return px * SCALE; }
function pY(py: number): number { return PH - py * SCALE; }

// ── Tipos de unidades de layout ─────────────────────────────
// Px: todos los valores del layout (coords, tamaños, font sizes)
// expresados en píxeles del template (2480×3508).
// La conversión a pt PDF siempre mediante pX() / pY() al renderizar.
type Px = number;

interface CardSlot  { x: Px; y: Px; w: Px; h: Px }
interface TitleZone { x: Px; y: Px; width: Px; fontSize: Px; minFontSize: Px }
interface BirthZone { x: Px; y: Px; width: Px; fontSize: Px }
interface BlockOuter { x: Px; y: Px; w: Px; h: Px }
interface BlockCard  { x: Px; y: Px; w: Px; h: Px }
interface BlockText  { x: Px; yStart: Px; w: Px; minY: Px }
interface P2Block    { outer: BlockOuter; card: BlockCard; text: BlockText }
interface BodyZone   { x: Px; yStart: Px; width: Px; minY: Px; fontSize: Px }
interface InlineZone { x: Px; y: Px; width: Px; fontSize: Px }
interface StepZone   { x: Px; y: Px; width: Px; minY: Px }
interface P3Layout {
  resumen:       BodyZone;
  mensajeFinal:  BodyZone;
  proximosPasos: StepZone[];
  recordatorio:  InlineZone;
}

// ── Colores ──────────────────────────────────────────────────
const C_DARK_BROWN = rgb(0.16, 0.08, 0.03);
const C_GOLD       = rgb(0.72, 0.55, 0.10);
const C_CREAM      = rgb(0.97, 0.95, 0.90);
const C_TEXT_DARK  = rgb(0.12, 0.07, 0.22);
const C_TEXT_MED   = rgb(0.38, 0.30, 0.50);
const C_WHITE      = rgb(1, 1, 1);

// ─────────────────────────────────────────────────────────────
// LAYOUT PÁGINA 1 — Tirada visual
// Todos los valores en PÍXELES del template (2480×3508), origen top-left.
// Los labels de posición ("Situación Actual", etc.) están
// quemados en el template — NO se dibujan por código.
// ─────────────────────────────────────────────────────────────

// Scroll superior: área del título dinámico.
// x,y = top-left en px. fontSize = tamaño máximo en px (se achica automáticamente).
const P1_TITLE: TitleZone = {
  x: 580, y: 280,
  width: 1330,
  fontSize: 108,  // px → ~26pt en PDF
  minFontSize: 58, // px → ~14pt en PDF
};

// Fecha de nacimiento (valor solo; label "Fecha de nacimiento:" quemado en template).
const P1_BIRTH: BirthZone = {
  x: 940, y: 550,
  width: 700,
  fontSize: 50, // px → 12pt en PDF
};

// Slots de las 5 cartas.
// x,y = esquina top-left en px. w,h = dimensiones en px.
const P1_CARDS = [
  // Carta 1 — Situación Actual (centro alto)
  { x: 1022, y:  730, w: 425, h: 716 },
  // Carta 2 — Base Inconsciente (izquierda)
  { x:  238, y:  1250, w: 460, h: 800 },
  // Carta 3 — Obstáculo / Desafío (derecha)
  { x: 1785, y: 1250, w: 440, h: 800 },
  // Carta 4 — Consejo Práctico (centro medio)
  { x:  1025, y: 1758, w: 420, h: 630 },
  // Carta 5 — Tendencia Próxima (centro bajo)
  { x:  1025, y: 2680, w: 420, h: 600 }, // reduzco y a ver si subo
];

// ─────────────────────────────────────────────────────────────
// LAYOUT PÁGINA 2 — Interpretaciones (template mistico-v2)
// Todos los valores en PÍXELES del template (2480×3508), origen top-left.
// outer: recuadro exterior del bloque.
// card : zona de la imagen de carta.
// text : x,yStart = top-left del área de texto (baseline primera línea).
//        minY = límite inferior del texto (máximo y desde arriba).
// ─────────────────────────────────────────────────────────────
const P2_BLOCKS: P2Block[] = [
  // Bloque 1 — Situación Actual (arriba izq)
  { outer: { x:   95, y: 640, w: 1120, h: 885 },
    card:  { x:   170, y: 775, w: 430, h: 700 },
    text:  { x:  630, yStart: 800, w: 550, minY:  1450 } },
  // Bloque 2 — Obstáculo / Desafío (arriba der)
  { outer: { x: 1275, y: 640, w: 1120, h: 890 },
    card:  { x: 1335, y: 775, w:  430, h: 700 },
    text:  { x: 1800, yStart: 800, w: 550, minY:  1450 } },
  // Bloque 3 — Base Inconsciente (medio izq) — bloque: x-10 y-80; txt además: x+40 y+100 w-20
  { outer: { x:   95, y: 1560, w: 1120, h: 890 },
    card:  { x:   175, y: 1700, w:  435, h: 680 },
    text:  { x:  650, yStart: 1725, w: 550, minY: 2350, } },
  // Bloque 4 — Consejo Práctico (medio der) — todo: x-10 y-80
  { outer: { x: 1275, y: 1560, w: 1120, h: 890 },
    card:  { x: 1340, y: 1700, w:  430, h: 685 },
    text:  { x: 1800, yStart:  1725, w: 560, minY: 2350 } },
  // Bloque 5 — Tendencia Próxima (ancho completo, abajo) — card: x-25 y+10 w+70; txt: x+40 y+80 w-100
  { outer: { x:   95, y: 2500, w: 2295, h: 610 },
    card:  { x:   200, y: 2530, w:  450, h: 530 },
    text:  { x:  720, yStart: 2680, w: 1600, minY: 3050 } },
];

// ─────────────────────────────────────────────────────────────
// LAYOUT PÁGINA 3 — Síntesis / Mensaje final
// Todos los valores en PÍXELES del template (2480×3508), origen top-left.
// yStart/y = baseline primera línea de texto (desde arriba).
// minY = límite inferior del texto (máximo y desde arriba).
// ─────────────────────────────────────────────────────────────
const P3: P3Layout = {
  // Box 1 — Resumen de tu Tirada
  resumen:      { x: 280, yStart:  780, width: 1900, minY: 1200, fontSize: 40 },

  // Box 2 — Mensaje personal para [Nombre]
  mensajeFinal: { x: 280, yStart: 1550, width: 1950, minY: 1850, fontSize: 40 },

  // Box 3 — Claves prácticas (3 ítems, íconos quemados a la izq)
  proximosPasos: [
    { x: 420, y: 2150, width: 1900, minY: 2300 },
    { x: 420, y: 2350, width: 1900, minY: 2450 },
    { x: 420, y: 2550, width: 1900, minY: 2650 },
  ],

  // Recordatorio cósmico — caja oscura, texto itálica
  recordatorio: { x: 540, y: 2940, width: 1410, fontSize: 40 },
};

// ── Interfaces ───────────────────────────────────────────────
interface Fonts { bold: PDFFont; reg: PDFFont; ita: PDFFont; bita: PDFFont; }
type Rgb = ReturnType<typeof rgb>;
// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

// ── Logging ──────────────────────────────────────────────────
async function log(
  ordenId: string | null, evento: string,
  nivel: "debug" | "info" | "warning" | "error" | "critical",
  mensaje: string, payload: unknown = {}, duracion_ms?: number,
) {
  if (nivel === "debug") {
    try {
      const { data: dbgCfg } = await supabase
        .from("tarot_configuracion").select("valor").eq("clave", "debug_mode").maybeSingle();
      if (dbgCfg?.valor !== "true") return;
    } catch { return; }
  }
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId, evento, nivel, mensaje,
      payload: payload ?? {}, funcion_origen: FN,
      duracion_ms: duracion_ms ?? null,
    });
  } catch (e) { console.error("tarot_logs insert fallo:", e); }
}

// ── Helpers de texto ─────────────────────────────────────────
function sanitize(text: string): string {
  return (text ?? "")
    .replace(/'|'/g, "'")
    .replace(/"|"/g, '"')
    .replace(/—/g,  " - ")
    .replace(/–/g,  "-")
    .replace(/…/g,  "...")
    .replace(/•/g,  "-")
    .replace(/\u{FFFD}/gu, "")
    .replace(/[^\x00-\xFF]/g, "");
}

function formatDateISO(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of sanitize(text).split(/\n+/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        out.push(line); line = w;
      } else { line = test; }
    }
    if (line) out.push(line);
  }
  return out;
}

function drawWrapped(
  page: PDFPage, text: string,
  x: number, startY: number,
  font: PDFFont, size: number, color: Rgb,
  maxW: number, lh = size * 1.45, minY = 30,
): number {
  let y = startY;
  for (const line of wrapText(text, font, size, maxW)) {
    if (y < minY) break;
    if (line) page.drawText(line, { x, y, font, size, color });
    y -= lh;
  }
  return y;
}

function drawCentered(
  page: PDFPage, text: string,
  areaX: number, y: number, areaWidth: number,
  font: PDFFont, size: number, color: Rgb,
) {
  const s = sanitize(text);
  if (!s) return;
  const w = font.widthOfTextAtSize(s, size);
  const x = w < areaWidth ? areaX + (areaWidth - w) / 2 : areaX;
  page.drawText(s, { x, y, font, size, color });
}

// Reduce el fontSize hasta que el texto entre en maxWidthPt, con un mínimo de minSize.
function fitFontSize(
  text: string, font: PDFFont,
  maxWidthPt: number, maxSize: number, minSize = 14,
): number {
  const s = sanitize(text);
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(s, size) > maxWidthPt) {
    size -= 0.5;
  }
  return size;
}

function fitTextToBox(
  text: string,
  font: PDFFont,
  maxW: number,
  maxH: number,
  maxSize: number,
  minSize: number,
  lineHeightRatio = 1.45,
): number {
  const s = sanitize(text);
  let size = maxSize;
  while (size > minSize) {
    const lh    = size * lineHeightRatio;
    const lines = wrapText(s, font, size, maxW);
    const totalH = lines.length * lh;
    if (totalH <= maxH) return size;
    size -= 0.5;
  }
  return minSize;
}

// ── Helpers de imagen ────────────────────────────────────────
async function downloadStorageImage(bucket: string, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      console.error(`Storage download [${bucket}/${path}]:`, error?.message ?? "sin data");
      return null;
    }
    return new Uint8Array(await data.arrayBuffer());
  } catch (e) {
    console.error(`Storage download exception [${bucket}/${path}]:`, e);
    return null;
  }
}

async function embedImage(
  pdfDoc: PDFDocument, bytes: Uint8Array, path: string,
): Promise<PDFImage | null> {
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    if (isPng) return await pdfDoc.embedPng(bytes);
    if (isJpg) return await pdfDoc.embedJpg(bytes);
    const lower = path.toLowerCase();
    if (lower.endsWith(".png"))  return await pdfDoc.embedPng(bytes);
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return await pdfDoc.embedJpg(bytes);
    return null;
  } catch (e) {
    console.error(`embedImage error [${path}]:`, e);
    return null;
  }
}

// Escala imagen para cubrir toda la página A4 (CSS cover).
// Usado en páginas 2 y 3 cuyos fondos tienen aspect ratio distinto al A4.
function drawBackgroundCover(page: PDFPage, image: PDFImage) {
  const { width: imgW, height: imgH } = image;
  const scale = Math.max(PW / imgW, PH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = (PW - drawW) / 2;
  const drawY = (PH - drawH) / 2;
  page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
}

// Ajusta imagen al contenedor manteniendo proporción (CSS contain).
function drawImageContain(
  page: PDFPage, image: PDFImage,
  box: { x: number; y: number; width: number; height: number },
) {
  const { width: imgW, height: imgH } = image;
  const scale = Math.min(box.width / imgW, box.height / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = box.x + (box.width  - drawW) / 2;
  const drawY = box.y + (box.height - drawH) / 2;
  page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
}

function drawCardPlaceholder(
  page: PDFPage,
  box: { x: number; y: number; width: number; height: number },
  f: Fonts,
) {
  page.drawRectangle({
    x: box.x, y: box.y, width: box.width, height: box.height,
    color: rgb(0.30, 0.18, 0.50), borderColor: rgb(0.72, 0.55, 0.10), borderWidth: 1,
  });
  const lbl = "Carta";
  const lw  = f.ita.widthOfTextAtSize(lbl, 8);
  page.drawText(lbl, {
    x: box.x + (box.width - lw) / 2, y: box.y + box.height / 2 - 4,
    font: f.ita, size: 8, color: rgb(0.72, 0.55, 0.10),
  });
}

// ─────────────────────────────────────────────────────────────
// DEBUG MODE — dibuja sobre el PDF:
//   • Grilla de coordenadas cada 50pt (líneas grises)
//   • Recuadros de colores para cada zona de texto/imagen
//   • Labels con nombre de zona y coords
// Activar con { "debug": true } en el body del request.
// ─────────────────────────────────────────────────────────────
function drawDebugGrid(page: PDFPage, f: Fonts) {
  const gridColor  = rgb(0.6, 0.0, 0.0);
  const labelColor = rgb(0.8, 0.0, 0.0);
  const step = 50;

  for (let x = 0; x <= PW; x += step) {
    page.drawLine({ start: { x, y: 0 }, end: { x, y: PH },
      thickness: 0.3, color: gridColor, opacity: 0.4 });
    page.drawText(String(x), { x: x + 1, y: 4, font: f.reg, size: 5, color: labelColor });
  }
  for (let y = 0; y <= PH; y += step) {
    page.drawLine({ start: { x: 0, y }, end: { x: PW, y },
      thickness: 0.3, color: gridColor, opacity: 0.4 });
    page.drawText(String(Math.round(y)), { x: 2, y: y + 1, font: f.reg, size: 5, color: labelColor });
  }
}

function drawDebugBox(
  page: PDFPage, f: Fonts,
  box: { x: number; y: number; w: number; h: number },
  label: string, color: Rgb,
) {
  page.drawRectangle({
    x: box.x, y: box.y, width: box.w, height: box.h,
    borderColor: color, borderWidth: 1.5, opacity: 0, borderOpacity: 0.85,
  });
  const lbl = `${label} (${Math.round(box.x)},${Math.round(box.y)}) ${Math.round(box.w)}x${Math.round(box.h)}`;
  page.drawText(lbl, { x: box.x + 2, y: box.y + box.h - 8, font: f.reg, size: 5.5, color });
}

function drawDebugPoint(page: PDFPage, f: Fonts, x: number, y: number, label: string, color: Rgb) {
  page.drawLine({ start: { x: x-4, y }, end: { x: x+4, y }, thickness: 1, color, opacity: 0.9 });
  page.drawLine({ start: { x, y: y-4 }, end: { x, y: y+4 }, thickness: 1, color, opacity: 0.9 });
  page.drawText(`${label}(${Math.round(x)},${Math.round(y)})`, {
    x: x + 3, y: y + 2, font: f.reg, size: 5, color,
  });
}

function addDebugOverlayP1(page: PDFPage, f: Fonts) {
  drawDebugGrid(page, f);

  const C_BLUE   = rgb(0.0, 0.2, 0.9);
  const C_CYAN   = rgb(0.0, 0.7, 0.7);
  const C_RED    = rgb(0.9, 0.1, 0.1);
  const C_ORANGE = rgb(0.9, 0.5, 0.0);
  const C_GREEN  = rgb(0.0, 0.7, 0.2);
  const colors   = [C_RED, C_ORANGE, C_GREEN, C_CYAN, rgb(0.7, 0, 0.7)];

  const T = P1_TITLE;
  const titlePdfY = pY(T.y);
  drawDebugBox(page, f, {
    x: pX(T.x), y: titlePdfY - pX(T.fontSize),
    w: pX(T.width), h: pX(T.fontSize) * 1.6,
  }, "P1_TITLE", C_BLUE);
  drawDebugPoint(page, f, pX(T.x) + pX(T.width) / 2, titlePdfY, "baseline", C_BLUE);

  const B = P1_BIRTH;
  const birthPdfY = pY(B.y);
  drawDebugBox(page, f, {
    x: pX(B.x), y: birthPdfY - pX(B.fontSize),
    w: pX(B.width), h: pX(B.fontSize) * 1.6,
  }, "P1_BIRTH", C_CYAN);

  const labels = ["C1-SitAct", "C2-BaseInc", "C3-Obstac", "C4-Consejo", "C5-Tendenc"];
  for (let i = 0; i < P1_CARDS.length; i++) {
    const s = P1_CARDS[i];
    drawDebugBox(page, f, {
      x: pX(s.x), y: pY(s.y + s.h),
      w: pX(s.w), h: pX(s.h),
    }, labels[i], colors[i]);
  }
}

function addDebugOverlayP2(page: PDFPage, f: Fonts) {
  drawDebugGrid(page, f);
  const blockColors = [
    rgb(0.9, 0.1, 0.1), rgb(0.9, 0.5, 0.0),
    rgb(0.0, 0.7, 0.2), rgb(0.0, 0.4, 0.9),
    rgb(0.7, 0.0, 0.7),
  ];
  const C_CARD = rgb(0.8, 0.8, 0.0);
  const C_TEXT = rgb(0.0, 0.8, 0.8);
  const blockNames = ["B1-SitAct", "B2-Obstac", "B3-BaseInc", "B4-Consejo", "B5-Tendenc"];
  for (let i = 0; i < P2_BLOCKS.length; i++) {
    const bl = P2_BLOCKS[i];
    const c  = blockColors[i];
    drawDebugBox(page, f, {
      x: pX(bl.outer.x), y: pY(bl.outer.y + bl.outer.h),
      w: pX(bl.outer.w), h: pX(bl.outer.h),
    }, blockNames[i], c);
    drawDebugBox(page, f, {
      x: pX(bl.card.x), y: pY(bl.card.y + bl.card.h),
      w: pX(bl.card.w), h: pX(bl.card.h),
    }, `card${i+1}`, C_CARD);
    const textPdfYStart = pY(bl.text.yStart);
    const textPdfMinY   = pY(bl.text.minY);
    drawDebugBox(page, f, {
      x: pX(bl.text.x), y: textPdfMinY,
      w: pX(bl.text.w), h: textPdfYStart - textPdfMinY,
    }, `txt${i+1}`, C_TEXT);
    drawDebugPoint(page, f, pX(bl.text.x), textPdfYStart, `yStart${i+1}`, C_TEXT);
  }
}

function addDebugOverlayP3(page: PDFPage, f: Fonts) {
  drawDebugGrid(page, f);
  const C_RED    = rgb(0.9, 0.1, 0.1);
  const C_ORANGE = rgb(0.9, 0.5, 0.0);
  const C_GREEN  = rgb(0.0, 0.7, 0.2);
  const C_PURP   = rgb(0.6, 0.0, 0.8);

  const resYStart = pY(P3.resumen.yStart);
  const resMinY   = pY(P3.resumen.minY);
  drawDebugBox(page, f, {
    x: pX(P3.resumen.x), y: resMinY,
    w: pX(P3.resumen.width), h: resYStart - resMinY,
  }, "RESUMEN", C_RED);
  drawDebugPoint(page, f, pX(P3.resumen.x), resYStart, "resStart", C_RED);

  const mfYStart = pY(P3.mensajeFinal.yStart);
  const mfMinY   = pY(P3.mensajeFinal.minY);
  drawDebugBox(page, f, {
    x: pX(P3.mensajeFinal.x), y: mfMinY,
    w: pX(P3.mensajeFinal.width), h: mfYStart - mfMinY,
  }, "MSG_FINAL", C_ORANGE);
  drawDebugPoint(page, f, pX(P3.mensajeFinal.x), mfYStart, "mfStart", C_ORANGE);

  for (let i = 0; i < P3.proximosPasos.length; i++) {
    const pp    = P3.proximosPasos[i];
    const ppY   = pY(pp.y);
    const ppMin = pY(pp.minY);
    drawDebugBox(page, f, {
      x: pX(pp.x), y: ppMin,
      w: pX(pp.width), h: ppY - ppMin,
    }, `PASO${i+1}`, C_GREEN);
    drawDebugPoint(page, f, pX(pp.x), ppY, `p${i+1}Start`, C_GREEN);
  }

  const recPdfY = pY(P3.recordatorio.y);
  drawDebugBox(page, f, {
    x: pX(P3.recordatorio.x), y: recPdfY - pX(P3.recordatorio.fontSize) * 3,
    w: pX(P3.recordatorio.width), h: pX(P3.recordatorio.fontSize) * 4,
  }, "RECORDATORIO", C_PURP);

}

// ── Página 1: Tirada visual ───────────────────────────────────
function addPage1(
  pdfDoc: PDFDocument,
  bgImage: PDFImage | null,
  cardImages: Array<PDFImage | null>,
  c: Json,
  f: Fonts,
  debug: boolean,
) {
  const p = pdfDoc.addPage([PW, PH]);

  // Fondo — página 1 el JPEG tiene proporciones A4 exactas (dibujado directo)
  if (bgImage) {
    p.drawImage(bgImage, { x: 0, y: 0, width: PW, height: PH });
  } else {
    p.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(0.10, 0.05, 0.20) });
  }

  // Título dinámico — centrado horizontal y vertical en el scroll
  const T = P1_TITLE;
  const titleText = "Tirada para " + sanitize(c.nombre ?? "");
  const titleSize = fitFontSize(titleText, f.bold, pX(T.width), pX(T.fontSize), pX(T.minFontSize));
  const titleY    = pY(T.y) - pX(T.fontSize) * 0.2;
  drawCentered(p, titleText, pX(T.x), titleY, pX(T.width), f.bold, titleSize, C_DARK_BROWN);

  // Fecha de nacimiento — centrada h+v, negrita, prefijo "Fecha de nacimiento"
  const B = P1_BIRTH;
  const fechaRaw  = c.fecha_nacimiento
    ? formatDateISO(sanitize(c.fecha_nacimiento))
    : sanitize(c.fecha_lectura ?? "");
  const birthText = fechaRaw ? `Fecha de nacimiento ${fechaRaw}` : "";
  if (birthText) {
    const birthY = pY(B.y) - pX(B.fontSize) * 0.2;
    drawCentered(p, birthText, pX(B.x), birthY, pX(B.width), f.bold, pX(B.fontSize), C_GOLD);
  }

  // 5 cartas — fill 100% del slot
  const cartas: Json[] = c.cartas ?? [];
  for (let i = 0; i < 5; i++) {
    const slot  = P1_CARDS[i];
    const img   = cardImages[i] ?? null;

    // Convierte top-left px → bottom-left PDF para drawImage
    const pdfX = pX(slot.x);
    const pdfY = pY(slot.y + slot.h);
    const pdfW = pX(slot.w);
    const pdfH = pX(slot.h);

    if (img) {
      p.drawImage(img, { x: pdfX, y: pdfY, width: pdfW, height: pdfH });
    } else {
      drawCardPlaceholder(p, { x: pdfX, y: pdfY, width: pdfW, height: pdfH }, f);
    }
  }

  if (debug) addDebugOverlayP1(p, f);
}

// ── Página 2: Interpretaciones con imagen de carta ────────────
function addPage2(
  pdfDoc: PDFDocument,
  bgImage: PDFImage | null,
  cardImages: Array<PDFImage | null>,
  c: Json,
  f: Fonts,
  debug: boolean,
) {
  const p = pdfDoc.addPage([PW, PH]);

  if (bgImage) {
    drawBackgroundCover(p, bgImage);
  } else {
    p.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(0.97, 0.95, 0.90) });
  }

  const cartas: Json[] = c.cartas ?? [];

  for (let i = 0; i < 5; i++) {
    const bl    = P2_BLOCKS[i];
    const carta = cartas[i] ?? {};
    const img   = cardImages[i] ?? null;

    // Imagen de carta (thumbnail) — convierte px box a PDF coords
    const cardBox = {
      x: pX(bl.card.x),
      y: pY(bl.card.y + bl.card.h),
      width:  pX(bl.card.w),
      height: pX(bl.card.h),
    };
    if (img) {
      p.drawImage(img, { x: cardBox.x, y: cardBox.y, width: cardBox.width, height: cardBox.height });
    } else {
      drawCardPlaceholder(p, cardBox, f);
    }

    const textX      = pX(bl.text.x);
    const textMaxW   = pX(bl.text.w);
    const textStartY = pY(bl.text.yStart);
    const textMinY   = pY(bl.text.minY);

    // Nombre de carta (tamaño fijo, siempre entra)
    const isInv    = carta.orientacion === "invertida" || carta.invertida === true;
    const cardLine = sanitize(carta.nombre_carta ?? carta.carta ?? "") + (isInv ? " (Inv.)" : "");
    const nameSize  = 9;
    const nameLH    = 12;
    // Baja la baseline para que los ascendentes queden dentro del box
    const nameDrawY = textStartY - nameSize * 0.75;
    const afterName = drawWrapped(p, cardLine,
      textX, nameDrawY, f.bita, nameSize, C_DARK_BROWN, textMaxW, nameLH, nameDrawY - 14);

    // Interpretación — auto-fit: calcula el font size que hace
    // entrar el texto completo en el espacio disponible del bloque.
    const interp      = sanitize(carta.interpretacion ?? "");
    const boxH        = afterName - textMinY - 4;
    const interpSize  = fitTextToBox(interp, f.reg, textMaxW, boxH, 8.5, 6.5);
    const interpLH    = interpSize * 1.45;
    const afterInterp = drawWrapped(p, interp,
      textX, afterName - 3, f.reg, interpSize, C_DARK_BROWN, textMaxW, interpLH, textMinY);

    // Consejo solo en bloque 5 si queda espacio (también auto-fit)
    if (i === 4 && carta.consejo && afterInterp > textMinY + 14) {
      const consejo     = sanitize(carta.consejo);
      const consejoH    = afterInterp - textMinY - 5;
      const consejoSize = fitTextToBox(consejo, f.ita, textMaxW, consejoH, 8.0, 6.5);
      const consejoLH   = consejoSize * 1.45;
      drawWrapped(p, consejo,
        textX, afterInterp - 5, f.ita, consejoSize, C_TEXT_MED, textMaxW, consejoLH, textMinY);
    }
  }

  if (debug) addDebugOverlayP2(p, f);
}

// ── Página 3: Síntesis ────────────────────────────────────────
function addPage3(
  pdfDoc: PDFDocument,
  bgImage: PDFImage | null,
  c: Json,
  f: Fonts,
  debug: boolean,
) {
  const p = pdfDoc.addPage([PW, PH]);

  if (bgImage) {
    drawBackgroundCover(p, bgImage);
  } else {
    p.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(0.10, 0.05, 0.20) });
  }

  const L  = P3;
  const CT = C_DARK_BROWN;

  // Box 1 — Resumen (auto-fit, baseline desplazada para contener ascendentes)
  const resumenText  = sanitize(c.resumen_lectura ?? "");
  const resumenMaxW  = pX(L.resumen.width);
  const resumenTopY  = pY(L.resumen.yStart);
  const resumenBotY  = pY(L.resumen.minY);
  const resumenMaxS  = pX(L.resumen.fontSize);
  const resumenSize  = fitTextToBox(resumenText, f.reg,
    resumenMaxW, resumenTopY - resumenBotY - resumenMaxS * 0.75, resumenMaxS, 7.0);
  const resumenDrawY = resumenTopY - resumenSize * 0.75;
  drawWrapped(p, resumenText,
    pX(L.resumen.x), resumenDrawY, f.reg, resumenSize, CT,
    resumenMaxW, resumenSize * 1.45, resumenBotY);

  // Box 2 — Mensaje personal (auto-fit, baseline desplazada para contener ascendentes)
  const mensajeText  = sanitize(c.mensaje_final ?? "");
  const mensajeMaxW  = pX(L.mensajeFinal.width);
  const mensajeTopY  = pY(L.mensajeFinal.yStart);
  const mensajeBotY  = pY(L.mensajeFinal.minY);
  const mensajeMaxS  = pX(L.mensajeFinal.fontSize);
  const mensajeSize  = fitTextToBox(mensajeText, f.ita,
    mensajeMaxW, mensajeTopY - mensajeBotY - mensajeMaxS * 0.75, mensajeMaxS, 7.0);
  const mensajeDrawY = mensajeTopY - mensajeSize * 0.75;
  drawWrapped(p, mensajeText,
    pX(L.mensajeFinal.x), mensajeDrawY, f.ita, mensajeSize, CT,
    mensajeMaxW, mensajeSize * 1.45, mensajeBotY);

  // Box 3 — Próximos pasos (auto-fit por ítem, baseline desplazada)
  const pasos: string[] = Array.isArray(c.proximos_pasos) ? c.proximos_pasos : [];
  for (let i = 0; i < 3; i++) {
    const paso = pasos[i];
    if (!paso) continue;
    const pp        = L.proximosPasos[i];
    const pasoTxt   = sanitize(paso);
    const pasoMaxW  = pX(pp.width);
    const pasoTopY  = pY(pp.y);
    const pasoBotY  = pY(pp.minY);
    const pasoSize  = fitTextToBox(pasoTxt, f.reg,
      pasoMaxW, pasoTopY - pasoBotY - 9 * 0.75, 9, 7.0);
    const pasoDrawY = pasoTopY - pasoSize * 0.75;
    drawWrapped(p, pasoTxt,
      pX(pp.x), pasoDrawY, f.reg, pasoSize, CT,
      pasoMaxW, pasoSize * 1.45, pasoBotY);
  }

  // Recordatorio cósmico
  const recStr = sanitize(c.recordatorio_cosmico ?? c.mensaje_final ?? "");
  const recPdfY = pY(L.recordatorio.y);
  if (recStr) {
    drawWrapped(p, recStr,
      pX(L.recordatorio.x), recPdfY, f.ita, pX(L.recordatorio.fontSize), C_CREAM,
      pX(L.recordatorio.width), pX(L.recordatorio.fontSize) * 1.5, recPdfY - 40 - pX(20));
  }

  if (debug) addDebugOverlayP3(p, f);
}

// ── Mazo por defecto ─────────────────────────────────────────
const DEFAULT_DECK_SLUG  = "rws-classic";
const DEFAULT_MAZO_ID    = "a1000000-0000-0000-0000-000000000001";

// Resuelve el slug del deck a un mazo_id válido.
// Si el slug no existe o no está activo → fallback a rws-classic + warning.
async function resolveDeck(slug: string | null): Promise<{
  mazoId: string; deckUsado: string; warning?: string;
}> {
  const fallback = { mazoId: DEFAULT_MAZO_ID, deckUsado: DEFAULT_DECK_SLUG };

  if (!slug || slug === DEFAULT_DECK_SLUG) return fallback;

  const { data } = await supabase
    .from("tarot_mazos")
    .select("id, slug")
    .eq("slug", slug)
    .eq("activo", true)
    .maybeSingle();

  if (!data?.id) {
    return {
      ...fallback,
      warning: `El mazo "${slug}" no existe o no está activo — se generó con el mazo "${DEFAULT_DECK_SLUG}".`,
    };
  }

  return { mazoId: data.id, deckUsado: slug };
}

// ── Lógica principal ─────────────────────────────────────────
async function generarPDF(
  ordenId: string, lecturaIdParam?: string, force = false, debug = false,
  mazoId: string = DEFAULT_MAZO_ID,
): Promise<void> {
  const t0 = Date.now();

  const { data: orden, error: errOrden } = await supabase
    .from("tarot_ordenes")
    .select("id, estado, cliente_id")
    .eq("id", ordenId)
    .maybeSingle();

  if (errOrden || !orden?.id) {
    await log(ordenId, "pdf_orden_no_encontrada", "error", "Orden no encontrada",
      { error: errOrden?.message });
    return;
  }

  const LISTOS = new Set(["pdf_listo", "enviando_whatsapp", "entregado"]);
  if (!force && LISTOS.has(orden.estado)) {
    await log(ordenId, "pdf_duplicado_ignorado", "info",
      "PDF ya listo - ignorando (usa force=true para regenerar)", { estado: orden.estado });
    return;
  }

  const VALIDOS = new Set(["lectura_lista", "error_pdf", "pdf_listo", "enviando_whatsapp", "entregado"]);
  if (!VALIDOS.has(orden.estado)) {
    await log(ordenId, "pdf_estado_invalido", "warning",
      "Estado '" + orden.estado + "' no permite generar PDF");
    return;
  }

  const { data: lectura, error: errLectura } = await supabase
    .from("tarot_lecturas")
    .select("id, contenido_json")
    .eq("orden_id", ordenId)
    .eq("es_vigente", true)
    .maybeSingle();

  if (errLectura || !lectura?.id) {
    await log(ordenId, "pdf_lectura_no_encontrada", "error", "Lectura vigente no encontrada",
      { lectura_id: lecturaIdParam, error: errLectura?.message });
    return;
  }

  const lecturaId = lectura.id;
  const contenido = lectura.contenido_json as Json;

  if (!contenido || !Array.isArray(contenido.cartas) || contenido.cartas.length !== 5) {
    await log(ordenId, "pdf_contenido_invalido", "error", "contenido_json inválido o incompleto",
      { lectura_id: lecturaId });
    return;
  }

  const { count: previos } = await supabase
    .from("tarot_pdfs")
    .select("*", { count: "exact", head: true })
    .eq("orden_id", ordenId);

  const { data: cfgRows } = await supabase
    .from("tarot_configuracion")
    .select("clave, valor")
    .in("clave", ["storage_bucket_pdfs", "pdf_url_expiracion_horas", "max_reintentos_pdf"])
    .eq("activo", true);

  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.clave] = r.valor;

  const bucket   = cfg.storage_bucket_pdfs         || "tarot-pdfs";
  const expHoras = Number(cfg.pdf_url_expiracion_horas) || 48;
  const maxR     = Number(cfg.max_reintentos_pdf)        || 2;
  const intento  = (previos ?? 0) + 1;
  const ahora    = new Date().toISOString();

  if (!force && intento > maxR) {
    await log(ordenId, "pdf_max_reintentos", "critical",
      "Reintentos agotados para generación PDF", { previos, maxR });
    await supabase.from("tarot_ordenes")
      .update({ estado: "error_critico", updated_at: ahora }).eq("id", ordenId);
    return;
  }

  // En debug no tocamos el estado de la orden para poder volver a llamar sin reseteo manual
  if (!debug) {
    await supabase.from("tarot_ordenes")
      .update({ estado: "generando_pdf", updated_at: ahora }).eq("id", ordenId);
  }

  const { data: pdfRow, error: errInsert } = await supabase
    .from("tarot_pdfs")
    .insert({
      orden_id: ordenId, lectura_id: lecturaId,
      estado: "generando", numero_intento: intento, plantilla_usada: PLANTILLA,
    })
    .select("id").single();

  if (errInsert || !pdfRow?.id) {
    await log(ordenId, "pdf_insert_error", "error", "No se pudo crear registro tarot_pdfs",
      { error: errInsert?.message });
    return;
  }
  const pdfId = pdfRow.id;

  await log(ordenId, "pdf_iniciado", "info",
    `Iniciando generación PDF v7 ${PLANTILLA}${debug ? " [DEBUG]" : ""} (intento ${intento}/${maxR}) deck=${mazoId}`,
    { pdf_id: pdfId, lectura_id: lecturaId, force, debug, mazo_id: mazoId });

  try {
    // ── Resolver imagen_storage_path por nombre_es ────────────
    const nombresCartas: string[] = contenido.cartas
      .map((cc: Json) => sanitize(cc.nombre_carta ?? cc.carta ?? ""))
      .filter(Boolean);

    const { data: cartasDB } = await supabase
      .from("tarot_cartas")
      .select("nombre_es, imagen_storage_path, imagen_url")
      .in("nombre_es", nombresCartas)
      .eq("mazo_id", mazoId);

    const cartaImageMap = new Map<string, string>();
    for (const cc of cartasDB ?? []) {
      const path = cc.imagen_storage_path ?? cc.imagen_url ?? "";
      if (path) cartaImageMap.set(cc.nombre_es, path);
    }

    // Fallback para nombres no encontrados en el deck solicitado:
    // busca el equivalente por posición estructural (arcano/palo/numero/carta_corte).
    // Cubre diferencias de nomenclatura entre mazos (ej: "Paje" ↔ "Sota",
    // "El Sumo Sacerdote" ↔ "El Hierofante").
    const missingNames = nombresCartas.filter(n => !cartaImageMap.has(n));
    if (missingNames.length > 0) {
      const { data: refCards } = await supabase
        .from("tarot_cartas")
        .select("nombre_es, arcano, palo, numero, carta_corte")
        .in("nombre_es", missingNames);

      for (const ref of (refCards ?? []) as Array<{
        nombre_es: string; arcano: string; palo: string | null;
        numero: number | null; carta_corte: string | null;
      }>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabase
          .from("tarot_cartas")
          .select("nombre_es, imagen_storage_path, imagen_url")
          .eq("mazo_id", mazoId)
          .eq("arcano", ref.arcano);

        if (ref.arcano === "mayor") {
          q = q.eq("numero", ref.numero);
        } else if (ref.carta_corte) {
          q = q.eq("palo", ref.palo).eq("carta_corte", ref.carta_corte);
        } else {
          q = q.eq("palo", ref.palo).eq("numero", ref.numero);
        }

        const { data: equiv } = await q.maybeSingle() as {
          data: { nombre_es: string; imagen_storage_path: string | null; imagen_url: string | null } | null
        };
        const path = equiv?.imagen_storage_path ?? equiv?.imagen_url ?? "";
        if (path) {
          cartaImageMap.set(ref.nombre_es, path);
          await log(ordenId, "carta_imagen_fallback", "info",
            `Imagen resuelta por posición estructural: "${ref.nombre_es}" → "${equiv?.nombre_es}"`,
            { original: ref.nombre_es, equivalente: equiv?.nombre_es, path });
        }
      }
    }

    // ── Descargar templates v2 en paralelo ───────────────────
    const [bgP1Bytes, bgP2Bytes, bgP3Bytes] = await Promise.all([
      downloadStorageImage(BUCKET_ASSETS, `templates/${PLANTILLA}/page1-bg.jpg`),
      downloadStorageImage(BUCKET_ASSETS, `templates/${PLANTILLA}/card-detail-bg.jpg`),
      downloadStorageImage(BUCKET_ASSETS, `templates/${PLANTILLA}/summary-bg.jpg`),
    ]);

    if (!bgP1Bytes || !bgP2Bytes || !bgP3Bytes) {
      await log(ordenId, "pdf_templates_faltantes", "warning",
        "Uno o más templates no disponibles — se usa fondo de color",
        { p1: !!bgP1Bytes, p2: !!bgP2Bytes, p3: !!bgP3Bytes });
    }

    // ── Descargar imágenes de cartas en paralelo ─────────────
    const cardBytes = await Promise.all(
      contenido.cartas.map(async (carta: Json) => {
        const nombre      = sanitize(carta.nombre_carta ?? carta.carta ?? "");
        const storagePath = cartaImageMap.get(nombre);
        if (!storagePath) {
          await log(ordenId, "carta_imagen_faltante", "warning",
            "Sin imagen_storage_path para carta: " + nombre, { nombre_carta: nombre });
          return null;
        }
        return downloadStorageImage(BUCKET_ASSETS, storagePath);
      }),
    );

    // ── Construir PDF ─────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle("Tu Tirada Cosmica");
    pdfDoc.setAuthor("Tu Horoscopo Cosmico");
    pdfDoc.setSubject("Lectura de Tarot para " + sanitize(contenido.nombre ?? ""));
    pdfDoc.setCreationDate(new Date());

    const fonts: Fonts = {
      bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      reg:  await pdfDoc.embedFont(StandardFonts.TimesRoman),
      ita:  await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      bita: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    };

    const bgP1 = bgP1Bytes ? await embedImage(pdfDoc, bgP1Bytes, "page1-bg.jpg")       : null;
    const bgP2 = bgP2Bytes ? await embedImage(pdfDoc, bgP2Bytes, "card-detail-bg.jpg") : null;
    const bgP3 = bgP3Bytes ? await embedImage(pdfDoc, bgP3Bytes, "summary-bg.jpg")     : null;

    const cardImages = await Promise.all(
      cardBytes.map(async (bytes, i) => {
        if (!bytes) return null;
        const nombre = sanitize(contenido.cartas[i].nombre_carta ?? contenido.cartas[i].carta ?? "");
        const path   = cartaImageMap.get(nombre) ?? "";
        return embedImage(pdfDoc, bytes, path);
      }),
    );

    addPage1(pdfDoc, bgP1, cardImages, contenido, fonts, debug);
    addPage2(pdfDoc, bgP2, cardImages, contenido, fonts, debug);
    addPage3(pdfDoc, bgP3, contenido, fonts, debug);

    const bytes = await pdfDoc.save();

    // ── Subir a Storage ───────────────────────────────────────
    const now        = new Date();
    const yyyy       = now.getFullYear();
    const mm         = String(now.getMonth() + 1).padStart(2, "0");
    const dd         = String(now.getDate()).padStart(2, "0");
    const hh         = String(now.getHours()).padStart(2, "0");
    const min        = String(now.getMinutes()).padStart(2, "0");
    const nombreSafe = sanitize(contenido.nombre ?? "usuario")
      .replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
    const fileSuffix = debug ? "_debug" : "";
    const fileName   = `${yyyy}${mm}${dd}:${hh}:${min}_${nombreSafe}${fileSuffix}.pdf`;
    const storagePath = `${yyyy}/${mm}/${dd}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) throw new Error("Storage upload: " + uploadErr.message);

    const expSeg = expHoras * 3600;
    const { data: signed, error: signedErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, expSeg);

    if (signedErr || !signed?.signedUrl) {
      throw new Error("Signed URL: " + (signedErr?.message ?? "sin URL"));
    }

    const urlFirmada  = signed.signedUrl;
    const urlExpiraAt = new Date(Date.now() + expSeg * 1000).toISOString();
    const ahoraNow    = new Date().toISOString();

    if (!debug) {
      await supabase.from("tarot_pdfs").update({
        estado: "listo",
        storage_path: storagePath, storage_bucket: bucket, storage_url: urlFirmada,
        url_expira_at: urlExpiraAt, tamano_bytes: bytes.length,
        paginas: 3, generado_at: ahoraNow, updated_at: ahoraNow,
      }).eq("id", pdfId);

      await supabase.from("tarot_ordenes")
        .update({ estado: "pdf_listo", updated_at: ahoraNow }).eq("id", ordenId);
    } else {
      await supabase.from("tarot_pdfs").update({
        estado: "debug",
        storage_path: storagePath, storage_bucket: bucket, storage_url: urlFirmada,
        tamano_bytes: bytes.length, generado_at: ahoraNow, updated_at: ahoraNow,
      }).eq("id", pdfId);
    }

    const durMs = Date.now() - t0;
    await log(ordenId, debug ? "pdf_debug_generado" : "pdf_generado", "info",
      `PDF v7 ${debug ? "DEBUG" : ""} generado y subido`,
      { pdf_id: pdfId, storage_path: storagePath, url: urlFirmada,
        tamano_bytes: bytes.length, debug, duracion_ms: durMs }, durMs);

    // Sprint 5 — Disparar envío WhatsApp (fire-and-forget, solo en modo normal)
    if (!debug) {
      const internalHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-internal-key": TAROT_INTERNAL_KEY,
      };

      fetch(`${SUPABASE_URL}/functions/v1/ef_tarot_enviar_whatsapp`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({ orden_id: ordenId }),
      }).catch(() => { /* fire-and-forget */ });

      // Email con PDF — solo actúa si el cliente tiene email y RESEND_API_KEY está configurada
      fetch(`${SUPABASE_URL}/functions/v1/ef_tarot_enviar_email`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({ orden_id: ordenId }),
      }).catch(() => { /* fire-and-forget */ });
    }

  } catch (err) {
    const errMsg   = String(err);
    const ahoraNow = new Date().toISOString();

    await supabase.from("tarot_pdfs").update({
      estado: "error", error_codigo: "PDF_ERROR",
      error_mensaje: errMsg.substring(0, 500), updated_at: ahoraNow,
    }).eq("id", pdfId);

    const estadoOrden = (!force && intento >= maxR) ? "error_critico" : "error_pdf";
    await supabase.from("tarot_ordenes")
      .update({ estado: estadoOrden, updated_at: ahoraNow }).eq("id", ordenId);

    const durMs = Date.now() - t0;
    await log(ordenId, "pdf_error", "error",
      "Error generando PDF v7 (intento " + intento + "/" + maxR + ")",
      { error: errMsg, pdf_id: pdfId, intento, estado_orden: estadoOrden, duracion_ms: durMs },
      durMs);
  }
}

// ── Router ────────────────────────────────────────────────────
serve(async (req) => {
  const key = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || key !== TAROT_INTERNAL_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON_INVALIDO" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const ordenId = String(body?.orden_id ?? "").trim();
  if (!ordenId) {
    return new Response(JSON.stringify({ ok: false, error: "ORDEN_ID_REQUERIDO" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const lecturaId = body?.lectura_id ? String(body.lectura_id) : undefined;
  const force     = body?.force === true;
  const debug     = body?.debug === true;
  const deckSlug  = body?.deck ? String(body.deck).trim().toLowerCase() : null;

  const { mazoId, deckUsado, warning: deckWarning } = await resolveDeck(deckSlug);

  generarPDF(ordenId, lecturaId, force, debug, mazoId).catch((err) => {
    console.error(FN + " fatal para orden " + ordenId + ":", err);
  });

  const respuesta: Record<string, unknown> = {
    ok:     true,
    mensaje: debug ? "Generando PDF (modo debug)" : "Generando PDF",
    deck:   deckUsado,
  };
  if (deckWarning) respuesta.deck_warning = deckWarning;

  return new Response(
    JSON.stringify(respuesta),
    { status: 202, headers: { "Content-Type": "application/json" } });
});
