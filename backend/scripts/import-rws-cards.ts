/**
 * import-rws-cards.ts — Sprint 4.2
 *
 * Descarga imágenes RWS desde Wikimedia Commons (dominio público),
 * las sube al bucket tarot-assets en Supabase Storage, y actualiza
 * la tabla tarot_cartas con imagen_storage_path, imagen_source_url,
 * imagen_license e imagen_attribution.
 *
 * USO:
 *   deno run --allow-net --allow-read --allow-env import-rws-cards.ts
 *   deno run --allow-net --allow-read --allow-env import-rws-cards.ts --force
 *   deno run --allow-net --allow-read --allow-env import-rws-cards.ts --dry-run
 *   deno run --allow-net --allow-read --allow-env import-rws-cards.ts --slug=major-00-el-loco
 *
 * VARIABLES DE ENTORNO REQUERIDAS:
 *   SUPABASE_URL              — URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Clave service_role (nunca anon)
 *
 * NOTAS LEGALES:
 *   Las imágenes Rider-Waite-Smith son obra de Pamela Colman Smith (1878–1951),
 *   publicadas en 1909. Son de dominio público en todos los países donde la
 *   protección expira 70 años después de la muerte del autor.
 *   Fuente: Wikimedia Commons, https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "tarot-assets";
const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "TuHoroscopo-RWS-Importer/1.0 (mbenitezmdeo@gmail.com)";
const ATTRIBUTION = "Pamela Colman Smith, 1909. Rider-Waite-Smith Tarot. Dominio público / Public domain.";
const DELAY_MS = 500; // pausa entre cartas para no saturar Wikimedia

// ── CLI args ──────────────────────────────────────────────────────────────────

const ARGS = Deno.args;
const FORCE    = ARGS.includes("--force");
const DRY_RUN  = ARGS.includes("--dry-run");
const ONLY_SLUG = ARGS.find(a => a.startsWith("--slug="))?.split("=")[1];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardMatch {
  arcano: string;
  palo?: string;
  numero?: number;
  carta_corte?: string;
}

interface ManifestCard {
  slug: string;
  storage_path: string;
  nombre_es: string;
  nombre_en: string;
  match: CardMatch;
  wikimedia_file: string;
  wikimedia_page: string;
}

interface Manifest {
  cards: ManifestCard[];
}

interface DbCard {
  id: string;
  arcano: string;
  palo: string | null;
  numero: number | null;
  carta_corte: string | null;
  imagen_storage_path: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchKey(m: CardMatch): string {
  if (m.arcano === "mayor") return `mayor:${m.numero}`;
  if (m.carta_corte)        return `menor:${m.palo}:corte:${m.carta_corte}`;
  return `menor:${m.palo}:${m.numero}`;
}

function dbKey(c: DbCard): string {
  if (c.arcano === "mayor") return `mayor:${c.numero}`;
  if (c.carta_corte)        return `menor:${c.palo}:corte:${c.carta_corte}`;
  return `menor:${c.palo}:${c.numero}`;
}

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Wikimedia API ─────────────────────────────────────────────────────────────

async function resolveWikimediaUrl(fileName: string): Promise<string | null> {
  const title = `File:${fileName}`;
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url",
    format: "json",
    origin: "*",
  });
  const url = `${WIKIMEDIA_API}?${params}`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    log("⚠️", `Wikimedia API HTTP ${res.status} para: ${fileName}`);
    return null;
  }

  const data = await res.json();
  const pages: Record<string, unknown> = data?.query?.pages ?? {};
  const page = Object.values(pages)[0] as { imageinfo?: { url: string }[] };

  if (!page?.imageinfo?.[0]?.url) {
    log("⚠️", `No encontrado en Wikimedia Commons: ${fileName}`);
    return null;
  }

  return page.imageinfo[0].url;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Validar env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌  Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
  }

  // Modo
  console.log("\n══════════════════════════════════════════════════");
  console.log("  import-rws-cards — Rider-Waite-Smith → Storage");
  console.log("══════════════════════════════════════════════════");
  if (DRY_RUN) log("🔍", "MODO DRY-RUN: sin cambios en Storage ni DB");
  if (FORCE)   log("🔄", "MODO FORCE: re-importa aunque ya exista imagen_storage_path");
  if (ONLY_SLUG) log("🎯", `Filtrando solo: ${ONLY_SLUG}`);
  console.log("");

  // Cargar manifest
  const manifestPath = new URL("./rws-manifest.json", import.meta.url);
  const manifest: Manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  log("📄", `Manifest cargado: ${manifest.cards.length} cartas`);

  // Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Cargar registros de DB
  const { data: dbCards, error: dbError } = await supabase
    .from("tarot_cartas")
    .select("id, arcano, palo, numero, carta_corte, imagen_storage_path");

  if (dbError) {
    console.error("❌  Error al leer tarot_cartas:", dbError.message);
    Deno.exit(1);
  }

  // Construir lookup map
  const lookup = new Map<string, DbCard>();
  for (const c of (dbCards as DbCard[])) {
    lookup.set(dbKey(c), c);
  }
  log("🗃️ ", `DB cargada: ${lookup.size} cartas en tarot_cartas`);
  console.log("");

  // Filtrar cartas si --slug
  const cards = ONLY_SLUG
    ? manifest.cards.filter(c => c.slug === ONLY_SLUG)
    : manifest.cards;

  if (ONLY_SLUG && cards.length === 0) {
    console.error(`❌  Slug no encontrado en manifest: ${ONLY_SLUG}`);
    Deno.exit(1);
  }

  // Stats
  let ok = 0, skipped = 0, failed = 0;
  const failures: string[] = [];

  // Procesar una por una
  for (const card of cards) {
    const key = matchKey(card.match);
    const dbRecord = lookup.get(key);

    if (!dbRecord) {
      log("❓", `[${card.slug}] No encontrado en DB (key=${key})`);
      failed++;
      failures.push(`DB_NOT_FOUND: ${card.slug}`);
      continue;
    }

    // Skip si ya tiene imagen y no hay force
    if (dbRecord.imagen_storage_path && !FORCE) {
      log("⏭️ ", `[${card.slug}] Ya importada → ${dbRecord.imagen_storage_path}`);
      skipped++;
      continue;
    }

    console.log(`→ [${card.slug}] ${card.nombre_es}`);

    // Resolver URL de descarga via Wikimedia API
    const downloadUrl = await resolveWikimediaUrl(card.wikimedia_file);
    if (!downloadUrl) {
      log("❌", `[${card.slug}] URL no resuelta para: ${card.wikimedia_file}`);
      failed++;
      failures.push(`WIKIMEDIA_NOT_FOUND: ${card.slug} (${card.wikimedia_file})`);
      await sleep(DELAY_MS);
      continue;
    }

    log("🌐", `URL: ${downloadUrl}`);

    if (DRY_RUN) {
      log("✅", `[DRY-RUN] ${card.slug} → ${card.storage_path}`);
      ok++;
      await sleep(DELAY_MS);
      continue;
    }

    // Descargar imagen
    let imageBytes: Uint8Array;
    try {
      const imgRes = await fetch(downloadUrl, { headers: { "User-Agent": USER_AGENT } });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      imageBytes = new Uint8Array(await imgRes.arrayBuffer());
      log("📥", `Descargada: ${(imageBytes.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      log("❌", `[${card.slug}] Error descargando imagen: ${(e as Error).message}`);
      failed++;
      failures.push(`DOWNLOAD_ERROR: ${card.slug}`);
      await sleep(DELAY_MS);
      continue;
    }

    // Detectar content-type por magic bytes (JPEG=FF D8, PNG=89 50)
    const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
    const contentType = isPng ? "image/png" : "image/jpeg";

    // Subir a Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(card.storage_path, imageBytes, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      log("❌", `[${card.slug}] Error en Storage: ${uploadError.message}`);
      failed++;
      failures.push(`UPLOAD_ERROR: ${card.slug} — ${uploadError.message}`);
      await sleep(DELAY_MS);
      continue;
    }

    log("📦", `Subida: ${card.storage_path}`);

    // Actualizar tarot_cartas
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
      log("❌", `[${card.slug}] Error actualizando DB: ${updateError.message}`);
      failed++;
      failures.push(`DB_UPDATE_ERROR: ${card.slug} — ${updateError.message}`);
      await sleep(DELAY_MS);
      continue;
    }

    log("✅", `[${card.slug}] OK\n`);
    ok++;
    await sleep(DELAY_MS);
  }

  // Resumen
  console.log("══════════════════════════════════════════════════");
  console.log(`  RESUMEN: ✅ ${ok} OK  ⏭️  ${skipped} salteadas  ❌ ${failed} errores`);
  console.log("══════════════════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\nFallas detalladas:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
  }

  if (failed > 0) Deno.exit(1);
}

main().catch(e => {
  console.error("❌  Error fatal:", e);
  Deno.exit(1);
});
