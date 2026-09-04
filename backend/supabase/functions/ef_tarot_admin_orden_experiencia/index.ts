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

interface AccesoRow {
  estado: string;
  created_at: string;
  expira_at: string;
  opened_count: number;
}

async function leerAcceso(ordenId: string): Promise<AccesoRow | null> {
  const { data } = await supabase
    .from("tarot_accesos_web")
    .select("estado, created_at, expira_at, opened_count")
    .eq("orden_id", ordenId)
    .maybeSingle();
  return (data as AccesoRow | null) ?? null;
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
    .select("id")
    .eq("id", ordenId)
    .maybeSingle();
  if (errOrden || !orden) return jsonResponse({ ok: false, motivo: "orden_no_encontrada" }, 404);

  switch (accion) {
    case "estado": {
      const acceso = await leerAcceso(ordenId);
      return jsonResponse({ ok: true, acceso });
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
