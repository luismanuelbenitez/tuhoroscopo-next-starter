// ============================================================
// Plantilla premium-v1 del PDF (2026-10-20).
//
// Fondos 2480×3508 (A4 a 300 dpi) en tarot-assets/templates/premium-v1/:
//   page1-bg.jpg (5 cartas + nombre), page2-bg.jpg (carta por carta),
//   page3-bg.jpg (resumen, mensaje, claves). Los textos fijos (títulos,
//   etiquetas de posición, cabeceras) vienen dibujados en el fondo.
// Fuentes en templates/premium-v1/fonts/ (recortadas a español):
//   Cormorant Garamond Bold (nombre, nombres de carta) y Source Serif 4
//   Regular/Italic (cuerpo). Se incrustan SIN subset de pdf-lib: su subset
//   rompe la Cormorant (salen letras sueltas); ya vienen recortadas.
//
// Coordenadas en px del fondo (origen arriba-izquierda), medidas sobre los
// fondos recompuestos (ver docs/product/DECISIONS.md, PDF premium-v1).
// Reglas: el texto nunca se corta (achica hasta entrar); un solo tamaño de
// cuerpo por página en P2; invertidas giradas 180° (igual que /lectura).
// ============================================================
import { rgb, degrees } from "https://esm.sh/pdf-lib@1.17.1";
// @ts-ignore: el .d.ts de esm.sh no declara el default export (en runtime existe)
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

export const PLANTILLA_PREMIUM = "premium-v1";
const PW = 595.28, PH = 841.89, S = PW / 2480;
const pX = (px: number) => px * S;
const pY = (px: number) => PH - px * S;

const L1 = {
  nombre: { cx: 1240, cy: 335, maxW: 1150, ptMax: 40, ptMin: 22 },
  fecha: { cx: 1240, baseline: 678, pt: 12.5 },
  cartas: [
    { x: 252, y: 1036, w: 523, h: 785 },
    { x: 978, y: 1036, w: 522, h: 783 },
    { x: 1703, y: 1036, w: 523, h: 785 },
    { x: 594, y: 2188, w: 534, h: 801 },
    { x: 1351, y: 2188, w: 534, h: 801 },
  ],
};
const P2_FILAS_Y = [453, 1022, 1591, 2160, 2729];
const L2 = {
  filas: P2_FILAS_Y.map((y) => ({
    carta: { x: 260, y, w: 310, h: 465 },
    texto: { x: 729, y: y + 19, w: 1466, h: 449 },
  })),
};
const L3 = {
  resumen: { x: 300, y: 605, w: 1880, h: 1065 },
  mensaje: { x: 340, y: 1988, w: 1800, h: 380 },
  claves: [
    { x: 600, y: 2636, w: 1570, h: 177 },
    { x: 600, y: 2813, w: 1570, h: 177 },
    { x: 600, y: 2989, w: 1570, h: 177 },
  ],
  pie: { x: 670, y: 3328, w: 1140 },
};

const C_NOMBRE_P1 = rgb(0.16, 0.08, 0.03);
const C_NOMBRE_CARTA = rgb(0.23, 0.10, 0.29);
const C_CUERPO = rgb(0.22, 0.14, 0.06);
const C_MENSAJE = rgb(0.20, 0.08, 0.24);
const C_FILETE = rgb(0.93, 0.79, 0.47);
const AVISO = "Lectura simbólica generada con inteligencia artificial con fines reflexivos y de entretenimiento. No sustituye asesoramiento profesional de ningún tipo.";

// Caracteres incluidos en las fuentes recortadas: Latin-1 + rayas, comillas
// tipográficas, viñeta, puntos suspensivos y €. Lo demás se reemplaza o cae.
export function sanitizePremium(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\u{FFFD}/gu, "")
    .replace(/[‐‑‒―]/g, "–")
    .replace(/[‚‛]/g, "'")
    .replace(/[„‟]/g, '"')
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "");
}

