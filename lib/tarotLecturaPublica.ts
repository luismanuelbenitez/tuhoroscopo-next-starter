// Cliente server-only para ef_tarot_lectura_publica. Nunca importar desde
// un Client Component — usa SUPABASE_SECRET_KEY y TAROT_INTERNAL_KEY.

export interface CartaPublica {
  posicion: number;
  nombre_carta: string;
  orientacion: string;
  interpretacion: string;
  imagen_url: string | null;
}

export interface LecturaPublica {
  ok: true;
  nombre: string;
  pregunta: string | null;
  cartas: CartaPublica[];
  resumen_lectura: string;
  mensaje_final: string;
  proximos_pasos: string[];
  expira_at: string;
}

export type ResolverResultado =
  | LecturaPublica
  | { ok: false; motivo: "no_encontrado" | "expirado" | "orden_no_encontrada" | "lectura_no_disponible" };

function getEnv(): { supabaseUrl: string; internalKey: string; serviceRoleKey: string } | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalKey = process.env.TAROT_INTERNAL_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !internalKey || !serviceRoleKey) return null;
  return { supabaseUrl, internalKey, serviceRoleKey };
}

async function callEF(body: Record<string, unknown>): Promise<Response | null> {
  const env = getEnv();
  if (!env) return null;
  try {
    return await fetch(`${env.supabaseUrl}/functions/v1/ef_tarot_lectura_publica`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.serviceRoleKey}`,
        "x-internal-key": env.internalKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function resolverLecturaPublica(token: string): Promise<ResolverResultado> {
  const res = await callEF({ token, accion: "ver" });
  if (!res) return { ok: false, motivo: "no_encontrado" };
  const data = await res.json().catch(() => ({ ok: false, motivo: "no_encontrado" }));
  return data as ResolverResultado;
}

export async function resolverUrlPdfPublica(
  token: string,
): Promise<{ ok: true; url: string } | { ok: false; motivo: string }> {
  const res = await callEF({ token, accion: "pdf" });
  if (!res) return { ok: false, motivo: "config_error" };
  const data = await res.json().catch(() => ({ ok: false, motivo: "error" }));
  return data as { ok: true; url: string } | { ok: false; motivo: string };
}
