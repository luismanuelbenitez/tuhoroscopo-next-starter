// ============================================================
// _shared/tarot-imagen-whatsapp.ts — Imagen personalizada para el HEADER
// del template de WhatsApp ("TU ORÁCULO / TU TIRADA" + las 5 cartas reales).
//
// Generación determinística (sin IA generativa): composición JSX → PNG vía
// @vercel/og (Satori, WASM puro). Es la alternativa oficialmente documentada
// por Supabase para generar imágenes en Edge Functions — Puppeteer/Chromium
// no corre ahí (falta el binario/proceso hijo que necesita), @vercel/og sí
// porque no depende de un navegador real.
// https://supabase.com/docs/guides/functions/examples/og-image
//
// Dimensiones: 1080×1080 (1:1). Meta confirma en su documentación que 1:1
// y 16:9 son las dos relaciones de aspecto que WhatsApp muestra "con éxito"
// sin recorte raro en la vista previa del chat. Se eligió 1:1 sobre 16:9
// porque las cartas de tarot son verticales — un 16:9 corto de altura las
// dejaría diminutas; el cuadrado deja alto suficiente para header + 5
// cartas + nombre sin achicarlas al punto de no distinguirse.
// Formato PNG (salida nativa de ImageResponse, sin paso de encoding extra):
// WhatsApp acepta PNG o JPG, límite técnico 5MB, recomendado <1MB — un PNG
// de este tamaño con 5 miniaturas de carta ronda unos cientos de KB.
// ============================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { ImageResponse } from "npm:@vercel/og@^0";
import React from "npm:react@^19";

const BUCKET_ASSETS = "tarot-assets";
const IMG_W = 1080;
const IMG_H = 1080;
const IMAGE_SIGNED_TTL_SEG = 24 * 3600;

let fontBoldCache: ArrayBuffer | null = null;
let fontRegularCache: ArrayBuffer | null = null;

// Satori (el motor de @vercel/og) necesita TTF/OTF — Google Fonts sirve
// WOFF2 por defecto a navegadores modernos, pero cae a TTF si el
// User-Agent no anuncia soporte woff2 (truco estándar usado por los
// ejemplos oficiales de @vercel/og). Se pide el CSS con ese User-Agent,
// se extrae la URL del archivo TTF con una regex, y se descarga el binario.
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

