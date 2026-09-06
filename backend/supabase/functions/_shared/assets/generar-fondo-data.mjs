// Regenera _shared/tarot-cabezal-fondo-data.ts a partir del binario real en
// esta misma carpeta (tarot-cabezal-fondo.jpg). Correr cada vez que se
// reemplaza el asset:
//
//   node backend/supabase/functions/_shared/assets/generar-fondo-data.mjs
//
// Por qué existe este paso: Satori (@vercel/og, motor de la Edge Function
// que compone el cabezal) necesita los bytes de la imagen ya resueltos como
// data URI en el árbol JSX — no puede hacer fetch a una ruta local del
// repo ni a una URL pública en el runtime de Supabase. El binario real
// (tarot-cabezal-fondo.jpg) es la fuente de verdad versionada en git; este
// script solo lo transforma a un módulo .ts embebible en el bundle de la
// Edge Function.
//
// BUG REAL ENCONTRADO Y CORREGIDO ACÁ (sprint 2026-09-06, "fondo fijo del
// cabezal"): un JPEG exportado por Chromium/Playwright con el perfil de
// color ICC embebido (marker APP2, "ICC_PROFILE") hacía que el decoder de
// imágenes de @vercel/og (Satori) tirara "InvalidCharacterError: Failed to
// decode base64" en el runtime REAL de Supabase — confirmado deployado,
// no reproducible con deno check ni en teoría. Photoshop y muchos editores
// también embeben un perfil de color por default al exportar JPEG/PNG, así
// que este script SIEMPRE limpia esos chunks antes de generar el data URI,
// sin importar qué editor haya usado Manuel para el asset. No cambia nada
// visible de la imagen (el perfil de color no afecta cómo se ve en un uso
// normal como este, solo metadata).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(DIR, "tarot-cabezal-fondo.jpg");
const OUT = join(DIR, "..", "tarot-cabezal-fondo-data.ts");

// Quita los segmentos APP1 (0xE1, típicamente EXIF) y APP2 (0xE2,
// típicamente ICC_PROFILE) de un JPEG, dejando todo lo demás intacto
// (dimensiones, calidad, contenido de píxeles sin cambios).
function stripJpegProfiles(buf) {
  const out = [];
  let i = 0;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // no es JPEG (SOI) — no tocar
  out.push(buf.slice(0, 2));
  i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break; // estructura inesperada — devolver tal cual se procesó hasta acá
    const marker = buf[i + 1];
    if (marker === 0xd9) { out.push(buf.slice(i, i + 2)); break; } // EOI
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0x00) {
      out.push(buf.slice(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda) { out.push(buf.slice(i)); break; } // SOS: resto del archivo tal cual
    const len = buf.readUInt16BE(i + 2);
    const segment = buf.slice(i, i + 2 + len);
    if (marker !== 0xe1 && marker !== 0xe2) out.push(segment);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

// Quita el chunk iCCP de un PNG (mismo objetivo que arriba, por si el
// asset se reemplaza por un PNG en vez de un JPEG).
function stripPngProfile(buf) {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return buf; // no es PNG — no tocar
  const out = [PNG_SIG];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const chunk = buf.slice(i, i + 12 + len); // length(4) + type(4) + data(len) + crc(4)
    if (type !== "iCCP") out.push(chunk);
    i += 12 + len;
  }
  return Buffer.concat(out);
}

const rawBytes = readFileSync(SRC);
const isPng = rawBytes[0] === 0x89 && rawBytes[1] === 0x50;
const bytes = isPng ? stripPngProfile(rawBytes) : stripJpegProfiles(rawBytes);
const mime = isPng ? "image/png" : "image/jpeg";
const base64 = bytes.toString("base64");
const dataUri = `data:${mime};base64,${base64}`;

const contenido = `// GENERADO AUTOMÁTICAMENTE por _shared/assets/generar-fondo-data.mjs —
// NO editar a mano. Para reemplazar el fondo del cabezal: sustituir
// _shared/assets/tarot-cabezal-fondo.jpg y volver a correr ese script.
export const FONDO_CABEZAL_DATA_URI = "${dataUri}";
`;

writeFileSync(OUT, contenido, "utf8");
const ahorrado = rawBytes.length - bytes.length;
console.log(
  `OK: ${OUT} (fuente ${(rawBytes.length / 1024).toFixed(1)} KB` +
    (ahorrado > 0 ? `, ${(ahorrado / 1024).toFixed(1)} KB de perfil de color eliminado` : "") +
    ` -> data URI ${(dataUri.length / 1024).toFixed(1)} KB)`,
);
