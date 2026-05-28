/**
 * upload-rws-cards.mjs — Sprint 4.2
 *
 * Lee imágenes procesadas del directorio local downloads/,
 * las sube a Supabase Storage (tarot-assets) y actualiza tarot_cartas.
 *
 * Si el archivo local tiene extensión distinta a la del manifest
 * (ej: .jpg en lugar de .png), usa la extensión real del archivo
 * y actualiza storage_path en DB acordemente.
 *
 * USO:
 *   node upload-rws-cards.mjs
 *   node upload-rws-cards.mjs --force      # re-sube aunque exista en Storage
 *   node upload-rws-cards.mjs --slug=major-00-el-loco
 *   node upload-rws-cards.mjs --dry-run
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join, extname, basename } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS  = join(__dirname, "downloads");
const BUCKET     = "tarot-assets";
const ATTRIBUTION = "Pamela Colman Smith, 1909. Rider-Waite-Smith Tarot. Dominio público / Public domain.";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ARGS      = process.argv.slice(2);
const FORCE     = ARGS.includes("--force");
const DRY_RUN   = ARGS.includes("--dry-run");
const ONLY_SLUG = ARGS.find(a => a.startsWith("--slug="))?.split("=")[1];

function log(icon, msg) { console.log(`${icon}  ${msg}`); }

// Busca el archivo local: prueba la extension del manifest y luego la alternativa
function findLocalFile(storagePath) {
  const exact = join(DOWNLOADS, storagePath);
  if (existsSync(exact)) return { path: exact, storagePath };

  // Intercambiar extensión .png ↔ .jpg
  const ext     = extname(storagePath);
  const altExt  = ext === ".png" ? ".jpg" : ".png";
  const altPath = storagePath.slice(0, -ext.length) + altExt;
  const altLocal = join(DOWNLOADS, altPath);
  if (existsSync(altLocal)) return { path: altLocal, storagePath: altPath };

  return null;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌  Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  upload-rws-cards — disco local → Storage + DB");
  console.log("══════════════════════════════════════════════════");
  if (DRY_RUN)   log("🔍", "DRY-RUN: sin cambios en Storage ni DB");
  if (FORCE)     log("🔄", "FORCE: re-sube aunque exista imagen_storage_path en DB");
  if (ONLY_SLUG) log("🎯", `Solo slug: ${ONLY_SLUG}`);
  console.log("");

  const manifest = JSON.parse(readFileSync(join(__dirname, "rws-manifest.json"), "utf-8"));
  log("📄", `Manifest: ${manifest.cards.length} cartas`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Leer DB
  const { data: dbCards, error: dbErr } = await supabase
    .from("tarot_cartas")
    .select("id, arcano, palo, numero, carta_corte, imagen_storage_path");
  if (dbErr) { console.error("❌  DB:", dbErr.message); process.exit(1); }

  function matchKey(m) {
    if (m.arcano === "mayor") return `mayor:${m.numero}`;
    if (m.carta_corte)        return `menor:${m.palo}:corte:${m.carta_corte}`;
    return `menor:${m.palo}:${m.numero}`;
  }
  function dbKey(c) {
    if (c.arcano === "mayor") return `mayor:${c.numero}`;
    if (c.carta_corte)        return `menor:${c.palo}:corte:${c.carta_corte}`;
    return `menor:${c.palo}:${c.numero}`;
  }

  const lookup = new Map();
  for (const c of dbCards) lookup.set(dbKey(c), c);
  log("🗃️ ", `DB: ${lookup.size} cartas`);
  console.log("");

  const cards = ONLY_SLUG
    ? manifest.cards.filter(c => c.slug === ONLY_SLUG)
    : manifest.cards;

  if (ONLY_SLUG && cards.length === 0) {
    console.error(`❌  Slug no encontrado: ${ONLY_SLUG}`); process.exit(1);
  }

  let ok = 0, skipped = 0, failed = 0;
  const failures = [];

  for (const card of cards) {
    const key      = matchKey(card.match);
    const dbRecord = lookup.get(key);

    if (!dbRecord) {
      log("❓", `[${card.slug}] Sin match en DB`);
      failed++;
      failures.push(`DB_NOT_FOUND: ${card.slug}`);
      continue;
    }

    if (dbRecord.imagen_storage_path && !FORCE) {
      log("⏭️ ", `[${card.slug}] Ya tiene imagen_storage_path en DB → ${dbRecord.imagen_storage_path}`);
      skipped++;
      continue;
    }

    console.log(`→ [${card.slug}] ${card.nombre_es}`);

    // Buscar archivo local (con fallback de extensión)
    const found = findLocalFile(card.storage_path);
    if (!found) {
      log("❌", `Archivo local no encontrado: downloads/${card.storage_path}`);
      failed++;
      failures.push(`LOCAL_NOT_FOUND: ${card.slug}`);
      continue;
    }

    // Si la extensión real difiere del manifest, informar
    if (found.storagePath !== card.storage_path) {
      log("🔄", `Extensión ajustada: ${card.storage_path} → ${found.storagePath}`);
    }

    // Leer bytes
    const bytes = readFileSync(found.path);
    log("📂", `Local: ${found.path} (${Math.round(bytes.length / 1024)} KB)`);

    // Content-type por magic bytes
    const isPng      = bytes[0] === 0x89 && bytes[1] === 0x50;
    const contentType = isPng ? "image/png" : "image/jpeg";

    if (DRY_RUN) {
      log("✅", `[DRY-RUN] → Storage: ${found.storagePath} (${contentType})`);
      ok++;
      continue;
    }

    // Subir a Storage
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(found.storagePath, bytes, { contentType, upsert: true });

    if (uploadErr) {
      log("❌", `Storage upload: ${uploadErr.message}`);
      failed++;
      failures.push(`UPLOAD_ERROR: ${card.slug} — ${uploadErr.message}`);
      continue;
    }
    log("📦", `Subida: ${found.storagePath}`);

    // Actualizar DB con el storage_path real (puede diferir del manifest si cambió extensión)
    const { error: updateErr } = await supabase
      .from("tarot_cartas")
      .update({
        imagen_storage_path: found.storagePath,
        imagen_source_url:   card.wikimedia_page,
        imagen_license:      "public_domain",
        imagen_attribution:  ATTRIBUTION,
      })
      .eq("id", dbRecord.id);

    if (updateErr) {
      log("❌", `DB update: ${updateErr.message}`);
      failed++;
      failures.push(`DB_UPDATE_ERROR: ${card.slug} — ${updateErr.message}`);
      continue;
    }

    log("✅", `[${card.slug}] OK\n`);
    ok++;
  }

  console.log("══════════════════════════════════════════════════");
  console.log(`  RESUMEN: ✅ ${ok} OK  ⏭️  ${skipped} salteadas  ❌ ${failed} errores`);
  console.log("══════════════════════════════════════════════════\n");

  if (failures.length > 0) {
    console.log("Fallas:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
  }

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error("❌  Fatal:", e); process.exit(1); });
