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
  title:         TitleZone;
  subtitle:      InlineZone;
  resumen:       BodyZone;
  mensajeFinal:  BodyZone;
  proximosPasos: StepZone[];
  recordatorio:  InlineZone;
  disclaimer:    InlineZone;
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
  x: 563, y: 258,
  width: 1667,
  fontSize: 108,  // px → ~26pt en PDF
  minFontSize: 58, // px → ~14pt en PDF
};

// Fecha de nacimiento (valor solo; label "Fecha de nacimiento:" quemado en template).
const P1_BIRTH: BirthZone = {
  x: 375, y: 550,
  width: 250,
  fontSize: 50, // px → 12pt en PDF
};

// Slots de las 5 cartas.
// x,y = esquina top-left en px. w,h = dimensiones en px.
const P1_CARDS: CardSlot[] = [
  // Carta 1 — Situación Actual (centro alto)
  { x: 1042, y:  625, w: 500, h: 725 },
  // Carta 2 — Base Inconsciente (izquierda)
  { x:  342, y:  866, w: 521, h: 929 },
  // Carta 3 — Obstáculo / Desafío (derecha)
  { x: 1733, y: 1200, w: 500, h: 654 },
  // Carta 4 — Consejo Práctico (centro medio)
  { x:  875, y: 1758, w: 500, h: 654 },
  // Carta 5 — Tendencia Próxima (centro bajo)
  { x:  875, y: 2504, w: 500, h: 650 },
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
  { outer: { x:   21, y: 341, w: 1196, h: 592 },
    card:  { x:   46, y: 375, w:  433, h: 546 },
    text:  { x:  500, yStart: 475, w: 700, minY:  925 } },
  // Bloque 2 — Obstáculo / Desafío (arriba der)
  { outer: { x: 1233, y: 341, w: 1208, h: 592 },
    card:  { x: 1258, y: 375, w:  433, h: 546 },
    text:  { x: 1708, yStart: 475, w: 721, minY:  925 } },
  // Bloque 3 — Base Inconsciente (medio izq)
  { outer: { x:   21, y: 943, w: 1196, h: 592 },
    card:  { x:   46, y: 975, w:  433, h: 546 },
    text:  { x:  500, yStart: 1079, w: 700, minY: 1529 } },
  // Bloque 4 — Consejo Práctico (medio der)
  { outer: { x: 1233, y: 943, w: 1208, h: 592 },
    card:  { x: 1258, y: 975, w:  433, h: 546 },
    text:  { x: 1708, yStart: 1079, w: 721, minY: 1529 } },
  // Bloque 5 — Tendencia Próxima (ancho completo, abajo)
  { outer: { x:   21, y: 1549, w: 2429, h: 925 },
    card:  { x:   46, y: 1621, w:  433, h: 883 },
    text:  { x:  500, yStart: 1625, w: 1925, minY: 2466 } },
];

