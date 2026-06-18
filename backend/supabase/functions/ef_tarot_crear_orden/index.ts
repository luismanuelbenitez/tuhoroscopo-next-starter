// ============================================================
// ef_tarot_crear_orden — Sprint 2
// Recibe los datos del formulario, crea cliente + orden en BD,
// genera la preferencia de pago en Mercado Pago y devuelve
// el link de pago al frontend.
// No toca ninguna tabla del SaaS THC.
// ============================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
// URL base a donde redirigir al usuario tras el pago (back_urls de MP)
// Ejemplo: https://tuhoroscopocosmico.com/tarot/estado/
const FN = "ef_tarot_crear_orden";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getConfigValue(clave: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("config")
      .select("valor")
      .eq("nombre", clave)
      .maybeSingle();
    return data?.valor ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Helpers ─────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

async function registrarLog(
  ordenId: string | null,
  clienteId: string | null,
  evento: string,
  nivel: "debug" | "info" | "warning" | "error" | "critical",
  mensaje: string,
  payload: unknown = {},
  ip?: string,
  duracion_ms?: number,
) {
  try {
    await supabase.from("tarot_logs").insert({
      orden_id: ordenId,
      cliente_id: clienteId,
      evento,
      nivel,
      mensaje,
      payload: payload ?? {},
      ip: ip ?? null,
      funcion_origen: FN,
      duracion_ms: duracion_ms ?? null,
    });
  } catch (e) {
    console.error("FATAL: tarot_logs insert falló:", e);
  }
}

// Normaliza teléfono a E.164. Soporta Uruguay y Argentina.
function normalizarTelefono(raw: string): string | null {
  const limpio = raw.replace(/[\s\-().]/g, "");
  // Ya en E.164
  if (/^\+\d{8,15}$/.test(limpio)) return limpio;
  // Uruguay: 09XXXXXXXX → +598 9XXXXXXXX
  if (/^09\d{7}$/.test(limpio)) return "+598" + limpio.slice(1);
  // Uruguay: 9XXXXXXXX → +598 9XXXXXXXX
  if (/^9\d{7}$/.test(limpio)) return "+598" + limpio;
  // Argentina: 011XXXXXXXX → +5411XXXXXXXX
  if (/^0\d{9,10}$/.test(limpio)) return "+54" + limpio.slice(1);
  return null;
}

// Hash SHA-256 para deduplicación suave de clientes
async function hashCliente(nombre: string, telefono: string, fechaNac: string): Promise<string> {
  const input = new TextEncoder().encode(
    `${nombre.toLowerCase().trim()}|${telefono}|${fechaNac}`,
  );
  const buf = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Handler principal ────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("OK", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("OK", { headers: CORS_HEADERS });

  const t0 = Date.now();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // ── 1. Parsear body ──────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON_INVALIDO" }, 400);
  }

  const {
    nombre_completo,
    telefono: telefonoRaw,
    fecha_nacimiento,
    hora_nacimiento,
    lugar_nacimiento,
    email,
    pregunta_usuario,
    tema,
    moneda,
    acepto_terminos,
    acepto_privacidad,
    codigo_descuento_uso_id,
    utm_source,
    utm_medium,
    utm_campaign,
    pagina_origen,
    version_terminos = "v1.0",
  } = body;

  // ── 2. Validaciones de entrada ───────────────────────────
  if (!nombre_completo || typeof nombre_completo !== "string" || nombre_completo.trim().length < 2) {
    return json({ ok: false, error: "NOMBRE_REQUERIDO" }, 400);
  }
  if (!telefonoRaw || typeof telefonoRaw !== "string") {
    return json({ ok: false, error: "TELEFONO_REQUERIDO" }, 400);
  }
  if (!acepto_terminos) {
    return json({ ok: false, error: "TERMINOS_NO_ACEPTADOS" }, 400);
  }
  if (!acepto_privacidad) {
    return json({ ok: false, error: "PRIVACIDAD_NO_ACEPTADA" }, 400);
  }

  const telefono = normalizarTelefono(telefonoRaw as string);
  if (!telefono) {
    return json({
      ok: false,
      error: "TELEFONO_INVALIDO",
      hint: "Usá el formato +598XXXXXXXX para Uruguay o +54XXXXXXXXXX para Argentina",
    }, 400);
  }

  // Normalizar tema y moneda con fallback
  const TEMAS_VALIDOS   = ["general", "amor", "trabajo", "salud", "dinero", "decision"];
  const MONEDAS_VALIDAS = ["UYU", "ARS", "USD"];
  const temaNorm   = TEMAS_VALIDOS.includes(tema as string) ? (tema as string) : "general";
  const monedaNorm = MONEDAS_VALIDAS.includes((moneda as string)?.toUpperCase()) ? (moneda as string).toUpperCase() : "UYU";

  // ── 3. Leer configuración del módulo ─────────────────────
  const { data: configRows } = await supabase
    .from("tarot_configuracion")
    .select("clave, valor, tipo_valor")
    .in("clave", [
      "precio_base_uyu",
      "precio_base_ars",
      "mazo_default",
      "tipo_tirada_default",
      "mp_modo",
    ])
    .eq("activo", true);

  const cfg: Record<string, string> = {};
  for (const row of configRows ?? []) cfg[row.clave] = row.valor;

  const precioSegunMoneda: Record<string, number> = {
    UYU: Number(cfg.precio_base_uyu) || 590,
    ARS: Number(cfg.precio_base_ars) || 4900,
    USD: 15,
  };
  let precio = precioSegunMoneda[monedaNorm];
  const mazoId = cfg.mazo_default;
  const tiradaId = cfg.tipo_tirada_default;
  // sandbox_init_point si estamos en sandbox
  const usarSandbox = (cfg.mp_modo ?? "sandbox").toLowerCase() !== "production";

  if (!mazoId || !tiradaId) {
    await registrarLog(null, null, "config_incompleta", "critical",
      "mazo_default o tipo_tirada_default no configurados", { cfg }, ip);
    return json({ ok: false, error: "CONFIGURACION_INCOMPLETA" }, 500);
  }

  // ── 3b. Validar y aplicar código de descuento (si se envió) ──
  const usoIdNorm = typeof codigo_descuento_uso_id === "string"
    ? codigo_descuento_uso_id.trim().toLowerCase()
    : null;

  if (usoIdNorm) {
    const { data: uso, error: errUso } = await supabase
      .from("tarot_codigos_descuento_usos")
      .select("id, estado_uso, precio_aplicado, fecha_expiracion, moneda")
      .eq("id", usoIdNorm)
      .single();

    if (errUso || !uso) {
      return json({ ok: false, error: "CODIGO_DESCUENTO_NO_ENCONTRADO" }, 400);
    }
    if (uso.estado_uso !== "reservado") {
      return json({ ok: false, error: "CODIGO_DESCUENTO_NO_RESERVADO" }, 409);
    }
    if (new Date(uso.fecha_expiracion).getTime() < Date.now()) {
      return json({ ok: false, error: "CODIGO_DESCUENTO_EXPIRADO" }, 409);
    }
    // Usar el precio descontado
    if (uso.precio_aplicado !== null && uso.precio_aplicado >= 0) {
      precio = Number(uso.precio_aplicado);
    }
  }

  // ── 4. Crear o recuperar cliente ─────────────────────────
  const hash = await hashCliente(nombre_completo as string, telefono, (fecha_nacimiento as string) ?? "");
  const ahora = new Date().toISOString();

  const { data: clienteExistente } = await supabase
    .from("tarot_clientes")
    .select("id")
    .eq("hash_verificacion", hash)
    .is("deleted_at", null)
    .maybeSingle();

  let clienteId: string;

  if (clienteExistente?.id) {
    clienteId = clienteExistente.id;
    await registrarLog(null, clienteId, "cliente_recuperado", "info",
      "Cliente existente recuperado por hash", { hash }, ip);
  } else {
    const { data: nuevoCliente, error: errCliente } = await supabase
      .from("tarot_clientes")
      .insert({
        nombre_completo: (nombre_completo as string).trim(),
        telefono,
        email: email ?? null,
        fecha_nacimiento: fecha_nacimiento ?? null,
        hora_nacimiento: hora_nacimiento ?? null,
        lugar_nacimiento: lugar_nacimiento ?? null,
        ip_registro: ip ?? null,
        user_agent: userAgent ?? null,
        acepto_terminos: true,
        acepto_terminos_at: ahora,
        acepto_privacidad: true,
        acepto_privacidad_at: ahora,
        version_terminos: version_terminos as string,
        hash_verificacion: hash,
      })
      .select("id")
      .single();

    if (errCliente || !nuevoCliente?.id) {
      await registrarLog(null, null, "cliente_crear_error", "error",
        "Error al crear cliente", { error: errCliente?.message }, ip);
      return json({ ok: false, error: "ERROR_CREAR_CLIENTE" }, 500);
    }
    clienteId = nuevoCliente.id;
    await registrarLog(null, clienteId, "cliente_creado", "info",
      "Nuevo cliente registrado", {}, ip);
  }

  // ── 5. Crear orden ───────────────────────────────────────
  const externalReference = `TAROT-${crypto.randomUUID()}`;

  const { data: orden, error: errOrden } = await supabase
    .from("tarot_ordenes")
    .insert({
      cliente_id: clienteId,
      tipo_tirada_id: tiradaId,
      mazo_id: mazoId,
      estado: "formulario_completo",
      external_reference: externalReference,
      pregunta_usuario: pregunta_usuario ?? null,
      tema: temaNorm,
      precio_cobrado: precio,
      moneda: monedaNorm,
      origen_canal: "web",
      utm_source: utm_source ?? null,
      utm_medium: utm_medium ?? null,
      utm_campaign: utm_campaign ?? null,
      ip_orden: ip ?? null,
      user_agent_orden: userAgent ?? null,
      pagina_origen: pagina_origen ?? null,
    })
    .select("id")
    .single();

  if (errOrden || !orden?.id) {
    await registrarLog(null, clienteId, "orden_crear_error", "error",
      "Error al crear orden", { error: errOrden?.message }, ip);
    return json({ ok: false, error: "ERROR_CREAR_ORDEN" }, 500);
  }

  const ordenId: string = orden.id;
  await registrarLog(ordenId, clienteId, "orden_creada", "info",
    "Orden creada", { external_reference: externalReference, precio, moneda: monedaNorm }, ip);

  // ── 5b. Vincular uso de código de descuento a la orden ───
  if (usoIdNorm) {
    await supabase
      .from("tarot_codigos_descuento_usos")
      .update({ orden_id: ordenId })
      .eq("id", usoIdNorm);
  }

  // ── 6. Crear registro de pago skeleton ───────────────────
  await supabase.from("tarot_pagos").insert({
    orden_id: ordenId,
    mp_external_reference: externalReference,
    monto: precio,
    moneda: monedaNorm,
  });

  // ── 7. Validar token MP ──────────────────────────────────
  if (!MP_ACCESS_TOKEN) {
    await registrarLog(ordenId, clienteId, "mp_token_faltante", "critical",
      "MERCADOPAGO_ACCESS_TOKEN no está configurado", {}, ip);
    await supabase.from("tarot_ordenes").update({ estado: "error_critico" }).eq("id", ordenId);
    return json({ ok: false, error: "MP_TOKEN_NO_CONFIGURADO" }, 500);
  }

  // ── 8. Crear preferencia en Mercado Pago ─────────────────
  const webhookUrl = `${SUPABASE_URL}/functions/v1/ef_tarot_webhook_mp`;
  const tarotBackUrl = await getConfigValue(
    "TTC_BACK_URL",
    "https://tuhoroscopo-next-starter.vercel.app/tarot/gracias",
  );
  const backBase = tarotBackUrl.replace(/\/$/, "");

  const mpPayload = {
    items: [
      {
        id: "tarot-lectura-personalizada",
        title: "Tu Tirada de Tarot Personalizada",
        description: "Lectura de tarot con IA. Recibirás tu PDF por WhatsApp al número que registraste.",
        quantity: 1,
        currency_id: monedaNorm,
        unit_price: precio,
      },
    ],
    external_reference: externalReference,
    payer: (email && typeof email === "string") ? { email } : undefined,
    back_urls: {
      success: `${backBase}?ref=${externalReference}&estado=exitoso`,
      pending: `${backBase}?ref=${externalReference}&estado=pendiente`,
      failure: `${backBase}?ref=${externalReference}&estado=fallido`,
    },
    auto_return: "approved",
    notification_url: webhookUrl,
    statement_descriptor: "TU ORACULO",
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mpPayload),
  });

  const mpData = await mpRes.json().catch(() => ({}));

  if (!mpRes.ok || !mpData?.id) {
    await registrarLog(ordenId, clienteId, "mp_preference_error", "error",
      "Error al crear preferencia en MP", { status: mpRes.status, mpData }, ip);
    await supabase.from("tarot_ordenes").update({ estado: "error_critico" }).eq("id", ordenId);
    return json({ ok: false, error: "MP_PREFERENCE_ERROR", detalle: mpData }, 502);
  }

  // En sandbox usamos sandbox_init_point, en producción init_point
  const linkPago: string = usarSandbox
    ? (mpData.sandbox_init_point ?? mpData.init_point)
    : mpData.init_point;
  const preferenceId: string = mpData.id;
  const expiraAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // ── 9. Actualizar pago y orden ───────────────────────────
  await supabase
    .from("tarot_pagos")
    .update({
      mp_preference_id: preferenceId,
      link_pago: linkPago,
      link_expira_at: expiraAt,
      updated_at: ahora,
    })
    .eq("orden_id", ordenId);

  await supabase
    .from("tarot_ordenes")
    .update({ estado: "pago_iniciado", updated_at: ahora })
    .eq("id", ordenId);

  await registrarLog(
    ordenId, clienteId,
    "mp_preference_creada", "info",
    "Link de pago generado correctamente",
    { preference_id: preferenceId, sandbox: usarSandbox, duracion_ms: Date.now() - t0 },
    ip, Date.now() - t0,
  );

  // ── 10. Respuesta al frontend ────────────────────────────
  return json({
    ok: true,
    orden_id: ordenId,
    external_reference: externalReference,
    link_pago: linkPago,
    preference_id: preferenceId,
  });
});
