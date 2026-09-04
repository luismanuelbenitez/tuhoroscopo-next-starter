// ============================================================================
// 🧾 EDGE FUNCTION: ef_tarot_admin_facturacion_accion
// Acciones administrativas sobre un registro de facturación:
//   marcar_solicitado | registrar_comprobante | corregir_comprobante |
//   agregar_observacion | anular
// Todas registran auditoría en tarot_logs (funcion_origen = esta EF).
// El sistema NUNCA genera un número fiscal — solo registra lo que el admin
// ya emitió por fuera del sistema.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_facturacion_accion";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function log(registroId: string, evento: string, payload: Record<string, unknown>) {
  try {
    await supabase.from("tarot_logs").insert({
      evento,
      nivel: "info",
      mensaje: evento,
      funcion_origen: FUNCION,
      payload: { registro_id: registroId, ...payload },
    });
  } catch (e) {
    console.error(`[${FUNCION}] error registrando log`, e);
  }
}

function texto(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().substring(0, max);
  return t ? t : null;
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const id = texto(body.id, 100);
  const accion = texto(body.accion, 50);
  const operador = texto(body.operador, 100) ?? "admin";

  if (!id) return jsonResponse({ ok: false, motivo: "id_requerido" }, 400);

  const { data: registro, error: errFetch } = await supabase
    .from("tarot_registros_facturacion")
    .select("id, estado_registro, estado_comprobante, comprobante_solicitado, observaciones")
    .eq("id", id)
    .maybeSingle();

  if (errFetch || !registro) return jsonResponse({ ok: false, motivo: "registro_no_encontrado" }, 404);

  if (registro.estado_registro === "anulado" && accion !== "agregar_observacion") {
    return jsonResponse({ ok: false, motivo: "registro_anulado" }, 409);
  }

  const ahora = new Date().toISOString();

  switch (accion) {
    case "marcar_solicitado": {
      const nuevoEstado = registro.estado_comprobante === "no_solicitado" ? "pendiente" : registro.estado_comprobante;
      const { error } = await supabase.from("tarot_registros_facturacion").update({
        comprobante_solicitado: true,
        estado_comprobante: nuevoEstado,
        actualizado_por: operador,
        updated_at: ahora,
      }).eq("id", id);
      if (error) return jsonResponse({ ok: false, motivo: "update_error", error: error.message }, 500);
      await log(id, "facturacion_comprobante_solicitado", { operador });
      return jsonResponse({ ok: true });
    }

    case "registrar_comprobante":
    case "corregir_comprobante": {
      const tipo = texto(body.tipo_comprobante, 100);
      const serie = texto(body.serie_comprobante, 20);
      const numero = texto(body.numero_comprobante, 50);
      const fecha = texto(body.fecha_comprobante, 20); // YYYY-MM-DD

      if (!numero) return jsonResponse({ ok: false, motivo: "numero_comprobante_requerido" }, 400);
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return jsonResponse({ ok: false, motivo: "fecha_comprobante_invalida" }, 400);
      }

      const { error } = await supabase.from("tarot_registros_facturacion").update({
        tipo_comprobante: tipo,
        serie_comprobante: serie,
        numero_comprobante: numero,
        fecha_comprobante: fecha,
        origen_comprobante: "manual_papel",
        comprobante_solicitado: true,
        estado_comprobante: "emitido",
        actualizado_por: operador,
        updated_at: ahora,
      }).eq("id", id);

      if (error) {
        // 23505 = unique_violation → duplicado de serie+número entre registros activos (Task F)
        if (error.code === "23505") {
          return jsonResponse({ ok: false, motivo: "comprobante_duplicado" }, 409);
        }
        return jsonResponse({ ok: false, motivo: "update_error", error: error.message }, 500);
      }
      await log(id, accion === "registrar_comprobante" ? "facturacion_comprobante_registrado" : "facturacion_comprobante_corregido",
        { operador, tipo, serie, numero, fecha });
      return jsonResponse({ ok: true });
    }

    case "agregar_observacion": {
      const observacion = texto(body.observacion, 1000);
      if (!observacion) return jsonResponse({ ok: false, motivo: "observacion_requerida" }, 400);
      const { error } = await supabase.from("tarot_registros_facturacion").update({
        observaciones: observacion,
        actualizado_por: operador,
        updated_at: ahora,
      }).eq("id", id);
      if (error) return jsonResponse({ ok: false, motivo: "update_error", error: error.message }, 500);
      await log(id, "facturacion_observacion_agregada", { operador });
      return jsonResponse({ ok: true });
    }

    case "anular": {
      if (registro.estado_registro === "anulado") {
        return jsonResponse({ ok: false, motivo: "ya_anulado" }, 409);
      }
      const motivo = texto(body.motivo, 500);
      if (!motivo) return jsonResponse({ ok: false, motivo: "motivo_requerido" }, 400);
      const { error } = await supabase.from("tarot_registros_facturacion").update({
        estado_registro: "anulado",
        anulado_at: ahora,
        anulado_motivo: motivo,
        anulado_por: operador,
        actualizado_por: operador,
        updated_at: ahora,
      }).eq("id", id);
      if (error) return jsonResponse({ ok: false, motivo: "update_error", error: error.message }, 500);
      await log(id, "facturacion_registro_anulado", { operador, motivo });
      return jsonResponse({ ok: true });
    }

    default:
      return jsonResponse({ ok: false, motivo: "accion_invalida" }, 400);
  }
});
