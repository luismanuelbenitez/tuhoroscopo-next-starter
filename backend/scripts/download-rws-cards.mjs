/**
 * download-rws-cards.mjs
 *
 * Descarga las 78 imágenes RWS desde Wikimedia Commons al disco local.
 * NO sube nada a Supabase Storage. NO toca la DB.
 *
 * Las imágenes quedan en:
 *   backend/scripts/downloads/decks/rws-classic/major/
 *   backend/scripts/downloads/decks/rws-classic/minor/bastos/
 *   backend/scripts/downloads/decks/rws-classic/minor/copas/
 *   backend/scripts/downloads/decks/rws-classic/minor/espadas/
 *   backend/scripts/downloads/decks/rws-classic/minor/oros/
 *
 * USO:
 *   node download-rws-cards.mjs              # descarga todo, saltea los que ya existen
 *   node download-rws-cards.mjs --force      # re-descarga aunque ya existan
 *   node download-rws-cards.mjs --slug=major-00-el-loco
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = join(__dirname, "downloads");
const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT    = "TuHoroscopo-RWS-Importer/1.0 (mbenitezmdeo@gmail.com)";
const DELAY_MS      = 600;

const ARGS      = process.argv.slice(2);
const FORCE     = ARGS.includes("--force");
const ONLY_SLUG = ARGS.find(a => a.startsWith("--slug="))?.split("=")[1];

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function sleep(ms)      { return new Promise(r => setTimeout(r, ms)); }

async function resolveWikimediaUrl(fileName) {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url",
    format: "json",
    origin: "*",
  });
  const res  = await fetch(`${WIKIMEDIA_API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) { log("⚠️", `Wikimedia HTTP ${res.status} para: ${fileName}`); return null; }
  const data = await res.json();
  const page = Object.values(data?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(__dirname, "rws-manifest.json"), "utf-8"));

  console.log("\n══════════════════════════════════════════════════");
  console.log("  download-rws-cards — Wikimedia → disco local");
  console.log(`  Destino: ${DOWNLOADS_DIR}`);
  console.log("══════════════════════════════════════════════════");
  if (FORCE)     log("🔄", "FORCE: re-descarga aunque ya existan");
  if (ONLY_SLUG) log("🎯", `Solo slug: ${ONLY_SLUG}`);
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
    const localPath = join(DOWNLOADS_DIR, card.storage_path);
    const localDir  = dirname(localPath);

    // Saltear si ya existe
    if (existsSync(localPath) && !FORCE) {
      log("⏭️ ", `[${card.slug}] Ya existe → ${localPath}`);
      skipped++;
      continue;
    }

    console.log(`→ [${card.slug}] ${card.nombre_es}`);

    // Resolver URL Wikimedia
    const downloadUrl = await resolveWikimediaUrl(card.wikimedia_file);
    if (!downloadUrl) {
      log("⚠️", `No encontrado en Wikimedia: ${card.wikimedia_file}`);
      failed++;
      failures.push(`WIKIMEDIA_NOT_FOUND: ${card.slug} (${card.wikimedia_file})`);
      await sleep(DELAY_MS);
      continue;
    }
    log("🌐", downloadUrl);

    // Descargar
    let bytes;
    try {
      const res = await fetch(downloadUrl, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      log("📥", `${(bytes.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      log("❌", `Descarga fallida: ${e.message}`);
      failed++;
      failures.push(`DOWNLOAD_ERROR: ${card.slug}`);
      await sleep(DELAY_MS);
      continue;
    }

    // Guardar localmente
    mkdirSync(localDir, { recursive: true });
    writeFileSync(localPath, bytes);
    log("💾", `Guardada: ${localPath}`);
    ok++;
    console.log("");
    await sleep(DELAY_MS);
  }

  console.log("══════════════════════════════════════════════════");
  console.log(`  RESUMEN: ✅ ${ok} descargadas  ⏭️  ${skipped} existentes  ❌ ${failed} errores`);
  console.log("══════════════════════════════════════════════════\n");

  if (failures.length > 0) {
    console.log("Fallas:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
  }
}

main().catch(e => { console.error("❌  Error fatal:", e); process.exit(1); });
