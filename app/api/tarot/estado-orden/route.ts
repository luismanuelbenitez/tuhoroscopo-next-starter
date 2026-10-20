import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Estado de una orden para la página /tarot/gracias (2026-10-19): muestra el
// avance real (confirmada → interpretando → enviada) mientras la persona
// espera. Recibe la external_reference (TAROT-<uuid>, no enumerable, la misma
// que ya viaja en la URL de regreso de Mercado Pago) y devuelve SOLO el
// estado: ningún dato personal, ni el link de la lectura.
const REF_RE = /^TAROT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!REF_RE.test(ref)) return NextResponse.json({ ok: false }, { status: 400 });

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ ok: false }, { status: 500 });

  try {
    const res = await fetch(
      `${url}/rest/v1/tarot_ordenes?external_reference=eq.${encodeURIComponent(ref)}&select=estado,tipo_orden,email_solicitado&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    const rows = await res.json().catch(() => []);
    const o = Array.isArray(rows) ? rows[0] : null;
    if (!o) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json(
      { ok: true, estado: o.estado, es_cortesia: o.tipo_orden === "cortesia", email: o.email_solicitado === true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
