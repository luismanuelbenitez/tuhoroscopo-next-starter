// ============================================================================
// ef_tarot_admin_orden_experiencia — Preview admin de la experiencia real del
// cliente para una orden: acceso web ("Ver mi tirada"), PDF y cabezal de
// WhatsApp.
//
// Objetivo: permitir hacer una orden de QA y abrir desde el celular
// EXACTAMENTE lo mismo que recibirá el comprador — sin URLs de preview
// alternativas. Por eso este archivo NO genera nada nuevo: reutiliza
// exactamente crearAccesoWeb() y generarImagenWhatsapp(), los mismos
// helpers que usa ef_tarot_enviar_whatsapp en el pipeline real.
//
// El token de acceso NUNCA se persiste en texto plano (mismo diseño que
// _shared/tarot-accesos.ts) — accion "generar_acceso" es la única forma de
// obtenerlo, y solo se devuelve una vez, en esa respuesta. Regenerar
// invalida cualquier token anterior (incluido uno ya entregado a un
// cliente real) — el admin decide cuándo hacerlo, este archivo no lo
// impide ni lo oculta.
//
// Gateada por x-internal-key, solo llamada desde rutas admin server-side.
// No la llama ningún paso del pipeline de entrega real.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { crearAccesoWeb } from "../_shared/tarot-accesos.ts";
import { generarImagenWhatsapp } from "../_shared/tarot-imagen-whatsapp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_orden_experiencia";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function log(ordenId: string, evento: string, payload: Record<string, unknown>) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId,
      evento,
      nivel: "info",
      mensaje: evento,
      funcion_origen: FUNCION,
      payload,
    });
  } catch (e) {
    console.error(`[${FUNCION}] error registrando log`, e);
  }
}

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().substring(0, max);
  return t ? t : null;
}

// Mismos valores que BUCKET_ASSETS/IMAGE_SIGNED_TTL_SEG en
// _shared/tarot-imagen-whatsapp.ts — no se importan desde ahí para no
// tener que redesplegar ef_tarot_enviar_whatsapp (bundlea ese shared) por
// un cambio que es puramente de lectura de estado, no de generación.
const BUCKET_ASSETS = "tarot-assets";
const IMAGE_SIGNED_TTL_SEG = 24 * 3600;

interface AccesoRow {
  estado: string;
  created_at: string;
  expira_at: string;
  opened_count: number;
  last_opened_at: string | null;
}

async function leerAcceso(ordenId: string): Promise<AccesoRow | null> {
  const { data } = await supabase
    .from("tarot_accesos_web")
    .select("estado, created_at, expira_at, opened_count, last_opened_at")
    .eq("orden_id", ordenId)
    .maybeSingle();
  return (data as AccesoRow | null) ?? null;
}

// Solo lee si el PNG ya existe en Storage (list, sin generar) y, si existe,
// firma una URL — nunca compone la imagen. Mismo storagePath que usa
// generarImagenWhatsapp(); no se llama a esa función acá para no disparar
// una generación real solo por abrir el detalle de la orden.
async function leerImagenEstado(ordenId: string): Promise<{ existe: boolean; signedUrl: string | null }> {
  const { data: existente } = await supabase.storage.from(BUCKET_ASSETS).list("tarot/whatsapp", {
    search: `${ordenId}.png`,
  });
  if (!existente || existente.length === 0) return { existe: false, signedUrl: null };
  const { data: signed } = await supabase.storage
    .from(BUCKET_ASSETS)
    .createSignedUrl(`tarot/whatsapp/${ordenId}.png`, IMAGE_SIGNED_TTL_SEG);
  return { existe: true, signedUrl: signed?.signedUrl ?? null };
}

async function leerEmail(ordenId: string, emailSolicitado: boolean | null): Promise<{ aplica: boolean; estado: string | null }> {
  const { data } = await supabase
    .from("tarot_envios_email")
    .select("estado")
    .eq("orden_id", ordenId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const estado = (data as { estado: string } | null)?.estado ?? null;
  return { aplica: Boolean(emailSolicitado) || estado !== null, estado };
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const ordenId = texto(body.orden_id, 100);
  const accion = texto(body.accion, 50);
  const operador = texto(body.operador, 100) ?? "admin";

  if (!ordenId) return jsonResponse({ ok: false, motivo: "orden_id_requerido" }, 400);

  const { data: orden, error: errOrden } = await supabase
    .from("tarot_ordenes")
    .select("id, nombre_snapshot, email_solicitado")
    .eq("id", ordenId)
    .maybeSingle();
  if (errOrden || !orden) return jsonResponse({ ok: false, motivo: "orden_no_encontrada" }, 404);

  switch (accion) {
    case "estado": {
      const [acceso, imagen, email] = await Promise.all([
        leerAcceso(ordenId),
        leerImagenEstado(ordenId),
        leerEmail(ordenId, orden.email_solicitado as boolean | null),
      ]);
      return jsonResponse({
        ok: true,
        nombre_snapshot: orden.nombre_snapshot as string | null,
        acceso,
        imagen,
        email,
      });
    }

    case "generar_acceso": {
      const existiaAntes = await leerAcceso(ordenId);
      let resultado;
      try {
        resultado = await crearAccesoWeb(supabase, ordenId);
      } catch (e) {
        return jsonResponse({ ok: false, motivo: "generacion_fallo", error: String(e) }, 500);
      }
      const acceso = await leerAcceso(ordenId);
      await log(ordenId, "experiencia_cliente_acceso_generado", {
        operador, regenerado: Boolean(existiaAntes),
      });
      return jsonResponse({
        ok: true,
        token: resultado.token,
        path: resultado.path,
        acceso,
      });
    }

    case "ver_imagen":
    case "regenerar_imagen": {
      const forzar = accion === "regenerar_imagen";
      const resultado = await generarImagenWhatsapp(supabase, ordenId, { forzar });
      if (!resultado?.signedUrl) {
        return jsonResponse({ ok: false, motivo: "generacion_fallo" }, 500);
      }
      if (forzar) {
        await log(ordenId, "experiencia_cliente_imagen_regenerada", { operador });
      }
      return jsonResponse({ ok: true, signedUrl: resultado.signedUrl });
    }

    default:
      return jsonResponse({ ok: false, motivo: "accion_invalida" }, 400);
  }
});
