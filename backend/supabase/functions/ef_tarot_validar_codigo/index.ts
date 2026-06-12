// ============================================================================
// ef_tarot_validar_codigo
// Valida un código de descuento y crea una reserva (estado: 'reservado').
// Debe llamarse al iniciar el checkout, antes de crear la preferencia de pago.
//
// INPUT (POST):
//   codigo          string  requerido
//   moneda          string  requerido  UYU | ARS
//   precio_base     number  requerido  precio sin descuento
//   cliente_id      uuid    opcional
//   telefono        string  opcional   para trazabilidad y cupo por cliente
//   email           string  opcional
//   orden_id        uuid    opcional   si ya existe la orden
//   origen          string  opcional   'formulario_web' | 'api' | etc.
//   log             bool    opcional   fuerza log aunque debug_mode=false
//
// OUTPUT OK:
//   { ok, valido:true, uso_id, codigo_id, tipo_descuento, precio_original,
//     precio_aplicado, descuento_aplicado, moneda, expira_at }
//
// OUTPUT INVALIDO:
//   { ok, valido:false, motivo }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY      = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION                 = "ef_tarot_validar_codigo";
const RESERVA_MINUTOS         = 30;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function nowISO() { return new Date().toISOString(); }

function normTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim(); return s || null;
}
function normUUID(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}
function normNumero(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isFinite(n) && n >= 0 ? n : null;
}
async function leerBody(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return (b && typeof b === "object") ? b : {}; }
  catch { return {}; }
}

async function getDebugMode(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("tarot_configuracion").select("valor").eq("clave", "debug_mode").single();
    return data?.valor === "true";
  } catch { return false; }
}

async function log(
  evento: string,
  payload: Record<string, unknown>,
  nivel: "debug" | "info" | "warning" | "error",
  dbg: boolean,
  orden_id?: string | null,
  cliente_id?: string | null,
) {
  if (nivel === "debug" && !dbg) return;
  try {
    await supabase.from("tarot_logs").insert([{
      evento, nivel, funcion_origen: FUNCION,
      payload, mensaje: evento,
      orden_id: orden_id ?? null,
      cliente_id: cliente_id ?? null,
    }]);
  } catch (e) { console.error(`[${FUNCION}] log error`, e); }
}

// ── cálculo de precio ─────────────────────────────────────────────────────────

type Calculo = { precio_aplicado: number; descuento_aplicado: number };

function calcularPrecio(
  tipo: string,
  valor: number | null,
  precioFijoUyu: number | null,
  precioFijoArs: number | null,
  precioBase: number,
  moneda: string,
): Calculo | null {
  if (tipo === "porcentaje" && valor !== null) {
    const desc = Math.round(precioBase * (valor / 100) * 100) / 100;
    return { precio_aplicado: Math.max(0, precioBase - desc), descuento_aplicado: desc };
  }
  if (tipo === "monto_fijo" && valor !== null) {
    const desc = Math.min(valor, precioBase);
    return { precio_aplicado: Math.max(0, precioBase - desc), descuento_aplicado: desc };
  }
  if (tipo === "precio_fijo") {
    const fijo = moneda === "ARS" ? precioFijoArs : precioFijoUyu;
    if (fijo === null) return null;
    return { precio_aplicado: fijo, descuento_aplicado: Math.max(0, precioBase - fijo) };
  }
  return null;
}

// ── handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  // 1. Seguridad
  if (req.headers.get("x-internal-key") !== TAROT_INTERNAL_KEY)
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST")
    return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body      = await leerBody(req);
  const dbg       = await getDebugMode();
  const shouldLog = body.log === true;

  const codigoRaw  = typeof body.codigo === "string" ? body.codigo.trim().toUpperCase() : "";
  const moneda     = normTexto(body.moneda)?.toUpperCase() ?? "UYU";
  const precioBase = normNumero(body.precio_base);
  const clienteId  = normUUID(body.cliente_id);
  const ordenId    = normUUID(body.orden_id);
  const telefono   = normTexto(body.telefono);
  const email      = normTexto(body.email);
  const origen     = normTexto(body.origen) ?? "api";

  await log("inicio", { codigo_raw: body.codigo, moneda, precio_base: precioBase, origen }, "debug", dbg, ordenId, clienteId);

  // 2. Input básico
  if (!codigoRaw)
    return jsonResponse({ ok: true, valido: false, motivo: "codigo_requerido" });
  if (!["UYU", "ARS"].includes(moneda))
    return jsonResponse({ ok: true, valido: false, motivo: "moneda_invalida" });
  if (precioBase === null || precioBase <= 0)
    return jsonResponse({ ok: true, valido: false, motivo: "precio_base_invalido" });

  // 3. Buscar código (case-insensitive via índice UPPER)
  const { data: codigo, error: errCodigo } = await supabase
    .from("tarot_codigos_descuento")
    .select("*")
    .ilike("codigo", codigoRaw)
    .single();

  if (errCodigo || !codigo) {
    await log("codigo_no_encontrado", { codigo: codigoRaw }, "info", dbg || shouldLog, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "codigo_no_encontrado" });
  }
  await log("codigo_encontrado", { codigo_id: codigo.id, tipo: codigo.tipo_descuento }, "debug", dbg, ordenId, clienteId);

  // 4. Activo
  if (!codigo.activo) {
    await log("codigo_inactivo", { codigo_id: codigo.id }, "info", dbg || shouldLog, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "codigo_inactivo" });
  }

  // 5. Vigencia de fechas
  const ahora = Date.now();
  if (codigo.fecha_inicio && new Date(codigo.fecha_inicio).getTime() > ahora) {
    await log("codigo_no_vigente_aun", { codigo_id: codigo.id, fecha_inicio: codigo.fecha_inicio }, "info", dbg || shouldLog, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "fuera_de_vigencia" });
  }
  if (codigo.fecha_fin && new Date(codigo.fecha_fin).getTime() < ahora) {
    await log("codigo_expirado_fecha", { codigo_id: codigo.id, fecha_fin: codigo.fecha_fin }, "info", dbg || shouldLog, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "codigo_expirado" });
  }
  await log("check_fechas_ok", {}, "debug", dbg, ordenId, clienteId);

  // 6. Moneda aplicable
  if (!Array.isArray(codigo.monedas_aplicables) || !codigo.monedas_aplicables.includes(moneda)) {
    await log("moneda_no_aplica", { codigo_id: codigo.id, moneda, aplicables: codigo.monedas_aplicables }, "info", dbg || shouldLog, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "moneda_no_aplica" });
  }

  // 7. Cupo global
  if (codigo.max_usos_total !== null && codigo.usos_actuales >= codigo.max_usos_total) {
    await log("cupo_agotado", { codigo_id: codigo.id, usos: codigo.usos_actuales, max: codigo.max_usos_total }, "info", dbg || shouldLog, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "cupo_agotado" });
  }
  await log("check_cupo_global_ok", { usos: codigo.usos_actuales }, "debug", dbg, ordenId, clienteId);

  // 8. Cupo por cliente
  if (codigo.max_usos_por_cliente !== null && (clienteId || email || telefono)) {
    let q = supabase
      .from("tarot_codigos_descuento_usos")
      .select("id", { count: "exact", head: true })
      .eq("codigo_id", codigo.id)
      .in("estado_uso", ["reservado", "aplicado"]);
    if (clienteId)      q = q.eq("cliente_id", clienteId);
    else if (email)     q = q.eq("email", email);
    else if (telefono)  q = q.eq("telefono", telefono);

    const { count: usosCliente } = await q;
    if ((usosCliente ?? 0) >= codigo.max_usos_por_cliente) {
      await log("limite_cliente_alcanzado", { codigo_id: codigo.id, usos_cliente: usosCliente, max: codigo.max_usos_por_cliente }, "info", dbg || shouldLog, ordenId, clienteId);
      return jsonResponse({ ok: true, valido: false, motivo: "limite_por_cliente_alcanzado" });
    }
    await log("check_cupo_cliente_ok", { usos_cliente: usosCliente }, "debug", dbg, ordenId, clienteId);
  }

  // 9. Solo nuevos clientes
  if (codigo.solo_nuevos_clientes && clienteId) {
    const { count: ordenesExistentes } = await supabase
      .from("tarot_ordenes")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .not("estado", "in", "(formulario_completo,pago_iniciado,pago_rechazado,pago_expirado,cancelado,error_critico)");

    if ((ordenesExistentes ?? 0) > 0) {
      await log("cliente_no_es_nuevo", { codigo_id: codigo.id, ordenes: ordenesExistentes }, "info", dbg || shouldLog, ordenId, clienteId);
      return jsonResponse({ ok: true, valido: false, motivo: "solo_nuevos_clientes" });
    }
    await log("check_nuevo_cliente_ok", {}, "debug", dbg, ordenId, clienteId);
  }

  // 10. Calcular precio
  const calculo = calcularPrecio(
    codigo.tipo_descuento,
    codigo.valor_descuento !== null ? Number(codigo.valor_descuento) : null,
    codigo.precio_fijo_uyu !== null ? Number(codigo.precio_fijo_uyu) : null,
    codigo.precio_fijo_ars !== null ? Number(codigo.precio_fijo_ars) : null,
    precioBase,
    moneda,
  );
  if (!calculo) {
    await log("error_calculo", { tipo: codigo.tipo_descuento, moneda }, "error", true, ordenId, clienteId);
    return jsonResponse({ ok: false, motivo: "error_calculo_descuento" }, 500);
  }
  await log("precio_calculado", { precio_original: precioBase, precio_aplicado: calculo.precio_aplicado, descuento: calculo.descuento_aplicado }, "debug", dbg, ordenId, clienteId);

  // 11. Crear reserva
  const expiraAt = new Date(Date.now() + RESERVA_MINUTOS * 60_000).toISOString();
  const { data: uso, error: errUso } = await supabase
    .from("tarot_codigos_descuento_usos")
    .insert([{
      codigo_id:           codigo.id,
      codigo:              codigo.codigo,
      orden_id:            ordenId,
      cliente_id:          clienteId,
      telefono,
      email,
      estado_uso:          "reservado",
      moneda,
      precio_original:     precioBase,
      precio_aplicado:     calculo.precio_aplicado,
      descuento_aplicado:  calculo.descuento_aplicado,
      origen,
      fecha_reserva:       nowISO(),
      fecha_expiracion:    expiraAt,
      creado_por:          FUNCION,
    }])
    .select("id")
    .single();

  if (errUso || !uso) {
    await log("error_creando_reserva", { codigo_id: codigo.id, error: errUso?.message }, "error", true, ordenId, clienteId);
    return jsonResponse({ ok: false, motivo: "error_creando_reserva", detalle: errUso?.message }, 500);
  }

  // 12. Incremento atómico del contador (RPC con condición de cupo)
  const { data: incrementado, error: errInc } = await supabase
    .rpc("tarot_incrementar_usos_codigo", {
      p_codigo_id:      codigo.id,
      p_max_usos_total: codigo.max_usos_total,
    });

  if (errInc || !incrementado) {
    // Race condition: cupo se llenó entre la validación y el incremento → revertir reserva
    await supabase.from("tarot_codigos_descuento_usos").delete().eq("id", uso.id);
    await log("cupo_agotado_race_condition", { codigo_id: codigo.id }, "warning", true, ordenId, clienteId);
    return jsonResponse({ ok: true, valido: false, motivo: "cupo_agotado" });
  }
  await log("usos_incrementados", { codigo_id: codigo.id }, "debug", dbg, ordenId, clienteId);

  // 13. Log de éxito y respuesta
  await log("codigo_reservado_ok", {
    uso_id: uso.id, codigo_id: codigo.id,
    precio_aplicado: calculo.precio_aplicado, descuento: calculo.descuento_aplicado,
  }, "info", true, ordenId, clienteId);

  return jsonResponse({
    ok:                 true,
    valido:             true,
    uso_id:             uso.id,
    codigo_id:          codigo.id,
    tipo_descuento:     codigo.tipo_descuento,
    precio_original:    precioBase,
    precio_aplicado:    calculo.precio_aplicado,
    descuento_aplicado: calculo.descuento_aplicado,
    moneda,
    expira_at:          expiraAt,
  });
});
