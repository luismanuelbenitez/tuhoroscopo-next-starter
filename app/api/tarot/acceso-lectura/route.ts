import { NextRequest, NextResponse } from "next/server";
import { handoffValido } from "@/lib/handoffGracias";

export const dynamic = "force-dynamic";

// Handoff /tarot/gracias → /lectura (2026-10-20). Devuelve la URL canónica de
// la lectura (/lectura/<token>, el MISMO token que llegó por WhatsApp/email;
// no se genera ninguno nuevo) solo si:
//   1. este navegador tiene el handoff vigente de ESA orden (cookie sellada,
//      ver lib/handoffGracias.ts) — la referencia sola no alcanza;
//   2. ef_tarot_acceso_gracias confirma lectura completada, acceso activo y
//      vigente, y copia cifrada coincidente con el token vigente.
// Cualquier otra cosa → { ok: false } y /gracias queda como estaba.
const REF_RE = /^TAROT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO = () => NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ref?: string };
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!REF_RE.test(ref)) return NO();
  if (!(await handoffValido(ref))) return NO();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const internal = process.env.TAROT_INTERNAL_KEY;
  if (!url || !key || !internal) return NO();

  try {
    const r = await fetch(`${url}/functions/v1/ef_tarot_acceso_gracias`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "x-internal-key": internal },
      body: JSON.stringify({ ref }),
      cache: "no-store",
    });
    const d = await r.json().catch(() => null);
    if (!d?.ok || typeof d.token !== "string" || !/^[A-Za-z0-9_-]{20,}$/.test(d.token)) return NO();
    return NextResponse.json({ ok: true, url: `/lectura/${d.token}` }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NO();
  }
}
