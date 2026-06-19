import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

type Accion = "toggle" | "reschedule" | "trigger";

function validarCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => /^(\*|[0-9*/,\-]+)$/.test(f));
}

function extraerEfName(command: string): string | null {
  const match = command.match(/functions\/v1\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  if (accion === "toggle") {
    const activo = typeof body.activo === "boolean" ? body.activo : null;
    if (activo === null) {
      return NextResponse.json({ ok: false, motivo: "activo_requerido" }, { status: 400 });
    }
    const { error } = await supabase.rpc("admin_toggle_cron_job", { p_jobid: jobId, p_active: activo });
    if (error) return NextResponse.json({ ok: false, motivo: "db_error", detalle: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, jobid: jobId, activo });
  }

  if (accion === "reschedule") {
    const schedule = typeof body.schedule === "string" ? body.schedule.trim() : "";
    if (!schedule || !validarCron(schedule)) {
      return NextResponse.json(
        { ok: false, motivo: "schedule_invalido", detalle: "Expresión cron inválida — 5 campos: min hora dom mes dow" },
        { status: 400 },
      );
    }
    const { error } = await supabase.rpc("admin_reschedule_cron_job", { p_jobid: jobId, p_schedule: schedule });
    if (error) return NextResponse.json({ ok: false, motivo: "db_error", detalle: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, jobid: jobId, schedule });
  }

  // trigger: fetch job command from DB, extract EF name, call it
  const { data: jobs, error: listError } = await supabase.rpc("admin_listar_cron_jobs");
  if (listError) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: listError.message }, { status: 502 });
  }
  const job = (jobs ?? []).find((j: { jobid: number }) => j.jobid === jobId);
  if (!job) return NextResponse.json({ ok: false, motivo: "job_no_encontrado" }, { status: 404 });

  const efName = extraerEfName(job.command ?? "");
  if (!efName) {
    return NextResponse.json(
      { ok: false, motivo: "ef_no_detectado", detalle: "El comando del job no contiene una URL de Edge Function reconocible" },
      { status: 422 },
    );
  }

  try {
    const efRes = await fetch(`${supabaseUrl}/functions/v1/${efName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-internal-key": internalKey,
      },
      body: JSON.stringify({}),
    });
    const json = await efRes.json().catch(() => ({}));
    return NextResponse.json({ ok: efRes.ok, ef: efName, http_status: efRes.status, respuesta: json });
  } catch (e) {
    return NextResponse.json(
      { ok: false, motivo: "ef_error", detalle: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
