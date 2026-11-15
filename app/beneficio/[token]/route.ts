import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashToken } from "@/lib/feedbackPublico";

export const dynamic = "force-dynamic";

// Link del botón "Usar mi descuento" de las campañas de cupón (2026-11-14).
// Registra el clic (primera visita, una sola vez) y lleva al checkout con el
// código ya puesto. Link vencido o inválido → /tarot, sin explicaciones raras.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const base = new URL(req.url).origin;
  const destinoFallback = NextResponse.redirect(`${base}/tarot`, 302);
  const hash = hashToken(params.token);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!hash || !url || !key) return destinoFallback;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase.rpc("tarot_campana_visita", { p_token_hash: hash });
    const r = (data ?? {}) as { estado?: string; codigo?: string | null; slug?: string };
    if (r.estado !== "ok" || !r.codigo) return destinoFallback;
    const q = new URLSearchParams({
      codigo: r.codigo, utm_source: "whatsapp", utm_medium: "campana", utm_campaign: r.slug ?? "cupon",
    });
    const res = NextResponse.redirect(`${base}/tarot/checkout?${q.toString()}`, 302);
    res.headers.set("X-Robots-Tag", "noindex");
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    return destinoFallback;
  }
}
