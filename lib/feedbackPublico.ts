import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { identidadPublica, nombreDePila } from "@/lib/identidadPublica";

// Mini web pública de feedback (/opinion/<token>) — server-only: nunca
// importar desde un Client Component (usa SUPABASE_SECRET_KEY).
//
// El token es aleatorio (32 bytes base64url, generado por
// ef_tarot_campanas_runner) y viaja solo en el WhatsApp; en la base vive su
// hash SHA-256 (tarot_campana_envios.token_hash), mismo esquema que
// /lectura. No contiene ni permite derivar PII. La identidad pública se
// calcula SIEMPRE acá, en el servidor, desde el nombre de la orden: el
// navegador nunca recibe el nombre completo ni decide la identidad.

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

export type EstadoFeedback = "ok" | "respondido" | "expirado" | "invalido" | "error";

export interface ConsentimientoTexto {
  version: string;
  texto: string;
}

export interface FeedbackContexto {
  estado: EstadoFeedback;
  nombrePila?: string;
  identidadPublica?: string;
  consentimientos?: { sitio: ConsentimientoTexto; difusion: ConsentimientoTexto };
}

function db() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export function hashToken(token: string): string | null {
  if (!TOKEN_RE.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

async function textosVigentes(supabase: NonNullable<ReturnType<typeof db>>) {
  const { data } = await supabase
    .from("tarot_consentimientos_textos")
    .select("version, tipo, texto, vigente_desde")
    .eq("vigente", true)
    .order("vigente_desde", { ascending: false });
  const sitio = data?.find((t) => t.tipo === "sitio");
  const difusion = data?.find((t) => t.tipo === "difusion");
  if (!sitio || !difusion) return null;
  return {
    sitio: { version: sitio.version as string, texto: sitio.texto as string },
    difusion: { version: difusion.version as string, texto: difusion.texto as string },
  };
}

async function nombreDeLaOrden(supabase: NonNullable<ReturnType<typeof db>>, ordenId: string): Promise<string | null> {
  const { data } = await supabase.from("tarot_ordenes").select("nombre_snapshot").eq("id", ordenId).maybeSingle();
  return (data?.nombre_snapshot as string | null) ?? null;
}

/** Resuelve el token para mostrar la página. Cuenta la visita (la primera queda fija). */
export async function resolverFeedback(token: string): Promise<FeedbackContexto> {
  const hash = hashToken(token);
  if (!hash) return { estado: "invalido" };
  const supabase = db();
  if (!supabase) return { estado: "error" };
  try {
    const { data, error } = await supabase.rpc("tarot_feedback_visita", { p_token_hash: hash });
    if (error) return { estado: "error" };
    const r = data as { estado: EstadoFeedback; orden_id?: string };
    if (r.estado !== "ok" && r.estado !== "respondido") return { estado: r.estado };
    const nombre = r.orden_id ? await nombreDeLaOrden(supabase, r.orden_id) : null;
    const consentimientos = await textosVigentes(supabase);
    if (!consentimientos) return { estado: "error" };
    return {
      estado: r.estado,
      nombrePila: nombreDePila(nombre),
      identidadPublica: identidadPublica(nombre),
      consentimientos,
    };
  } catch {
    return { estado: "error" };
  }
}

export interface RespuestaFeedbackInput {
  rating: number;
  comentario: string;
  autorizaSitio: boolean;
  autorizaDifusion: boolean;
  versionSitio: string;
  versionDifusion: string;
  userAgent: string | null;
}

export type ResultadoRegistro = "registrada" | "ya_respondida" | "expirado" | "invalido" | "rating_invalido" | "version_desactualizada" | "error";

/** Guarda la respuesta (idempotente: una por envío, la segunda devuelve "ya_respondida"). */
export async function registrarFeedback(token: string, input: RespuestaFeedbackInput): Promise<ResultadoRegistro> {
  const hash = hashToken(token);
  if (!hash) return "invalido";
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return "rating_invalido";
  const supabase = db();
  if (!supabase) return "error";
  try {
    // Identidad y versiones de consentimiento se resuelven en el servidor.
    const { data: envio } = await supabase.from("tarot_campana_envios").select("orden_id").eq("token_hash", hash).maybeSingle();
    if (!envio) return "invalido";
    const nombre = await nombreDeLaOrden(supabase, envio.orden_id as string);
    const vigentes = await textosVigentes(supabase);
    if (!vigentes) return "error";
    // Solo se aceptan las versiones vigentes (las que la página mostró).
    if (input.versionSitio !== vigentes.sitio.version || input.versionDifusion !== vigentes.difusion.version) return "version_desactualizada";

    const { data, error } = await supabase.rpc("tarot_feedback_registrar", {
      p_token_hash: hash,
      p_rating: input.rating,
      p_comentario: input.comentario.slice(0, 600),
      p_sitio: input.autorizaSitio === true,
      p_difusion: input.autorizaDifusion === true,
      p_identidad: identidadPublica(nombre),
      // Versión del texto PRESENTADO (se guarda aunque no se haya marcado).
      p_version_sitio: vigentes.sitio.version,
      p_version_difusion: vigentes.difusion.version,
      p_user_agent: input.userAgent,
    });
    if (error) return "error";
    return ((data as { estado: ResultadoRegistro }).estado) ?? "error";
  } catch {
    return "error";
  }
}
