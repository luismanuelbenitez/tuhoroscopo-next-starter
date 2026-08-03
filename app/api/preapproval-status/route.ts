export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id_suscriptor");
  if (!id) return Response.json({ ok: false, error: "missing id_suscriptor" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY! // server-only
  );

  // Log del poll
  try {
    await supabase.from("log_funciones").insert({
      nombre_funcion: "api_preapproval_status",
      resultado: "PREAPPROVAL_POLL_HIT",
      detalle: { id },
      exito: true,
      creado_por: "next"
    });
  } catch {}

  const { data: s, error } = await supabase
    .from("suscriptores")
    .select("preapproval_id, preapproval_status, preapproval_init_point")
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  if (!s?.preapproval_id) {
    return Response.json({ ok: true, exists: false }, { headers: { "Cache-Control": "no-store" } });
  }

  let initPoint = s.preapproval_init_point;
  let status = s.preapproval_status ?? null;
  let source: "db" | "refresh" = "db";

  if (!initPoint) {
    const r = await fetch(`https://api.mercadopago.com/preapproval/${s.preapproval_id}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
    });
    const mp = await r.json().catch(() => ({} as any));
    if (r.ok) {
      initPoint = mp?.init_point ?? mp?.sandbox_init_point ?? mp?.redirect_url ?? null;
      status = mp?.status ?? status;
      source = "refresh";
      try {
        await supabase.from("suscriptores")
          .update({ preapproval_init_point: initPoint, preapproval_status: status })
          .eq("id", id);
        await supabase.from("pagos")
          .update({ link_pago: initPoint, status })
          .eq("preference_id", s.preapproval_id);
        await supabase.from("log_funciones").insert({
          nombre_funcion: "api_preapproval_status",
          resultado: "PREAPPROVAL_REFRESHED_FROM_MP",
          detalle: { id, preapproval_id: s.preapproval_id },
          exito: true,
          creado_por: "next"
        });
      } catch {}
    }
  }

  return Response.json(
    { ok: true, exists: true, preapproval_id: s.preapproval_id, status, init_point: initPoint, source },
    { headers: { "Cache-Control": "no-store" } }
  );
}
