// ============================================================
// ef_tarot_lectura_publica — Resuelve el acceso público "Ver mi tirada"
//
// Llamada exclusivamente server-side desde Next.js (x-internal-key) —
// nunca directo desde el navegador. El navegador solo conoce el token,
// nunca el orden_id ni ninguna credencial de Supabase.
//
// accion "ver": valida el token y devuelve todo lo necesario para
//   renderizar /lectura/[token] (nombre, pregunta, cartas con imagen
//   firmada, resumen, mensaje, próximos pasos).
// accion "pdf": valida el token y devuelve una signed URL fresca del PDF
//   de esa orden (el storage_url guardado en tarot_pdfs expira a las
//   48h — este endpoint firma una nueva en cada click para que el CTA
//   siga funcionando durante los 30 días de vida del token).
//
// No modifica tarot_ordenes, tarot_lecturas ni tarot_pdfs — es de solo
// lectura salvo por el contador de aperturas en tarot_accesos_web y el
// registro de eventos en funnel_events (sin PII, solo IDs técnicos).
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY        = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";

const BUCKET_ASSETS = "tarot-assets";
const BUCKET_PDFS   = "tarot-pdfs";
const IMG_SIGNED_TTL_SEG = 6 * 3600;
const PDF_SIGNED_TTL_SEG = 3600;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function logFunnelEvent(event: {
  order_id: string; session_id?: string | null; event_name: string; metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from("funnel_events").insert({
      order_id:     event.order_id,
      session_id:   event.session_id ?? null,
      event_name:   event.event_name,
      product_id:   "tarot_one_shot",
      product_name: "Lectura de tarot personalizada",
      metadata:     event.metadata ?? {},
    });
  } catch (err) {
    console.warn("[analytics] funnel_events insert failed", { event_name: event.event_name, error: err });
  }
}

interface Acceso {
  id: string;
  orden_id: string;
  estado: string;
  expira_at: string;
}

/** Resuelve el token a un acceso vigente. No distingue "no existe" de
 * "token con formato inválido" — ambos son simplemente no encontrado. */
async function resolverToken(token: string): Promise<
  | { ok: true; acceso: Acceso }
  | { ok: false; motivo: "no_encontrado" }
  | { ok: false; motivo: "expirado"; ordenId: string }
> {
  const hash = await sha256Hex(token);
  const { data: acceso } = await supabase
    .from("tarot_accesos_web")
    .select("id, orden_id, estado, expira_at")
    .eq("token_hash", hash)
    .maybeSingle() as { data: Acceso | null };

  if (!acceso || acceso.estado !== "activo") return { ok: false, motivo: "no_encontrado" };
  if (new Date(acceso.expira_at).getTime() <= Date.now()) {
    return { ok: false, motivo: "expirado", ordenId: acceso.orden_id };
  }
  return { ok: true, acceso };
}

