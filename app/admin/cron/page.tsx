"use client";
import { useState, useEffect } from "react";
import {
  AlertCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Play,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";

// ===========================================================================
// Types
// ===========================================================================

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  // ef_name: nombre sanitizado de la Edge Function detectada en el comando.
  // Nunca se recibe ni muestra el campo command completo (puede contener secretos).
  ef_name: string | null;
  active: boolean;
  ultimo_inicio: string | null;
  ultimo_fin: string | null;
  ultimo_estado: string | null;
}

// ===========================================================================
// Helpers
// ===========================================================================

const DOW_LABELS: Record<string, string> = {
  "0": "Domingos", "1": "Lunes", "2": "Martes", "3": "Miércoles",
  "4": "Jueves", "5": "Viernes", "6": "Sábados",
  "0,6": "Fines de semana", "1-5": "Lun–Vie", "1-6": "Lun–Sáb",
};

function fmtCronDesc(expr: string): string {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return expr;
  const [min, hour, dom, month, dow] = f;
  if (expr === "* * * * *") return "Cada minuto";
  if (min.startsWith("*/") && hour === "*" && dom === "*" && month === "*" && dow === "*")
    return `Cada ${min.slice(2)} minutos`;
  if (min === "0" && hour.startsWith("*/") && dom === "*" && month === "*" && dow === "*")
    return `Cada ${hour.slice(2)} horas`;
  if (!min.includes("*") && hour === "*" && dom === "*" && month === "*" && dow === "*")
    return `Cada hora en :${min.padStart(2, "0")} UTC`;
  if (!min.includes("*") && !hour.includes("*") && dom === "*" && month === "*" && dow === "*")
    return `Diariamente a las ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  if (!min.includes("*") && !hour.includes("*") && dom === "*" && month === "*" && dow !== "*") {
    const dowLabel = DOW_LABELS[dow] ?? `día ${dow}`;
    return `${dowLabel} a las ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  }
  return expr;
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      timeZone: "America/Montevideo",
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch { return iso; }
}

function computeNextRun(expr: string): string | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, , dow] = f;
  if (min.includes("*") || hour.includes("*") || dom.includes("*") === false && dom !== "*") return null;
  const targetMin = parseInt(min, 10);
  const targetHour = parseInt(hour, 10);
  if (isNaN(targetMin) || isNaN(targetHour)) return null;
  const now = new Date();
  const nowH = now.getUTCHours();
  const nowM = now.getUTCMinutes();
  const timeLabel = `${String(targetHour).padStart(2, "0")}:${String(targetMin).padStart(2, "0")} UTC`;
  if (dow === "*") {
    const isToday = nowH < targetHour || (nowH === targetHour && nowM < targetMin);
    return isToday ? `hoy ~${timeLabel}` : `mañana ~${timeLabel}`;
  }
  const targetDow = parseInt(dow, 10);
  if (isNaN(targetDow)) return null;
  const todayDow = now.getUTCDay();
  const diff = (targetDow - todayDow + 7) % 7;
  const isToday = diff === 0 && (nowH < targetHour || (nowH === targetHour && nowM < targetMin));
  if (isToday) return `hoy ~${timeLabel}`;
  const inDays = diff === 0 ? 7 : diff;
  if (inDays === 1) return `mañana ~${timeLabel}`;
  return `en ${inDays}d ~${timeLabel}`;
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "hace <1 min";
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  } catch { return ""; }
}

// ===========================================================================
// Job row component
// ===========================================================================

