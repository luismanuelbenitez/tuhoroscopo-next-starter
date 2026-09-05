// ============================================================================
// ef_tarot_admin_whatsapp — Bandeja de WhatsApp inbound para el Admin (Tarot)
// ============================================================================
//
// Fuente única de datos para /admin/tarot/whatsapp. Lee tarot_whatsapp_
// conversaciones / tarot_whatsapp_mensajes (pobladas por la rama Tarot de
// ef_webhook_whatsapp_inbound — ver ese archivo y
// docs/modules/whatsapp-inbox.md). Esta función NO escribe mensajes, NO
// envía nada — solo lee, marca leído/no leído, y arma el detalle de una
// conversación (incluyendo un resumen de los envíos outbound reales desde
// tarot_envios_whatsapp, sin fabricar historial que no existe).
//
// Acciones (POST body: { accion, ... }):
//   - listar:              filtros + búsqueda + paginación
//   - contador_no_leidos:  total global de no_leidos (badge del nav)
//   - detalle:             conversación + mensajes + envíos outbound reales
//   - marcar_leido:        no_leidos = 0
//   - marcar_no_leido:     no_leidos = max(no_leidos, 1)
//
// SEGURIDAD: x-internal-key. Nunca expone tokens/secrets de Meta — el
// contenido de payload_meta ya fue acotado al persistir (ver inbound).
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().substring(0, max);
  return t ? t : null;
}

// "+598912345678" → "+598 91 *** 678" — enmascarado para la lista cuando no
// hay nombre conocido. Nunca se enmascara en el detalle (ahí el admin ya
// abrió la conversación deliberadamente).
function enmascararTelefono(tel: string): string {
  const soloDigitos = tel.replace(/\D/g, "");
  if (soloDigitos.length < 6) return tel;
  const inicio = tel.slice(0, tel.length - soloDigitos.length + 4); // prefijo + 2 dígitos
  const fin = soloDigitos.slice(-3);
  return `${inicio}***${fin}`;
}