serve(async (req) => {
  const key = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || key !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON_INVALIDO" }, 400); }

  const token = String(body.token ?? "").trim();
  const accion = String(body.accion ?? "ver");
  if (!token) return json({ ok: false, error: "TOKEN_REQUERIDO" }, 400);
  if (accion !== "ver" && accion !== "pdf") return json({ ok: false, error: "ACCION_INVALIDA" }, 400);

  const resuelto = await resolverToken(token);

  if (!resuelto.ok) {
    if (resuelto.motivo === "expirado") {
      const { data: orden } = await supabase
        .from("tarot_ordenes").select("funnel_session_id").eq("id", resuelto.ordenId).maybeSingle();
      await logFunnelEvent({
        order_id: resuelto.ordenId,
        session_id: (orden as { funnel_session_id?: string | null } | null)?.funnel_session_id ?? null,
        event_name: "mobile_reading_expired",
      });
    }
    return json({ ok: false, motivo: resuelto.motivo });
  }

  const ordenId = resuelto.acceso.orden_id;

  const { data: orden } = await supabase
    .from("tarot_ordenes")
    .select("nombre_snapshot, pregunta_usuario, funnel_session_id")
    .eq("id", ordenId)
    .maybeSingle();

  if (!orden) return json({ ok: false, motivo: "orden_no_encontrada" }, 404);

  if (accion === "pdf") {
    const { data: pdf } = await supabase
      .from("tarot_pdfs")
      .select("storage_bucket, storage_path")
      .eq("orden_id", ordenId)
      .eq("estado", "listo")
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pdf?.storage_path) return json({ ok: false, motivo: "pdf_no_disponible" }, 409);

    const { data: signed, error: signedErr } = await supabase.storage
      .from(pdf.storage_bucket || BUCKET_PDFS)
      .createSignedUrl(pdf.storage_path, PDF_SIGNED_TTL_SEG);

    if (signedErr || !signed?.signedUrl) return json({ ok: false, motivo: "firma_pdf_fallo" }, 500);

    await logFunnelEvent({
      order_id: ordenId,
      session_id: orden.funnel_session_id ?? null,
      event_name: "mobile_pdf_clicked",
    });

    return json({ ok: true, url: signed.signedUrl });
  }

  // accion === "ver"
  const { data: lectura } = await supabase
    .from("tarot_lecturas")
    .select("contenido_json")
    .eq("orden_id", ordenId)
    .eq("es_vigente", true)
    .maybeSingle();

  const contenido = lectura?.contenido_json as {
    cartas?: Array<{ posicion: number; nombre_posicion: string; carta_id: string; nombre_carta: string; orientacion: string; interpretacion: string; consejo: string }>;
    resumen_lectura?: string;
    mensaje_final?: string;
    proximos_pasos?: string[];
    pregunta?: string | null;
  } | null;

  if (!contenido) return json({ ok: false, motivo: "lectura_no_disponible" }, 409);

  // Resolución por carta_id (fijado por ef_tarot_generar_lectura al momento
  // del sorteo, mismo campo que ya usa _shared/tarot-imagen-whatsapp.ts) —
  // NO por nombre_es. Hay dos mazos ACTIVOS simultáneamente (rws-thc,
  // rws-classic) y comparten nombres de carta ("El Loco", "As de Bastos",
  // etc.), así que buscar por nombre podía traer la imagen del mazo
  // equivocado. carta_id es la clave primaria de tarot_cartas — exacta,
  // sin ambigüedad posible entre mazos.
  const idsCartas = (contenido.cartas ?? []).map((c) => c.carta_id).filter(Boolean);
  const { data: cartasImg } = idsCartas.length
    ? await supabase.from("tarot_cartas").select("id, imagen_storage_path, imagen_url").in("id", idsCartas)
    : { data: [] as Array<{ id: string; imagen_storage_path: string | null; imagen_url: string | null }> };

  const pathPorId = new Map<string, string>();
  for (const c of cartasImg ?? []) {
    const path = c.imagen_storage_path ?? c.imagen_url ?? "";
    if (path) pathPorId.set(c.id, path);
  }

  const cartas = await Promise.all(
    (contenido.cartas ?? []).map(async (c) => {
      const path = pathPorId.get(c.carta_id) ?? null;
      let imagenUrl: string | null = null;
      if (path) {
        const { data: signed } = await supabase.storage
          .from(BUCKET_ASSETS)
          .createSignedUrl(path, IMG_SIGNED_TTL_SEG);
        imagenUrl = signed?.signedUrl ?? null;
      }
      return {
        posicion:       c.posicion,
        nombre_carta:   c.nombre_carta,
        orientacion:    c.orientacion,
        interpretacion: c.interpretacion,
        imagen_url:     imagenUrl,
      };
    }),
  );

  const tsNow = new Date().toISOString();
  const { data: accesoActual } = await supabase
    .from("tarot_accesos_web")
    .select("first_opened_at, opened_count")
    .eq("id", resuelto.acceso.id)
    .maybeSingle();

  await supabase.from("tarot_accesos_web").update({
    opened_count: (accesoActual?.opened_count ?? 0) + 1,
    first_opened_at: accesoActual?.first_opened_at ?? tsNow,
    last_opened_at: tsNow,
    updated_at: tsNow,
  }).eq("id", resuelto.acceso.id);

  await logFunnelEvent({
    order_id: ordenId,
    session_id: orden.funnel_session_id ?? null,
    event_name: "mobile_reading_opened",
  });

  return json({
    ok: true,
    nombre: orden.nombre_snapshot,
    pregunta: contenido.pregunta ?? orden.pregunta_usuario ?? null,
    cartas,
    resumen_lectura: contenido.resumen_lectura ?? "",
    mensaje_final: contenido.mensaje_final ?? "",
    proximos_pasos: contenido.proximos_pasos ?? [],
    expira_at: resuelto.acceso.expira_at,
  });
});
