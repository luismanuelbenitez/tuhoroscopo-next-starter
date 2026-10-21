// ============================================================
// ef_tarot_check_ordenes_trabadas — alerta "Orden trabada" (2026-10-21)
//
// Red de seguridad final del pipeline Tarot. Las demás alertas
// (error_generacion, error_pdf, error_whatsapp, error_email_cliente) solo
// saltan si la función llega a registrar el error; cuando el runtime corta
// una función (WallClockTime / CPUTime) la orden queda en un estado
// intermedio sin ningún aviso. Esta función, invocada por pg_cron cada 15
// minutos, busca órdenes PAGADAS (o de cortesía) que lleven más de
// TTC_ALERTAS_TIMEOUT_MINUTOS sin moverse en un estado intermedio y dispara
// la alerta orden_trabada (una sola vez por orden).
//
// Solo avisa: no reintenta, no cambia estados ni toca la orden.
// Auth: x-internal-key = TAROT_INTERNAL_KEY (el cron lo lee de Vault).
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { dispararAlerta } from "../_shared/tarot-alertas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_check_ordenes_trabadas";

// Estados intermedios posteriores al pago. Los error_* tienen su propia
// alerta; formulario_completo / pago_* (sin pagar) no son "trabadas".
const ESTADOS_EN_CURSO = [
  "pago_confirmado", "generando_lectura", "lectura_lista",
  "generando_pdf", "pdf_listo", "enviando_whatsapp",
];
const ETIQUETA: Record<string, string> = {
  pago_confirmado: "pago confirmado, sin iniciar la lectura",
  generando_lectura: "generando la lectura",
  lectura_lista: "lectura lista, sin generar el PDF",
  generando_pdf: "generando el PDF",
  pdf_listo: "PDF listo, sin enviar",
  enviando_whatsapp: "enviando por WhatsApp",
};
const TIMEOUT_DEFAULT_MIN = 30;
// No mirar órdenes de más de 3 días: evita alertar historia vieja de golpe.
const VENTANA_HORAS = 72;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function revisar() {
  const { data: cfg } = await supabase.from("tarot_configuracion")
    .select("valor").eq("clave", "TTC_ALERTAS_TIMEOUT_MINUTOS").eq("activo", true).maybeSingle();
  const minutos = Number(cfg?.valor) > 0 ? Number(cfg!.valor) : TIMEOUT_DEFAULT_MIN;
  const limite = new Date(Date.now() - minutos * 60_000).toISOString();
  const desde = new Date(Date.now() - VENTANA_HORAS * 3_600_000).toISOString();

  const { data: ordenes, error } = await supabase.from("tarot_ordenes")
    .select("id, estado, tipo_orden, external_reference, nombre_snapshot, created_at, updated_at")
    .in("estado", ESTADOS_EN_CURSO)
    .lt("updated_at", limite)
    .gte("created_at", desde);
  if (error) throw new Error("tarot_ordenes: " + error.message);
  if (!ordenes?.length) return { minutos, trabadas: 0, alertadas: 0 };

  // Una sola alerta por orden: dispararAlerta manda el email aunque el
  // evento ya exista, así que se filtra acá.
  const ids = ordenes.map((o) => o.id);
  const { data: previas } = await supabase.from("tarot_alertas_eventos")
    .select("orden_id").eq("tipo_alerta", "orden_trabada").in("orden_id", ids);
  const yaAvisadas = new Set((previas ?? []).map((p) => p.orden_id));

  let alertadas = 0;
  for (const o of ordenes) {
    if (yaAvisadas.has(o.id)) continue;
    const minutosQuieta = Math.round((Date.now() - new Date(o.updated_at ?? o.created_at).getTime()) / 60_000);
    await dispararAlerta(supabase, "orden_trabada", {
      ordenId: o.id,
      ordenRef: o.external_reference ?? undefined,
      clienteNombre: o.nombre_snapshot ?? undefined,
      etapa: `${ETIQUETA[o.estado] ?? o.estado} (${minutosQuieta} min sin avanzar)`,
      error: `Orden ${o.tipo_orden} en estado "${o.estado}" desde hace ${minutosQuieta} minutos.`,
    });
    await supabase.from("tarot_logs").insert({
      orden_id: o.id, evento: "orden_trabada_detectada", nivel: "warning",
      mensaje: `Orden sin avanzar ${minutosQuieta} min en "${o.estado}" — alerta enviada`,
      payload: { estado: o.estado, minutos_quieta: minutosQuieta, umbral_min: minutos }, funcion_origen: FN,
    });
    alertadas++;
  }
  return { minutos, trabadas: ordenes.length, alertadas };
}

serve(async (req) => {
  if (!TAROT_INTERNAL_KEY || req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    return json({ ok: true, ...(await revisar()) });
  } catch (e) {
    console.error(FN, e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