// Cacheada en memoria del isolate entre invocaciones calientes.
async function cargarFuentes(): Promise<{ bold: ArrayBuffer; regular: ArrayBuffer }> {
  if (!fontRegularCache) fontRegularCache = await descargarFuenteTTF("500");
  if (!fontBoldCache) fontBoldCache = await descargarFuenteTTF("700");
  return { bold: fontBoldCache, regular: fontRegularCache };
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

/**
 * Genera (o reutiliza si ya existe) la imagen personalizada de una orden y
 * devuelve una signed URL fresca. Idempotente: el path en Storage es fijo
 * por orden (`tarot/whatsapp/{ordenId}.png`) — una segunda llamada con
 * `forzar: false` reusa el archivo ya generado y solo firma una URL nueva;
 * con `forzar: true` vuelve a componer la imagen desde cero (por si las
 * cartas de esa orden hubieran cambiado, o para regenerar manualmente).
 */
export async function generarImagenWhatsapp(
  supabase: SupabaseClient,
  ordenId: string,
  opts: { forzar?: boolean } = {},
): Promise<{ signedUrl: string } | null> {
  const storagePath = `tarot/whatsapp/${ordenId}.png`;

  if (!opts.forzar) {
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
    cartas?: Array<{ posicion: number; nombre_carta: string; orientacion: string }>;
  } | null)?.cartas;

  if (!cartasContenido || cartasContenido.length !== 5) return null;

  const nombresCartas = cartasContenido.map((c) => c.nombre_carta);
  const { data: cartasImg } = await supabase
    .from("tarot_cartas")
    .select("nombre_es, imagen_storage_path, imagen_url")
    .in("nombre_es", nombresCartas);

  const pathPorNombre = new Map<string, string>();
  for (const c of cartasImg ?? []) {
    const path = c.imagen_storage_path ?? c.imagen_url ?? "";
    if (path) pathPorNombre.set(c.nombre_es, path);
  }

  const cartas: CartaParaImagen[] = [...cartasContenido]
    .sort((a, b) => a.posicion - b.posicion)
    .map((c) => ({
      posicion: c.posicion,
      nombreCarta: c.nombre_carta,
      invertida: c.orientacion === "invertida",
      storagePath: pathPorNombre.get(c.nombre_carta) ?? null,
    }));

  const dataUris = await Promise.all(
    cartas.map((c) => descargarCartaComoDataUri(supabase, c.storagePath)),
  );

  const { bold, regular } = await cargarFuentes();
  const primerNombre = orden.nombre_snapshot.trim().split(" ")[0];

  const img = new ImageResponse(
    React.createElement(
      "div",
      {
        style: {
          width: `${IMG_W}px`, height: `${IMG_H}px`, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "linear-gradient(160deg, #130a2e 0%, #0d0820 55%, #0c0618 100%)",
          fontFamily: "Cormorant Garamond",
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "36px" } },
        React.createElement(
          "span",
          { style: { fontSize: "30px", letterSpacing: "10px", color: "#FFCE4D", fontFamily: "Cormorant Garamond", fontWeight: 700 } },
          "TU ORÁCULO",
        ),
        React.createElement(
          "span",
          { style: { fontSize: "52px", color: "#F0F1F5", fontWeight: 700, marginTop: "6px", fontFamily: "Cormorant Garamond" } },
          "Tu Tirada",
        ),
      ),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "row", gap: "18px", alignItems: "center" } },
        ...cartas.map((c, i) =>
          React.createElement(
            "div",
            {
              key: c.posicion,
              style: {
                display: "flex", width: "168px", height: "288px", borderRadius: "10px",
                overflow: "hidden", border: "2px solid rgba(251,191,36,0.35)",
                background: "#1a1030",
                // Satori solo acepta "transform" con una función real —
                // "none" no parsea (a diferencia de un navegador real), por
                // eso la propiedad se omite del todo cuando no hay rotación.
                ...(c.invertida ? { transform: "rotate(180deg)" } : {}),
              },
            },
            dataUris[i]
              ? React.createElement("img", {
                  src: dataUris[i] as string,
                  width: 168, height: 288,
                  style: { objectFit: "cover" },
                })
              : React.createElement("div", { style: { display: "flex", width: "100%", height: "100%" } }),
          ),
        ),
      ),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: "40px" } },
        React.createElement(
          "span",
          { style: { fontSize: "24px", color: "#8b84a3", letterSpacing: "2px", fontFamily: "Cormorant Garamond" } },
          "Tirada realizada para",
        ),
        React.createElement(
          "span",
          { style: { fontSize: "44px", color: "#FFCE4D", fontWeight: 700, marginTop: "6px", fontFamily: "Cormorant Garamond" } },
          primerNombre,
        ),
      ),
    ),
    {
      width: IMG_W,
      height: IMG_H,
      fonts: [
        { name: "Cormorant Garamond", data: regular, weight: 500, style: "normal" },
        { name: "Cormorant Garamond", data: bold, weight: 700, style: "normal" },
      ],
    },
  );

  const bytes = new Uint8Array(await img.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_ASSETS)
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true });
  if (uploadErr) return null;

  const { data: signed, error: signedErr } = await supabase.storage
    .from(BUCKET_ASSETS)
    .createSignedUrl(storagePath, IMAGE_SIGNED_TTL_SEG);
  if (signedErr || !signed?.signedUrl) return null;

  return { signedUrl: signed.signedUrl };
}