function wrap(text: string, font: any, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const par of sanitizePremium(text).split(/\n+/)) {
    let cur = "";
    for (const w of par.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW || !cur) cur = t;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaLarga(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return sanitizePremium(iso ?? "");
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

export type FuentesPremium = { titulo: any; cuerpo: any; ita: any };

/** Descarga fondos y fuentes. Si falta cualquiera devuelve null (el
 *  llamador vuelve a la plantilla clásica: nunca se corta una entrega). */
export async function cargarPremium(pdfDoc: any, descargar: (path: string) => Promise<Uint8Array | null>) {
  const base = `templates/${PLANTILLA_PREMIUM}`;
  const [b1, b2, b3, fT, fC, fI] = await Promise.all([
    descargar(`${base}/page1-bg.jpg`),
    descargar(`${base}/page2-bg.jpg`),
    descargar(`${base}/page3-bg.jpg`),
    descargar(`${base}/fonts/CormorantGaramond_700Bold.ttf`),
    descargar(`${base}/fonts/SourceSerif4_400Regular.ttf`),
    descargar(`${base}/fonts/SourceSerif4_400Regular_Italic.ttf`),
  ]);
  const faltan = { p1: !b1, p2: !b2, p3: !b3, titulo: !fT, cuerpo: !fC, ita: !fI };
  if (!b1 || !b2 || !b3 || !fT || !fC || !fI) return { ok: false as const, faltan };
  pdfDoc.registerFontkit(fontkit);
  const [bg1, bg2, bg3, titulo, cuerpo, ita] = await Promise.all([
    pdfDoc.embedJpg(b1), pdfDoc.embedJpg(b2), pdfDoc.embedJpg(b3),
    pdfDoc.embedFont(fT, { subset: false }),
    pdfDoc.embedFont(fC, { subset: false }),
    pdfDoc.embedFont(fI, { subset: false }),
  ]);
  return { ok: true as const, bg: [bg1, bg2, bg3], fuentes: { titulo, cuerpo, ita } as FuentesPremium };
}

const esInvertida = (c: any) => c?.orientacion === "invertida" || c?.invertida === true;

// Carta centrada en su caja respetando su proporción; invertida = 180°.
function dibujarCarta(page: any, img: any, caja: { x: number; y: number; w: number; h: number }, invertida: boolean, f: FuentesPremium, nombre: string, filete: boolean) {
  let w = caja.w, h = caja.h;
  if (img) {
    const r = img.width / img.height;
    if (w / h > r) w = Math.round(h * r); else h = Math.round(w / r);
  }
  const x = caja.x + (caja.w - w) / 2, y = caja.y + (caja.h - h) / 2;
  if (img) {
    page.drawImage(img, invertida
      ? { x: pX(x + w), y: pY(y), width: pX(w), height: pX(h), rotate: degrees(180) }
      : { x: pX(x), y: pY(y + h), width: pX(w), height: pX(h) });
  } else {
    page.drawRectangle({ x: pX(x), y: pY(y + h), width: pX(w), height: pX(h), color: rgb(0.08, 0.04, 0.12) });
    const s = 9, lineas = wrap(nombre, f.cuerpo, s, pX(w) - 10);
    let ty = pY(y + h / 2) + (lineas.length * s * 1.3) / 2 - s;
    for (const l of lineas) {
      page.drawText(l, { x: pX(x) + (pX(w) - f.cuerpo.widthOfTextAtSize(l, s)) / 2, y: ty, size: s, font: f.cuerpo, color: rgb(0.85, 0.75, 0.55) });
      ty -= s * 1.3;
    }
  }
  if (filete) {
    page.drawRectangle({ x: pX(x), y: pY(y + h), width: pX(w), height: pX(h), borderColor: C_FILETE, borderWidth: 0.75, opacity: 0, borderOpacity: 0.9 });
  }
}

/** cartas: [{ carta, img }] ya ordenadas por posición 1..5 */
export function premiumPagina1(pdfDoc: any, bg: any, cartas: any[], contenido: any, f: FuentesPremium) {
  const p = pdfDoc.addPage([PW, PH]);
  p.drawImage(bg, { x: 0, y: 0, width: PW, height: PH });
  // Nombre: una línea en el papel liso del pergamino; achica hasta entrar.
  const nombre = sanitizePremium(contenido?.nombre ?? "").trim();
  if (nombre) {
    const N = L1.nombre;
    let pt = N.ptMax;
    while (pt > N.ptMin && f.titulo.widthOfTextAtSize(nombre, pt) > pX(N.maxW)) pt -= 0.5;
    while (f.titulo.widthOfTextAtSize(nombre, pt) > pX(N.maxW) && pt > 12) pt -= 0.5; // nunca se corta
    const cap = f.titulo.heightAtSize(pt, { descender: false }) * 0.66;
    p.drawText(nombre, { x: pX(N.cx) - f.titulo.widthOfTextAtSize(nombre, pt) / 2, y: pY(N.cy) - cap / 2, size: pt, font: f.titulo, color: C_NOMBRE_P1 });
  }
  // Fecha de nacimiento: sobre el paisaje oscuro → crema con sombra suave.
  const fecha = fechaLarga(contenido?.fecha_nacimiento);
  if (fecha) {
    const s = L1.fecha.pt, x = pX(L1.fecha.cx) - f.ita.widthOfTextAtSize(fecha, s) / 2, y = pY(L1.fecha.baseline);
    p.drawText(fecha, { x: x + 0.6, y: y - 0.6, size: s, font: f.ita, color: rgb(0.05, 0.02, 0.08), opacity: 0.75 });
    p.drawText(fecha, { x, y, size: s, font: f.ita, color: rgb(0.97, 0.91, 0.78) });
  }
  cartas.slice(0, 5).forEach(({ carta, img }, i) =>
    dibujarCarta(p, img, L1.cartas[i], esInvertida(carta), f, sanitizePremium(carta?.nombre_carta ?? carta?.carta ?? ""), true));
}

export function premiumPagina2(pdfDoc: any, bg: any, cartas: any[], f: FuentesPremium) {
  const p = pdfDoc.addPage([PW, PH]);
  p.drawImage(bg, { x: 0, y: 0, width: PW, height: PH });
  const nS = 14, nLH = nS * 1.15, LH = 1.32;
  const medir = (c: any, i: number, s: number) => {
    const li = wrap(c?.interpretacion ?? "", f.cuerpo, s, pX(L2.filas[i].texto.w));
    return { li, alto: nLH + 4 + li.length * s * LH };
  };
  // Un solo tamaño de cuerpo para las 5 filas: el más grande (≤ 10,5) que
  // entra en todas. Si ni a 9,5 entra, sigue bajando: el texto nunca se corta.
  let s = 10.5;
  while (s > 6.5 && cartas.slice(0, 5).some(({ carta }, i) => medir(carta, i, s).alto > pX(L2.filas[i].texto.h))) s -= 0.25;
  cartas.slice(0, 5).forEach(({ carta, img }, i) => {
    const { carta: caja, texto: T } = L2.filas[i];
    const inv = esInvertida(carta);
    const nombreCarta = sanitizePremium(carta?.nombre_carta ?? carta?.carta ?? "");
    dibujarCarta(p, img, caja, inv, f, nombreCarta, false);
    const { li, alto } = medir(carta, i, s);
    const th = pX(T.h);
    let y = pY(T.y) - (th - alto) / 2 - nS * 0.85;
    p.drawText(nombreCarta + (inv ? " · invertida" : ""), { x: pX(T.x), y, size: nS, font: f.titulo, color: C_NOMBRE_CARTA });
    y -= nLH * 0.55 + 4 + s * LH * 0.75;
    for (const l of li) { p.drawText(l, { x: pX(T.x), y, size: s, font: f.cuerpo, color: C_CUERPO }); y -= s * LH; }
  });
  return s;
}

export function premiumPagina3(pdfDoc: any, bg: any, contenido: any, f: FuentesPremium) {
  const p = pdfDoc.addPage([PW, PH]);
  p.drawImage(bg, { x: 0, y: 0, width: PW, height: PH });
  const tamanos: Record<string, number> = {};
  // Bloque: achica de max a min (y si hace falta, más: nunca se corta);
  // centrado vertical en su caja.
  const bloque = (clave: string, texto: string, caja: any, font: any, max: number, lh: number, color: any, centrado = false) => {
    const w = pX(caja.w), h = pX(caja.h);
    let s = max, ls = wrap(texto, font, s, w);
    while (ls.length * s * lh > h && s > 6.5) { s -= 0.25; ls = wrap(texto, font, s, w); }
    tamanos[clave] = s;
    let y = pY(caja.y) - (h - ls.length * s * lh) / 2 - s * 0.95;
    for (const l of ls) {
      const x = centrado ? pX(caja.x) + (w - font.widthOfTextAtSize(l, s)) / 2 : pX(caja.x);
      p.drawText(l, { x, y, size: s, font, color }); y -= s * lh;
    }
  };
  bloque("resumen", contenido?.resumen_lectura ?? "", L3.resumen, f.cuerpo, 10.5, 1.38, C_CUERPO);
  bloque("mensaje", contenido?.mensaje_final ?? "", L3.mensaje, f.ita, 11, 1.45, C_MENSAJE, true);
  const pasos = Array.isArray(contenido?.proximos_pasos) ? contenido.proximos_pasos : [];
  pasos.slice(0, 3).forEach((t: any, k: number) =>
    bloque(`clave_${k + 1}`, typeof t === "string" ? t : (t?.texto ?? t?.titulo ?? ""), L3.claves[k], f.cuerpo, 10, 1.36, C_CUERPO));
  // Cierre legal: aviso (2 líneas, ≤ 8,5 pt, entre las hojas) + copyright.
  const P = L3.pie, w = pX(P.w);
  let s = 8.5;
  while (s > 7 && wrap(AVISO, f.ita, s, w).length > 2) s -= 0.25;
  let y = pY(P.y) - s;
  for (const l of wrap(AVISO, f.ita, s, w)) {
    p.drawText(l, { x: pX(P.x) + (w - f.ita.widthOfTextAtSize(l, s)) / 2, y, size: s, font: f.ita, color: rgb(0.93, 0.87, 0.76), opacity: 0.85 });
    y -= s * 1.42;
  }
  const copy = `© ${new Date().getFullYear()} Tu Oráculo. Todos los derechos reservados.`;
  const sc = 7.25;
  p.drawText(copy, { x: pX(P.x) + (w - f.cuerpo.widthOfTextAtSize(copy, sc)) / 2, y: y - 3, size: sc, font: f.cuerpo, color: rgb(0.85, 0.70, 0.42), opacity: 0.9 });
  return tamanos;
}