function CronJobRow({ job, onRefresh }: { job: CronJob; onRefresh: () => void }) {
  const [editandoSchedule, setEditandoSchedule] = useState(false);
  const [nuevoSchedule, setNuevoSchedule] = useState(job.schedule);
  const [mostrandoInfo, setMostrandoInfo] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [feedbackToggle, setFeedbackToggle] = useState<string | null>(null);
  const [feedbackSchedule, setFeedbackSchedule] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [feedbackTrigger, setFeedbackTrigger] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const PRESETS = [
    { label: "Cada min", value: "* * * * *" },
    { label: "Cada hora :00", value: "0 * * * *" },
    { label: "Cada hora :30", value: "30 * * * *" },
    { label: "Cada 2h", value: "0 */2 * * *" },
    { label: "Diario 6am", value: "0 6 * * *" },
    { label: "Diario 9am", value: "0 9 * * *" },
  ];

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    setFeedbackToggle(null);
    try {
      const res = await fetch(`/api/admin/cron/${job.jobid}/accion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "toggle", activo: !job.active }),
      });
      const json = await res.json();
      if (json.ok) {
        onRefresh();
      } else {
        setFeedbackToggle(json.detalle ?? json.motivo ?? "Error al cambiar el estado");
      }
    } catch {
      setFeedbackToggle("Error de red");
    } finally {
      setToggling(false);
    }
  }

  async function handleReschedule() {
    if (guardando) return;
    setGuardando(true);
    setFeedbackSchedule(null);
    try {
      const res = await fetch(`/api/admin/cron/${job.jobid}/accion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reschedule", schedule: nuevoSchedule }),
      });
      const json = await res.json();
      if (json.ok) {
        setFeedbackSchedule({ tipo: "ok", texto: `Schedule actualizado: ${json.schedule}` });
        setEditandoSchedule(false);
        onRefresh();
      } else {
        setFeedbackSchedule({ tipo: "error", texto: json.detalle ?? json.motivo ?? "Error al guardar" });
      }
    } catch {
      setFeedbackSchedule({ tipo: "error", texto: "Error de red" });
    } finally {
      setGuardando(false);
    }
  }

  async function handleTrigger() {
    if (triggering) return;
    setTriggering(true);
    setFeedbackTrigger(null);
    try {
      const res = await fetch(`/api/admin/cron/${job.jobid}/accion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "trigger" }),
      });
      const json = await res.json();
      if (json.ok) {
        setFeedbackTrigger({ tipo: "ok", texto: `${json.ef} ejecutado (HTTP ${json.http_status})` });
      } else {
        setFeedbackTrigger({ tipo: "error", texto: json.detalle ?? json.motivo ?? "Error al ejecutar" });
      }
    } catch {
      setFeedbackTrigger({ tipo: "error", texto: "Error de red" });
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className={`rounded-xl border px-5 py-4 ${job.active ? "border-gray-700/60 bg-gray-900/50" : "border-gray-800/40 bg-gray-900/20"}`}>
      {/* Header row */}
      <div className="flex items-start gap-4">
        {/* Job info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">#{job.jobid}</span>
            <span className={`text-sm font-semibold ${job.active ? "text-gray-100" : "text-gray-500"}`}>
              {job.jobname}
            </span>
            {!job.active && (
              <span className="text-xs px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-500">
                inactivo
              </span>
            )}
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono text-xs text-violet-400">{job.schedule}</span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">{fmtCronDesc(job.schedule)}</span>
            {job.active && computeNextRun(job.schedule) && (
              <>
                <span className="text-xs text-gray-700">·</span>
                <span className="text-xs text-sky-600/80">próx. {computeNextRun(job.schedule)}</span>
              </>
            )}
          </div>

          {/* EF name — sanitizado, nunca el comando completo */}
          {job.ef_name && (
            <p className="text-xs text-gray-600 mt-1 font-mono">{job.ef_name}</p>
          )}
        </div>

        {/* Right: last run + controls */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {/* Last run */}
          <div className="text-right">
            {job.ultimo_inicio ? (
              <>
                <p className="text-xs text-gray-400">{fmtDatetime(job.ultimo_inicio)}</p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  {job.ultimo_estado === "succeeded" ? (
                    <><Check size={11} className="text-green-400" /><span className="text-xs text-green-400">OK</span></>
                  ) : job.ultimo_estado === "failed" ? (
                    <><X size={11} className="text-red-400" /><span className="text-xs text-red-400">failed</span></>
                  ) : (
                    <span className="text-xs text-gray-600">{job.ultimo_estado ?? "—"}</span>
                  )}
                  <span className="text-xs text-gray-700">{fmtRelative(job.ultimo_inicio)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-700 italic">sin ejecuciones</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Toggle */}
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={job.active ? "Desactivar" : "Activar"}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${
                job.active
                  ? "border-green-800/50 bg-green-950/20 text-green-400 hover:bg-green-950/40"
                  : "border-gray-700/50 bg-gray-800/60 text-gray-500 hover:text-gray-300"
              }`}
            >
              {toggling
                ? <span className="animate-pulse">…</span>
                : job.active
                  ? <><ToggleRight size={13} /> Activo</>
                  : <><ToggleLeft size={13} /> Inactivo</>}
            </button>

            {/* Edit schedule */}
            <button
              onClick={() => { setNuevoSchedule(job.schedule); setEditandoSchedule(true); setFeedbackSchedule(null); }}
              disabled={editandoSchedule || guardando}
              title="Editar schedule"
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-700/50 bg-gray-800/60 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-40"
            >
              <Pencil size={11} /> Schedule
            </button>

            {/* Trigger — solo si hay EF detectada */}
            {job.ef_name && (
              <button
                onClick={handleTrigger}
                disabled={triggering}
                title={`Ejecutar ${job.ef_name} ahora`}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-800/50 bg-amber-950/20 text-xs text-amber-400 hover:bg-amber-950/40 transition-colors disabled:opacity-40"
              >
                <Play size={11} /> {triggering ? "…" : "Trigger"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toggle feedback */}
      {feedbackToggle && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <AlertCircle size={11} /> {feedbackToggle}
        </p>
      )}

      {/* Trigger feedback */}
      {feedbackTrigger && (
        <div className={`mt-2 flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 border ${
          feedbackTrigger.tipo === "ok"
            ? "border-green-800/50 bg-green-950/20 text-green-300"
            : "border-red-800/50 bg-red-950/20 text-red-300"
        }`}>
          {feedbackTrigger.tipo === "ok" ? <Check size={11} /> : <AlertCircle size={11} />}
          {feedbackTrigger.texto}
        </div>
      )}

      {/* Edit schedule form */}
      {editandoSchedule && (
        <div className="mt-3 rounded-lg border border-violet-800/40 bg-violet-950/10 px-4 py-3 space-y-3">
          <p className="text-xs text-violet-300 font-semibold">Editar schedule — 5 campos: min hora dom mes dow</p>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setNuevoSchedule(p.value)}
                disabled={guardando}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                  nuevoSchedule === p.value
                    ? "border-violet-600 bg-violet-900/40 text-violet-300"
                    : "border-gray-700 bg-gray-800/60 text-gray-400 hover:text-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={nuevoSchedule}
            onChange={(e) => setNuevoSchedule(e.target.value)}
            disabled={guardando}
            placeholder="* * * * *"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 disabled:opacity-50"
          />
          {nuevoSchedule && (
            <p className="text-xs text-gray-500">{fmtCronDesc(nuevoSchedule)}</p>
          )}
          {feedbackSchedule && (
            <p className={`text-xs flex items-center gap-1 ${feedbackSchedule.tipo === "ok" ? "text-green-400" : "text-red-400"}`}>
              {feedbackSchedule.tipo === "ok" ? <Check size={11} /> : <AlertCircle size={11} />}
              {feedbackSchedule.texto}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleReschedule}
              disabled={guardando || !nuevoSchedule.trim()}
              className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => { setEditandoSchedule(false); setFeedbackSchedule(null); }}
              disabled={guardando}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Función invocada — muestra solo el nombre sanitizado, nunca el comando completo */}
      <div className="mt-3 pt-3 border-t border-gray-800/50">
        <button
          onClick={() => setMostrandoInfo((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          {mostrandoInfo ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {mostrandoInfo ? "Ocultar" : "Ver función"}
        </button>
        {mostrandoInfo && (
          <div className="mt-2 px-3 py-2.5 rounded-lg bg-gray-950 border border-gray-800 text-xs font-mono">
            {job.ef_name ? (
              <span className="text-violet-400">{job.ef_name}</span>
            ) : (
              <span className="text-gray-600 italic">Función SQL interna (no invocable manualmente)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function CronPage() {
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);

  async function cargar() {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cron");
      const json = await res.json();
      if (!json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? "Error al cargar jobs");
        setJobs([]);
      } else {
        setJobs(json.jobs ?? []);
      }
    } catch {
      setErrorMsg("Error de red al cargar jobs");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const activos = jobs.filter((j) => j.active).length;
  const inactivos = jobs.filter((j) => !j.active).length;
  const conError = jobs.filter((j) => j.ultimo_estado === "failed").length;

  return (
    <AdminShell>
      <main className="px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Trabajos pg_cron</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Schedules reales de la DB · activar/desactivar · editar horario · trigger manual
            </p>
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-600"
          >
            <RefreshCw size={12} className={cargando ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {/* KPI chips */}
        {jobs.length > 0 && (
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs text-gray-500">Total</span>
              <span className="text-sm font-bold text-gray-200">{jobs.length}</span>
            </div>
            <div className={`rounded-lg border px-4 py-2.5 flex items-center gap-2 ${activos > 0 ? "border-green-800/50 bg-green-950/20" : "border-gray-800 bg-gray-900/60"}`}>
              <span className="text-xs text-gray-500">Activos</span>
              <span className={`text-sm font-bold ${activos > 0 ? "text-green-300" : "text-gray-400"}`}>{activos}</span>
            </div>
            {inactivos > 0 && (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2.5 flex items-center gap-2">
                <span className="text-xs text-gray-500">Inactivos</span>
                <span className="text-sm font-bold text-gray-500">{inactivos}</span>
              </div>
            )}
            {conError > 0 && (
              <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-2.5 flex items-center gap-2">
                <span className="text-xs text-gray-500">Con error</span>
                <span className="text-sm font-bold text-red-300">{conError}</span>
              </div>
            )}
          </div>
        )}

        {cargando && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando jobs…</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {!cargando && !errorMsg && (
          <div className="space-y-3">
            {jobs.map((job) => (
              <CronJobRow key={job.jobid} job={job} onRefresh={cargar} />
            ))}
            {jobs.length === 0 && (
              <div className="text-center py-16 text-gray-600 text-sm">Sin jobs en pg_cron</div>
            )}
          </div>
        )}
      </main>
    </AdminShell>
  );
}
