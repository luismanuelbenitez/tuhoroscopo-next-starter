import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

type Accion = "toggle" | "reschedule" | "trigger";

function validarCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => /^(\*|[0-9*/,\-]+)$/.test(f));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const internalKey = process.env.TAROT_INTERNAL_KEY;

  if (!supabaseUrl || !serviceRoleKey || !internalKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const jobId = parseInt(params.id, 10);
  if (isNaN(jobId)) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const accion = body.accion as Accion | undefined;
  if (!accion || !["toggle", "reschedule", "trigger"].includes(accion)) {
    return NextResponse.json(
      { ok: false, motivo: "accion_invalida", detalle: 'accion debe ser "toggle", "reschedule" o "trigger"' },
      { status: 400 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // ── toggle ──────────────────────────────────────────────────────────────────
  if (accion === "toggle") {
    const activo = typeof body.activo === "boolean" ? body.activo : null;
    if (activo === null) {
      return NextResponse.json({ ok: false, motivo: "activo_requerido" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("admin_update_cron_job", {
      p_job_id: jobId,
      p_active: activo,
    });

    if (error) {
      return NextResponse.json({ ok: false, motivo: "db_error", detalle: error.message }, { status: 502 });
    }

    const result = data as { success: boolean; message: string; active?: boolean };
    if (!result?.success) {
      return NextResponse.json({ ok: false, motivo: "rpc_error", detalle: result?.message }, { status: 422 });
    }

    return NextResponse.json({ ok: true, jobid: jobId, activo: result.active ?? activo });
  }

  // ── reschedule ───────────────────────────────────────────────────────────────
  if (accion === "reschedule") {
    const schedule = typeof body.schedule === "string" ? body.schedule.trim() : "";
    if (!schedule || !validarCron(schedule)) {
      return NextResponse.json(
        { ok: false, motivo: "schedule_invalido", detalle: "Expresión cron inválida — 5 campos: min hora dom mes dow" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("admin_update_cron_job", {
      p_job_id: jobId,
      p_schedule: schedule,
    });

    if (error) {
      return NextResponse.json({ ok: false, motivo: "db_error", detalle: error.message }, { status: 502 });
    }

    const result = data as { success: boolean; message: string; schedule?: string };
    if (!result?.success) {
      return NextResponse.json({ ok: false, motivo: "rpc_error", detalle: result?.message }, { status: 422 });
    }

    return NextResponse.json({ ok: true, jobid: jobId, schedule: result.schedule ?? schedule });
  }

  // ── trigger ──────────────────────────────────────────────────────────────────
  // Obtiene el ef_name desde la DB (ya sanitizado, sin exponer el command crudo).
  const { data: jobs, error: listError } = await supabase.rpc("admin_listar_cron_jobs");
  if (listError) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: listError.message }, { status: 502 });
  }

  const job = (jobs ?? []).find((j: { jobid: number }) => j.jobid === jobId) as
    | { jobid: number; ef_name: string | null }
    | undefined;

  if (!job) return NextResponse.json({ ok: false, motivo: "job_no_encontrado" }, { status: 404 });

  const efName = job.ef_name;
  if (!efName) {
    return NextResponse.json(
      { ok: false, motivo: "ef_no_detectado", detalle: "El job no tiene una Edge Function invocable (puede ser una función SQL interna)" },
      { status: 422 },
    );
  }

  try {
    const efRes = await fetch(`${supabaseUrl}/functions/v1/${efName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Estos headers NUNCA llegan al cliente — solo se usan en esta llamada server-side.
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({}),
    });

    // No reenviar la respuesta cruda de la EF al cliente: puede contener datos internos.
    return NextResponse.json({ ok: efRes.ok, ef: efName, http_status: efRes.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, motivo: "ef_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
