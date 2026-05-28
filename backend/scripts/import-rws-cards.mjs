/**
 * import-rws-cards.mjs — Sprint 4.2 (Node.js 18+)
 *
 * Descarga imágenes RWS desde Wikimedia Commons (dominio público),
 * las sube al bucket tarot-assets en Supabase Storage, y actualiza
 * tarot_cartas con imagen_storage_path, imagen_source_url,
 * imagen_license e imagen_attribution.
 *
 * USO:
 *   node import-rws-cards.mjs
 *   node import-rws-cards.mjs --force
 *   node import-rws-cards.mjs --dry-run
 *   node import-rws-cards.mjs --slug=major-00-el-loco
 *
 * VARIABLES DE ENTORNO REQUERIDAS:
 *   SUPABASE_URL              — URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Clave service_role (nunca anon)
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET        = "tarot-assets";
const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT    = "TuHoroscopo-RWS-Importer/1.0 (mbenitezmdeo@gmail.com)";
const ATTRIBUTION   = "Pamela Colman Smith, 1909. Rider-Waite-Smith Tarot. Dominio público / Public domain.";
const DELAY_MS      = 600;

// ── CLI args ──────────────────────────────────────────────────────────────────

const ARGS      = process.argv.slice(2);
const FORCE     = ARGS.includes("--force");
const DRY_RUN   = ARGS.includes("--dry-run");
const ONLY_SLUG = ARGS.find(a => a.startsWith("--slug="))?.split("=")[1];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function log(icon, msg) { console.log(`${icon}  ${msg}`); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Wikimedia API ─────────────────────────────────────────────────────────────

async function resolveWikimediaUrl(fileName) {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${WIKIMEDIA_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    log("⚠️", `Wikimedia HTTP ${res.status} para: ${fileName}`);
    return null;
  }

  const data = await res.json();
  const pages = data?.query?.pages ?? {};
  const page  = Object.values(pages)[0];

  if (!page?.imageinfo?.[0]?.url) {
    log("⚠️", `No encontrado en Wikimedia: ${fileName}`);
    return null;
  }

  return page.imageinfo[0].url;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌  Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  import-rws-cards — Rider-Waite-Smith → Storage");
  console.log("══════════════════════════════════════════════════");
  if (DRY_RUN)   log("🔍", "DRY-RUN: sin cambios en Storage ni DB");
  if (FORCE)     log("🔄", "FORCE: re-importa aunque exista imagen_storage_path");
  if (ONLY_SLUG) log("🎯", `Solo slug: ${ONLY_SLUG}`);
  console.log("");

  // Cargar manifest
  const manifestUrl = new URL("./rws-manifest.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf-8"));
  log("📄", `Manifest: ${manifest.cards.length} cartas`);

  // Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Leer DB
  const { data: dbCards, error: dbError } = await supabase
    .from("tarot_cartas")
    .select("id, arcano, palo, numero, carta_corte, imagen_storage_path");

  if (dbError) {
    console.error("❌  Error leyendo tarot_cartas:", dbError.message);
    process.exit(1);
  }

  const lookup = new Map();
  for (const c of dbCards) lookup.set(dbKey(c), c);
  log("🗃️ ", `DB: ${lookup.size} cartas en tarot_cartas`);
  console.log("");

  // Filtrar
  const cards = ONLY_SLUG
    ? manifest.cards.filter(c => c.slug === ONLY_SLUG)
    : manifest.cards;

  if (ONLY_SLUG && cards.length === 0) {
    console.error(`❌  Slug no encontrado: ${ONLY_SLUG}`);
    process.exit(1);
  }

  let ok = 0, skipped = 0, failed = 0;
  const failures = [];

  for (const card of cards) {
    const key      = matchKey(card.match);
    const dbRecord = lookup.get(key);

    if (!dbRecord) {
      log("❓", `[${card.slug}] Sin match en DB (key=${key})`);
      failed++;
      failures.push(`DB_NOT_FOUND: ${card.slug}`);
      continue;
    }

    if (dbRecord.imagen_storage_path && !FORCE) {
      log("⏭️ ", `[${card.slug}] Ya importada → ${dbRecord.imagen_storage_path}`);
      skipped++;
      continue;
    }

    console.log(`→ [${card.slug}] ${card.nombre_es}`);

    // Resolver URL Wikimedia
    const downloadUrl = await resolveWikimediaUrl(card.wikimedia_file);
    if (!downloadUrl) {
      failed++;
      failures.push(`WIKIMEDIA_NOT_FOUND: ${card.slug} (${card.wikimedia_file})`);
      await sleep(DELAY_MS);
      continue;
    }
    log("🌐", downloadUrl);

    if (DRY_RUN) {
      log("✅", `[DRY-RUN] → ${card.storage_path}`);
      ok++;
      await sleep(DELAY_MS);
      continue;
    }

    // Descargar
    let imageBytes;
    try {
      const imgRes = await fetch(downloadUrl, { headers: { "User-Agent": USER_AGENT } });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      imageBytes = new Uint8Array(buf);
      log("📥", `${(imageBytes.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      log("❌", `[${card.slug}] Descarga fallida: ${e.message}`);
      failed++;
      failures.push(`DOWNLOAD_ERROR: ${card.slug}`);
      await sleep(DELAY_MS);
      continue;
    }

    // Content-type por magic bytes
    const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
    const contentType = isPng ? "image/png" : "image/jpeg";

    // Subir a Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(card.storage_path, imageBytes, { contentType, upsert: true });

    if (uploadError) {
      log("❌", `[${card.slug}] Storage: ${uploadError.message}`);
      failed++;
      failures.push(`UPLOAD_ERROR: ${card.slug} — ${uploadError.message}`);
      await sleep(DELAY_MS);
      continue;
    }
    log("📦", `Subida: ${card.storage_path}`);

    // Actualizar DB
    const { error: updateError } = await supabase
      .from("tarot_cartas")
      .update({
        imagen_storage_path: card.storage_path,
        imagen_source_url:   downloadUrl,
        imagen_license:      "public_domain",
        imagen_attribution:  ATTRIBUTION,
      })
      .eq("id", dbRecord.id);

    if (updateError) {
      log("❌", `[${card.slug}] DB update: ${updateError.message}`);
      failed++;
      failures.push(`DB_UPDATE_ERROR: ${card.slug} — ${updateError.message}`);
      await sleep(DELAY_MS);
      continue;
    }

    log("✅", `[${card.slug}] OK\n`);
    ok++;
    await sleep(DELAY_MS);
  }

  console.log("══════════════════════════════════════════════════");
  console.log(`  RESUMEN: ✅ ${ok} OK  ⏭️  ${skipped} salteadas  ❌ ${failed} errores`);
  console.log("══════════════════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\nFallas:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
  }

  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error("❌  Error fatal:", e);
  process.exit(1);
});
