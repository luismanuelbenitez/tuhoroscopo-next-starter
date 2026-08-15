// ============================================================================
// 📬 EDGE FUNCTION: ef_tarot_admin_listar_entregas
// ============================================================================
//
// MÓDULO:
//   Tarot TTC — Administración / Gobernanza de entregas
//
// OBJETIVO:
//   Listar entregas (envíos WhatsApp + Email) en una sola vista unificada,
//   con datos de orden y cliente vía JOIN. Es la fuente de la pantalla
//   /admin/tarot/entregas y del widget "Entregas recientes" del dashboard.
//
// QUÉ NO HACE:
//   - NO envía nada.
//   - NO modifica estados.
//   - NO crea ni autoriza solicitudes de reenvío (ver ef_tarot_solicitar_reenvio
//     / ef_tarot_autorizar_reenvio / ef_tarot_admin_listar_solicitudes_reenvio).
//
// TIPO:
//   Read-only / listado administrativo. Combina dos tablas en memoria
//   (no hay UNION nativo vía supabase-js) — a la escala actual del
//   producto (decenas/cientos de envíos) es correcto y suficiente;
//   si el volumen crece varios órdenes de magnitud, migrar a una vista SQL.
//
// SEGURIDAD:
//   - Requiere x-internal-key.
//
// INPUT (POST body, todos opcionales):
//   {
//     "orden_id": "uuid",
//     "canal": "whatsapp" | "email",
//     "estado": "enviado",
//     "solo_reenvios": false,
//     "fecha_desde": "2026-05-01",
//     "fecha_hasta": "2026-06-01",
//     "limit": 50,
//     "offset": 0
//   }
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FUNCION = "ef_tarot_admin_listar_entregas";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
function normalizarTexto(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  return v ? v : null;
}
function normalizarBoolean(input: unknown, defaultValue = false): boolean {
  if (typeof input === "boolean") return input;
  return defaultValue;
}
function normalizarUUID(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}
function normalizarLimit(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 50;
  if (n < 1) return 50;
  if (n > 200) return 200;
  return n;
}
function normalizarOffset(input: unknown): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(n)) return 0;
  if (n < 0) return 0;
  return n;
}
function normalizarFecha(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
  }
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
async function readBodySafe(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch { return {}; }
}

interface EntregaFila {
  id: string;
  canal: "whatsapp" | "email";
  orden_id: string;
  orden_ref: string | null;
  cliente_nombre: string | null;
  destino: string;
  estado: string;
  numero_intento: number;
  es_reenvio: boolean;
  solicitud_reenvio_id: string | null;
  pdf_id: string | null;
  proveedor: string | null;
  proveedor_message_id: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  respuesta_raw: unknown;
  enviado_at: string | null;
  created_at: string;
}

// deno-lint-ignore no-explicit-any
function mapWa(r: any): EntregaFila {
  return {
    id: r.id, canal: "whatsapp", orden_id: r.orden_id,
    orden_ref: r.tarot_ordenes?.external_reference ?? null,
    cliente_nombre: r.tarot_ordenes?.tarot_clientes?.nombre_completo ?? null,
    destino: r.telefono_destino, estado: r.estado, numero_intento: r.numero_intento,
    es_reenvio: r.es_reenvio ?? false, solicitud_reenvio_id: r.solicitud_reenvio_id ?? null,
    pdf_id: r.pdf_id ?? null, proveedor: r.proveedor_wa ?? null,
    proveedor_message_id: r.wa_message_id ?? null,
    error_codigo: r.wa_error_code ?? null, error_mensaje: r.wa_error_mensaje ?? null,
    respuesta_raw: r.respuesta_raw ?? null, enviado_at: r.enviado_at ?? null, created_at: r.created_at,
  };
}
// deno-lint-ignore no-explicit-any
function mapEmail(r: any): EntregaFila {
  return {
    id: r.id, canal: "email", orden_id: r.orden_id,
    orden_ref: r.tarot_ordenes?.external_reference ?? null,
    cliente_nombre: r.tarot_ordenes?.tarot_clientes?.nombre_completo ?? null,
    destino: r.email_destino, estado: r.estado, numero_intento: r.numero_intento,
    es_reenvio: r.es_reenvio ?? false, solicitud_reenvio_id: r.solicitud_reenvio_id ?? null,
    pdf_id: r.pdf_id ?? null, proveedor: r.proveedor_email ?? null,
    proveedor_message_id: r.proveedor_message_id ?? null,
    error_codigo: r.error_codigo ?? null, error_mensaje: r.error_mensaje ?? null,
    respuesta_raw: r.respuesta_raw ?? null, enviado_at: r.enviado_at ?? null, created_at: r.created_at,
  };
}

serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== TAROT_INTERNAL_KEY) return jsonResponse({ ok: false, motivo: "unauthorized" }, 401);
  if (req.method !== "POST") return jsonResponse({ ok: false, motivo: "metodo_no_permitido" }, 405);

  const body = await readBodySafe(req);
  const orden_id = normalizarUUID(body.orden_id);
  const canalFiltro = normalizarTexto(body.canal);
  const estado = normalizarTexto(body.estado);
  const solo_reenvios = normalizarBoolean(body.solo_reenvios, false);
  const fecha_desde = normalizarFecha(body.fecha_desde);
  const fecha_hasta = normalizarFecha(body.fecha_hasta);
  const limit = normalizarLimit(body.limit);
  const offset = normalizarOffset(body.offset);

  const SELECT_JOIN = `*, tarot_ordenes ( external_reference, tarot_clientes ( nombre_completo ) )`;
  const fetchCap = offset + limit; // suficiente para cubrir la página pedida tras el merge

  async function fetchTabla(tabla: "tarot_envios_whatsapp" | "tarot_envios_email") {
    let q = supabase.from(tabla).select(SELECT_JOIN, { count: "exact" });
    if (orden_id) q = q.eq("orden_id", orden_id);
    if (estado) q = q.eq("estado", estado);
    if (solo_reenvios) q = q.eq("es_reenvio", true);
    if (fecha_desde) q = q.gte("created_at", fecha_desde);
    if (fecha_hasta) q = q.lt("created_at", fecha_hasta);
    q = q.order("created_at", { ascending: false }).limit(fetchCap);
    return q;
  }

  const incluirWa    = !canalFiltro || canalFiltro === "whatsapp";
  const incluirEmail = !canalFiltro || canalFiltro === "email";

  const [waRes, emailRes] = await Promise.all([
    incluirWa    ? fetchTabla("tarot_envios_whatsapp") : Promise.resolve({ data: [], error: null, count: 0 }),
    incluirEmail ? fetchTabla("tarot_envios_email")    : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);

  if (waRes.error || emailRes.error) {
    return jsonResponse({
      ok: false, motivo: "listar_entregas_error",
      error: waRes.error?.message ?? emailRes.error?.message,
    }, 500);
  }

  const filas: EntregaFila[] = [
    ...(waRes.data ?? []).map(mapWa),
    ...(emailRes.data ?? []).map(mapEmail),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalAprox = (waRes.count ?? 0) + (emailRes.count ?? 0);
  const pagina = filas.slice(offset, offset + limit);

  return jsonResponse({
    ok: true,
    funcion: FUNCION,
    filtros: { orden_id, canal: canalFiltro, estado, solo_reenvios, fecha_desde, fecha_hasta, limit, offset },
    paginacion: {
      total: totalAprox,
      limit, offset,
      next_offset: totalAprox > offset + limit ? offset + limit : null,
    },
    entregas: pagina,
  });
});