interface ConversacionRow {
  id: string;
  telefono_normalizado: string;
  cliente_id: string | null;
  orden_id: string | null;
  wa_contact_name: string | null;
  estado: string;
  no_leidos: number;
  ultimo_mensaje_at: string | null;
  ultimo_mensaje_preview: string | null;
  ultimo_mensaje_direccion: string | null;
  created_at: string;
  updated_at: string;
}

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (!TAROT_INTERNAL_KEY || internalKey !== TAROT_INTERNAL_KEY) {
    return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, motivo: "json_invalido" }, 400); }

  const accion = texto(body.accion, 50);

  // ── contador_no_leidos ──────────────────────────────────────────────────
  if (accion === "contador_no_leidos") {
    const { count, error } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id", { count: "exact", head: true })
      .gt("no_leidos", 0);
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);
    return jsonResponse({ ok: true, conversaciones_no_leidas: count ?? 0 });
  }

  // ── listar ───────────────────────────────────────────────────────────────
  if (accion === "listar") {
    const filtro = texto(body.filtro, 20) ?? "todos"; // todos | no_leidos | con_orden | sin_orden
    const busqueda = texto(body.busqueda, 100);
    const limitRaw = Number(body.limit ?? LIMIT_DEFAULT);
    const limit = Number.isFinite(limitRaw) ? Math.min(LIMIT_MAX, Math.max(1, limitRaw)) : LIMIT_DEFAULT;
    const offsetRaw = Number(body.offset ?? 0);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    let query = supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado, cliente_id, orden_id, wa_contact_name, estado, no_leidos, ultimo_mensaje_at, ultimo_mensaje_preview, ultimo_mensaje_direccion, created_at, updated_at", { count: "exact" });

    if (filtro === "no_leidos") query = query.gt("no_leidos", 0);
    else if (filtro === "con_orden") query = query.not("orden_id", "is", null);
    else if (filtro === "sin_orden") query = query.is("orden_id", null);

    if (busqueda) {
      // Búsqueda por nombre de cliente u orden (external_reference): se
      // resuelven ids por separado — supabase-js no permite OR entre
      // columnas de tablas distintas en una sola query.
      const [clientesMatch, ordenesMatch] = await Promise.all([
        supabase.from("tarot_clientes").select("id").ilike("nombre_completo", `%${busqueda}%`).limit(50),
        supabase.from("tarot_ordenes").select("id").ilike("external_reference", `%${busqueda}%`).limit(50),
      ]);
      const clienteIds = (clientesMatch.data ?? []).map((c: { id: string }) => c.id);
      const ordenIds = (ordenesMatch.data ?? []).map((o: { id: string }) => o.id);

      const condiciones: string[] = [
        `telefono_normalizado.ilike.%${busqueda}%`,
        `wa_contact_name.ilike.%${busqueda}%`,
      ];
      if (clienteIds.length) condiciones.push(`cliente_id.in.(${clienteIds.join(",")})`);
      if (ordenIds.length) condiciones.push(`orden_id.in.(${ordenIds.join(",")})`);
      query = query.or(condiciones.join(","));
    }

    query = query.order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return jsonResponse({ ok: false, motivo: "error_query", detalle: error.message }, 500);

    const filas = (data ?? []) as ConversacionRow[];

    // Enriquecer con nombre de cliente canónico (si hay) y ref de orden —
    // dos queries batch, no N+1.
    const clienteIds = [...new Set(filas.map((f) => f.cliente_id).filter(Boolean))] as string[];
    const ordenIds = [...new Set(filas.map((f) => f.orden_id).filter(Boolean))] as string[];
    const [clientesRes, ordenesRes] = await Promise.all([
      clienteIds.length ? supabase.from("tarot_clientes").select("id, nombre_completo").in("id", clienteIds) : Promise.resolve({ data: [] }),
      ordenIds.length ? supabase.from("tarot_ordenes").select("id, external_reference, estado").in("id", ordenIds) : Promise.resolve({ data: [] }),
    ]);
    const nombrePorCliente = new Map((clientesRes.data ?? []).map((c: { id: string; nombre_completo: string }) => [c.id, c.nombre_completo]));
    const ordenPorId = new Map((ordenesRes.data ?? []).map((o: { id: string; external_reference: string | null; estado: string }) => [o.id, o]));

    // Total global de no leídos (para el badge) — independiente de filtros/paginación de esta llamada.
    const { count: noLeidosTotal } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id", { count: "exact", head: true })
      .gt("no_leidos", 0);

    const conversaciones = filas.map((f) => {
      const nombreCliente = f.cliente_id ? nombrePorCliente.get(f.cliente_id) ?? null : null;
      const nombreMostrado = nombreCliente ?? f.wa_contact_name ?? null;
      const orden = f.orden_id ? ordenPorId.get(f.orden_id) ?? null : null;
      return {
        id: f.id,
        telefono: nombreMostrado ? f.telefono_normalizado : enmascararTelefono(f.telefono_normalizado),
        nombre: nombreMostrado,
        cliente_id: f.cliente_id,
        orden_id: f.orden_id,
        orden_ref: orden?.external_reference ?? null,
        orden_estado: orden?.estado ?? null,
        ultimo_mensaje_at: f.ultimo_mensaje_at,
        ultimo_mensaje_preview: f.ultimo_mensaje_preview,
        ultimo_mensaje_direccion: f.ultimo_mensaje_direccion,
        no_leidos: f.no_leidos,
      };
    });

    return jsonResponse({
      ok: true,
      conversaciones,
      paginacion: {
        total: count ?? 0,
        limit, offset,
        next_offset: (count ?? 0) > offset + limit ? offset + limit : null,
      },
      no_leidos_total: noLeidosTotal ?? 0,
    });
  }

  // ── detalle ──────────────────────────────────────────────────────────────
  if (accion === "detalle") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const { data: conv, error: convErr } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .select("id, telefono_normalizado, cliente_id, orden_id, wa_contact_name, estado, no_leidos, ultimo_mensaje_at, created_at")
      .eq("id", conversacionId)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, motivo: "error_query", detalle: convErr.message }, 500);
    if (!conv) return jsonResponse({ ok: false, motivo: "conversacion_no_encontrada" }, 404);

    const [mensajesRes, clienteRes, ordenRes] = await Promise.all([
      supabase
        .from("tarot_whatsapp_mensajes")
        .select("id, whatsapp_message_id, direccion, tipo, texto, media_id, mime_type, filename, payload_meta, timestamp_whatsapp, estado, created_at")
        .eq("conversacion_id", conversacionId)
        .order("timestamp_whatsapp", { ascending: true }),
      conv.cliente_id
        ? supabase.from("tarot_clientes").select("id, nombre_completo, telefono, email").eq("id", conv.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
      conv.orden_id
        ? supabase.from("tarot_ordenes").select("id, external_reference, estado, tema, created_at").eq("id", conv.orden_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Envíos outbound reales de la orden asociada (si hay) — se muestran como
    // eventos de sistema en el historial, NUNCA se escriben en
    // tarot_whatsapp_mensajes (no se fabrica historial, ver docs/modules/whatsapp-inbox.md).
    const enviosOutbound = conv.orden_id
      ? await supabase
          .from("tarot_envios_whatsapp")
          .select("id, estado, numero_intento, wa_message_id, enviado_at, entregado_at, leido_at, created_at")
          .eq("orden_id", conv.orden_id)
          .order("created_at", { ascending: true })
      : { data: [] };

    return jsonResponse({
      ok: true,
      conversacion: {
        id: conv.id,
        telefono: conv.telefono_normalizado,
        cliente_id: conv.cliente_id,
        orden_id: conv.orden_id,
        wa_contact_name: conv.wa_contact_name,
        no_leidos: conv.no_leidos,
      },
      cliente: clienteRes.data ?? null,
      orden: ordenRes.data ?? null,
      mensajes: mensajesRes.data ?? [],
      envios_whatsapp_orden: enviosOutbound.data ?? [],
    });
  }

  // ── marcar_leido / marcar_no_leido ──────────────────────────────────────
  if (accion === "marcar_leido" || accion === "marcar_no_leido") {
    const conversacionId = texto(body.conversacion_id, 100);
    if (!conversacionId) return jsonResponse({ ok: false, motivo: "conversacion_id_requerido" }, 400);

    const nuevoValor = accion === "marcar_leido" ? 0 : 1;
    const { error } = await supabase
      .from("tarot_whatsapp_conversaciones")
      .update({ no_leidos: nuevoValor, updated_at: new Date().toISOString() })
      .eq("id", conversacionId);
    if (error) return jsonResponse({ ok: false, motivo: "error_update", detalle: error.message }, 500);

    return jsonResponse({ ok: true, no_leidos: nuevoValor });
  }

  return jsonResponse({ ok: false, motivo: "accion_invalida" }, 400);
});
