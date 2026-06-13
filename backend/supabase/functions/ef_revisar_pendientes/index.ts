// ============================================================
// ef_revisar_pendientes — Tarea CRON diaria
//
// Hace dos barridos:
//
// 1. VENCIMIENTOS: desactiva premium de suscriptores con
//    auto_renovacion_activa=false y fecha_vencimiento_premium < now.
//
// 2. PROVISIONALES EXPIRADOS: suscriptores que llevan más de
//    PROVISIONAL_TTL_HOURS en estado "activa_provisional" sin
//    recibir confirmación por webhook. Consulta MP para resolver:
//    - Si MP confirma "authorized" → pasa a "activa"
//    - Si MP dice otra cosa       → revierte a "pendiente_autorizacion"
//      con premium_activo=false
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROVISIONAL_TTL_HOURS = 24;
const FN = "ef_revisar_pendientes";

async function registrarLog(
  supabase: ReturnType<typeof createClient>,
  resultado: string,
  detalle: Record<string, unknown> = {},
  exito = true,
) {
  try {
    await supabase.from("log_funciones").insert([{
      nombre_funcion: FN,
      resultado,
      detalle,
      exito,
      creado_por: "system_cron",
    }]);
  } catch { /* non-blocking */ }
}

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mpToken    = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

  if (!supabaseUrl || !supabaseKey) {
    return json({ resultado: "error", mensaje: "Faltan variables de entorno Supabase" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  await registrarLog(supabase, "START", { mensaje: "Iniciando ef_revisar_pendientes" });

  const resumen: Record<string, unknown> = {};

  // ── 1. VENCIMIENTOS ──────────────────────────────────────────
  try {
    const { data: vencidos, error } = await supabase
      .from("suscriptores")
      .update({ premium_activo: false, estado_suscripcion: "vencida" })
      .eq("premium_activo", true)
      .eq("auto_renovacion_activa", false)
      .lt("fecha_vencimiento_premium", new Date().toISOString())
      .select("id");

    if (error) throw new Error(error.message);

    resumen.vencimientos = { procesados: vencidos?.length ?? 0, ids: vencidos?.map((s) => s.id) ?? [] };
    await registrarLog(supabase, "VENCIMIENTOS_OK", resumen.vencimientos as Record<string, unknown>);
  } catch (err) {
    resumen.vencimientos_error = String(err);
    await registrarLog(supabase, "VENCIMIENTOS_ERROR", { error: String(err) }, false);
  }

  // ── 2. PROVISIONALES EXPIRADOS ───────────────────────────────
  try {
    const cutoff = new Date(Date.now() - PROVISIONAL_TTL_HOURS * 3_600_000).toISOString();

    const { data: provisionales, error } = await supabase
      .from("suscriptores")
      .select("id, preapproval_id")
      .eq("estado_suscripcion", "activa_provisional")
      .lt("fecha_inicio_premium", cutoff);

    if (error) throw new Error(error.message);

    const lista = provisionales ?? [];
    let confirmados = 0;
    let revertidos  = 0;
    let sinToken    = 0;

    for (const s of lista) {
      // Sin preapproval_id: no se puede verificar → revertir
      if (!s.preapproval_id || !mpToken) {
        await supabase.from("suscriptores")
          .update({
            estado_suscripcion: "pendiente_autorizacion",
            premium_activo: false,
            premium_pendiente_confirmacion: false,
          })
          .eq("id", s.id);
        sinToken++;
        continue;
      }

      try {
        const mpRes = await fetch(
          `https://api.mercadopago.com/preapproval/${encodeURIComponent(s.preapproval_id)}`,
          { headers: { Authorization: `Bearer ${mpToken}` } },
        );
        const mpData = mpRes.ok ? await mpRes.json() : null;
        const mpStatus = mpData?.status ?? "unknown";

        if (mpStatus === "authorized") {
          await supabase.from("suscriptores")
            .update({
              estado_suscripcion: "activa",
              premium_pendiente_confirmacion: false,
              preapproval_status: "authorized",
              updated_at: new Date().toISOString(),
            })
            .eq("id", s.id);
          confirmados++;
        } else {
          await supabase.from("suscriptores")
            .update({
              estado_suscripcion: "pendiente_autorizacion",
              premium_activo: false,
              premium_pendiente_confirmacion: false,
              preapproval_status: mpStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", s.id);
          revertidos++;
        }
      } catch {
        // Error de red consultando MP — dejamos la fila para el próximo ciclo
      }
    }

    resumen.provisionales = {
      evaluados: lista.length,
      confirmados,
      revertidos,
      sin_token: sinToken,
    };
    await registrarLog(supabase, "PROVISIONALES_OK", resumen.provisionales as Record<string, unknown>);
  } catch (err) {
    resumen.provisionales_error = String(err);
    await registrarLog(supabase, "PROVISIONALES_ERROR", { error: String(err) }, false);
  }

  return json({ resultado: "ok", resumen });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