// ─────────────────────────────────────────────────────────────
// LAYOUT PÁGINA 3 — Síntesis / Mensaje final
// Todos los valores en PÍXELES del template (2480×3508), origen top-left.
// yStart/y = baseline primera línea de texto (desde arriba).
// minY = límite inferior del texto (máximo y desde arriba).
// ─────────────────────────────────────────────────────────────
const P3: P3Layout = {
  // Scroll superior: "Mensaje final para [Nombre]"
  title:    { x: 208, y: 250, width: 2063, fontSize: 100, minFontSize: 58 },

  // Subtítulo (tipo_tirada)
  subtitle: { x: 417, y: 475, width: 1646, fontSize: 42 },

  // Box 1 — Resumen de tu Tirada
  resumen:      { x: 146, yStart:  516, width: 2188, minY:  966, fontSize: 40 },

  // Box 2 — Mensaje personal para [Nombre]
  mensajeFinal: { x: 146, yStart: 1080, width: 2188, minY: 1508, fontSize: 40 },

  // Box 3 — Claves prácticas (3 ítems, íconos quemados a la izq)
  proximosPasos: [
    { x: 375, y: 1620, width: 1992, minY: 1874 },
    { x: 375, y: 1895, width: 1992, minY: 2121 },
    { x: 375, y: 2129, width: 1992, minY: 2321 },
  ],

  // Recordatorio cósmico — caja oscura, texto itálica
  recordatorio: { x: 208, y: 2474, width: 2063, fontSize: 35 },

  // Disclaimer al pie
  disclaimer:   { x: 271, y: 3333, width: 1938, fontSize: 29 },
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

function truncate(text: string, maxChars: number): string {
  const t = sanitize(text ?? "");
  return t.length <= maxChars ? t : t.slice(0, maxChars).trimEnd() + "...";
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
  const C_BLUE   = rgb(0.0, 0.2, 0.9);
  const C_CYAN   = rgb(0.0, 0.7, 0.7);
  const C_RED    = rgb(0.9, 0.1, 0.1);
  const C_ORANGE = rgb(0.9, 0.5, 0.0);
  const C_GREEN  = rgb(0.0, 0.7, 0.2);
  const C_PURP   = rgb(0.6, 0.0, 0.8);
  const C_GRAY   = rgb(0.4, 0.4, 0.4);

  const titlePdfY = pY(P3.title.y);
  drawDebugBox(page, f, {
    x: pX(P3.title.x), y: titlePdfY - pX(P3.title.fontSize),
    w: pX(P3.title.width), h: pX(P3.title.fontSize) * 1.6,
  }, "P3_TITLE", C_BLUE);

  const subPdfY = pY(P3.subtitle.y);
  drawDebugBox(page, f, {
    x: pX(P3.subtitle.x), y: subPdfY - pX(P3.subtitle.fontSize),
    w: pX(P3.subtitle.width), h: pX(P3.subtitle.fontSize) * 1.6,
  }, "P3_SUBTITLE", C_CYAN);

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

  const discPdfY = pY(P3.disclaimer.y);
  drawDebugBox(page, f, {
    x: pX(P3.disclaimer.x), y: discPdfY - pX(P3.disclaimer.fontSize) * 3,
    w: pX(P3.disclaimer.width), h: pX(P3.disclaimer.fontSize) * 4,
  }, "DISCLAIMER", C_GRAY);
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

  // Título dinámico en el scroll — auto-shrink si el nombre es largo
  const T = P1_TITLE;
  const titleText = "Tirada para " + sanitize(c.nombre ?? "");
  const titleSize = fitFontSize(titleText, f.bold, pX(T.width), pX(T.fontSize), pX(T.minFontSize));
  drawCentered(p, titleText, pX(T.x), pY(T.y), pX(T.width), f.bold, titleSize, C_DARK_BROWN);

  // Fecha de nacimiento (valor solo; el label "Fecha de nacimiento:" está quemado)
  const B = P1_BIRTH;
  const fechaVal = c.fecha_nacimiento
    ? formatDateISO(sanitize(c.fecha_nacimiento))
    : sanitize(c.fecha_lectura ?? "");
  if (fechaVal) {
    drawCentered(p, fechaVal, pX(B.x), pY(B.y), pX(B.width), f.ita, pX(B.fontSize), C_GOLD);
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
      drawImageContain(p, img, cardBox);
    } else {
      drawCardPlaceholder(p, cardBox, f);
    }

    const textX      = pX(bl.text.x);
    const textMaxW   = pX(bl.text.w);
    const textStartY = pY(bl.text.yStart);
    const textMinY   = pY(bl.text.minY);

    // Nombre de carta
    const isInv    = carta.orientacion === "invertida" || carta.invertida === true;
    const cardLine = sanitize(carta.nombre_carta ?? "") + (isInv ? " (Inv.)" : "");
    const afterName = drawWrapped(p, cardLine,
      textX, textStartY, f.bita, 9, C_DARK_BROWN, textMaxW, 12, textStartY - 14);

    // Interpretación
    const maxInterp   = i === 4 ? 400 : 220;
    const interp      = truncate(carta.interpretacion ?? "", maxInterp);
    const afterInterp = drawWrapped(p, interp,
      textX, afterName - 3, f.reg, 8.5, C_DARK_BROWN, textMaxW, 12, textMinY);

    // Consejo breve solo en bloque 5 si queda espacio
    if (i === 4 && carta.consejo && afterInterp > textMinY + 14) {
      drawWrapped(p, truncate(carta.consejo, 150),
        textX, afterInterp - 5, f.ita, 8, C_TEXT_MED, textMaxW, 11.5, textMinY);
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

  // Título en el scroll — auto-shrink si el nombre es largo
  const p3TitleText = "Mensaje final para " + sanitize(c.nombre ?? "");
  const p3TitleSize = fitFontSize(p3TitleText, f.bold, pX(L.title.width), pX(L.title.fontSize), pX(L.title.minFontSize));
  drawCentered(p, p3TitleText,
    pX(L.title.x), pY(L.title.y), pX(L.title.width), f.bold, p3TitleSize, CT);

  // Subtítulo
  drawCentered(p, sanitize(c.tipo_tirada ?? "Tirada Cosmica de 5 Cartas"),
    pX(L.subtitle.x), pY(L.subtitle.y), pX(L.subtitle.width), f.ita, pX(L.subtitle.fontSize), C_TEXT_MED);

  // Box 1 — Resumen
  drawWrapped(p, truncate(c.resumen_lectura ?? "", 480),
    pX(L.resumen.x), pY(L.resumen.yStart), f.reg, pX(L.resumen.fontSize), CT,
    pX(L.resumen.width), pX(L.resumen.fontSize) * 1.5, pY(L.resumen.minY));

  // Box 2 — Mensaje personal
  drawWrapped(p, truncate(c.mensaje_final ?? "", 480),
    pX(L.mensajeFinal.x), pY(L.mensajeFinal.yStart), f.ita, pX(L.mensajeFinal.fontSize), CT,
    pX(L.mensajeFinal.width), pX(L.mensajeFinal.fontSize) * 1.5, pY(L.mensajeFinal.minY));

  // Box 3 — Próximos pasos (máx 3 ítems, íconos ya quemados en el template)
  const pasos: string[] = Array.isArray(c.proximos_pasos) ? c.proximos_pasos : [];
  for (let i = 0; i < 3; i++) {
    const paso = pasos[i];
    if (!paso) continue;
    const pp = L.proximosPasos[i];
    drawWrapped(p, truncate(paso, 200),
      pX(pp.x), pY(pp.y), f.reg, 9, CT, pX(pp.width), 13, pY(pp.minY));
  }

  // Recordatorio cósmico
  const recStr = sanitize(c.recordatorio_cosmico ?? c.mensaje_final ?? "");
  const recPdfY = pY(L.recordatorio.y);
  if (recStr) {
    drawWrapped(p, truncate(recStr, 180),
      pX(L.recordatorio.x), recPdfY, f.ita, pX(L.recordatorio.fontSize), C_CREAM,
      pX(L.recordatorio.width), pX(L.recordatorio.fontSize) * 1.5, recPdfY - 40);
  }

  // Disclaimer al pie
  const disc = sanitize(c.disclaimer ?? "");
  if (disc) {
    drawWrapped(p, disc,
      pX(L.disclaimer.x), pY(L.disclaimer.y), f.ita, pX(L.disclaimer.fontSize), C_TEXT_MED,
      pX(L.disclaimer.width), pX(L.disclaimer.fontSize) * 1.4, 15);
  }

  if (debug) addDebugOverlayP3(p, f);
}

// ── Lógica principal ─────────────────────────────────────────
async function generarPDF(
  ordenId: string, lecturaIdParam?: string, force = false, debug = false,
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
    `Iniciando generación PDF v7 ${PLANTILLA}${debug ? " [DEBUG]" : ""} (intento ${intento}/${maxR})`,
    { pdf_id: pdfId, lectura_id: lecturaId, force, debug });

  try {
    // ── Resolver imagen_storage_path por nombre_es ────────────
    const nombresCartas: string[] = contenido.cartas
      .map((cc: Json) => sanitize(cc.nombre_carta ?? ""))
      .filter(Boolean);

    const { data: cartasDB } = await supabase
      .from("tarot_cartas")
      .select("nombre_es, imagen_storage_path, imagen_url")
      .in("nombre_es", nombresCartas);

    const cartaImageMap = new Map<string, string>();
    for (const cc of cartasDB ?? []) {
      const path = cc.imagen_storage_path ?? cc.imagen_url ?? "";
      if (path) cartaImageMap.set(cc.nombre_es, path);
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
        const nombre      = sanitize(carta.nombre_carta ?? "");
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
        const nombre = sanitize(contenido.cartas[i].nombre_carta ?? "");
        const path   = cartaImageMap.get(nombre) ?? "";
        return embedImage(pdfDoc, bytes, path);
      }),
    );

    addPage1(pdfDoc, bgP1, cardImages, contenido, fonts, debug);
    addPage2(pdfDoc, bgP2, cardImages, contenido, fonts, debug);
    addPage3(pdfDoc, bgP3, contenido, fonts, debug);

    const bytes = await pdfDoc.save();

    // ── Subir a Storage ───────────────────────────────────────
    const now = new Date();
    const storageSuffix = debug ? "/lectura-tarot-debug.pdf" : "/lectura-tarot.pdf";
    const storagePath =
      now.getFullYear() + "/" +
      String(now.getMonth() + 1).padStart(2, "0") + "/" +
      ordenId + storageSuffix;

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

    // TODO: Sprint 5 — Enviar PDF por WhatsApp
    // if (!debug) { ... }

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

  generarPDF(ordenId, lecturaId, force, debug).catch((err) => {
    console.error(FN + " fatal para orden " + ordenId + ":", err);
  });

  return new Response(
    JSON.stringify({ ok: true, mensaje: debug ? "Generando PDF (modo debug)" : "Generando PDF" }),
    { status: 202, headers: { "Content-Type": "application/json" } });
});
