"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertCircle, ArrowRight, Check, EyeOff, Mail, RefreshCw } from "lucide-react";
import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { usePollingRefresh } from "@/lib/usePollingRefresh";
import type { Area, AreaClave, Chequeo, EstadoArea, Gravedad, Hallazgo } from "@/lib/asistente";

// Asistente CEO (2026-10-31): al entrar corre los chequeos de cada área y
// muestra el estado actual del negocio, los hallazgos con qué hacer, y el
// historial de partes diarios (8:00, por email solo a Manuel).

interface Parte { id: string; tipo: string; estado_general: EstadoArea; resumen: string; email_enviado_at: string | null; email_error: string | null; created_at: string }
interface Respuesta { ok: boolean; chequeo: Chequeo; historial: Parte[]; email_configurado: boolean; cron_configurado: boolean }

const RECHEQUEO_MS = 5 * 60_000;
const PASOS_CARGA = ["Comercial", "Operación", "Finanzas", "Experiencia", "Técnico", "Datos"];

const ESTADO: Record<EstadoArea, { texto: string; borde: string; fondo: string; punto: string; color: string }> = {
  bien:     { texto: "Bien",              borde: "border-emerald-900/60", fondo: "bg-emerald-950/20", punto: "bg-emerald-400", color: "text-emerald-300" },
  atencion: { texto: "Atención",          borde: "border-amber-800/60",   fondo: "bg-amber-950/20",   punto: "bg-amber-400",   color: "text-amber-300" },
  critico:  { texto: "Urgente",           borde: "border-red-800/60",     fondo: "bg-red-950/25",     punto: "bg-red-400",     color: "text-red-300" },
};
const GRAVEDAD: Record<Gravedad, { texto: string; punto: string; color: string }> = {
  critico:  { texto: "Urgente",  punto: "bg-red-400",     color: "text-red-300" },
  atencion: { texto: "Atención", punto: "bg-amber-400",   color: "text-amber-200" },
  info:     { texto: "Para saber", punto: "bg-sky-400",   color: "text-gray-200" },
  bien:     { texto: "Bien",     punto: "bg-emerald-400", color: "text-emerald-300" },
};

function haceCuanto(iso: string, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

export default function AsistenteCeoPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [paso, setPaso] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<AreaClave | "todas">("todas");
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const [parteAbierto, setParteAbierto] = useState<{ id: string; chequeo: Chequeo } | null>(null);

  const chequear = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/admin/tarot/asistente", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`);
      else { setDatos(j); setErrorMsg(null); }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);
  usePollingRefresh(chequear, RECHEQUEO_MS);

  // Animación de "revisando cada área" mientras corre el chequeo, y reloj del "hace X".
  useEffect(() => {
    if (!cargando) return;
    const id = setInterval(() => setPaso((p) => (p + 1) % PASOS_CARGA.length), 450);
    return () => clearInterval(id);
  }, [cargando]);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const accion = async (cuerpo: Record<string, unknown>) => {
    const r = await fetch("/api/admin/tarot/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setErrorMsg(j?.detalle ?? j?.motivo ?? `Error ${r.status}`); return null; }
    return j;
  };

  const enviarParte = async () => {
    setEnviando(true); setAviso(null);
    const j = await accion({ accion: "enviar_parte" });
    setEnviando(false);
    if (j) setAviso(j.email_enviado ? "Listo: te mandé el parte a tu email." : `Se guardó el parte, pero el email no salió: ${j.email_error ?? "error desconocido"}`);
    await chequear();
  };

  const abrirParte = async (id: string) => {
    if (parteAbierto?.id === id) { setParteAbierto(null); return; }
    const r = await fetch(`/api/admin/tarot/asistente?informe=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.informe?.contenido) setParteAbierto({ id, chequeo: j.informe.contenido as Chequeo });
  };

  const c = datos?.chequeo;
  const hallazgos = c ? c.areas.flatMap((a) => a.hallazgos).filter((h) => filtro === "todas" || h.area === filtro) : [];

  return (
    <TarotAdminShell>
      <main className="px-6 py-6 max-w-[1280px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Asistente CEO</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cada vez que entrás revisa el negocio desde todas las perspectivas y te dice qué atender. Solo mira y sugiere: nunca toca nada ni le escribe a un cliente.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={chequear} disabled={cargando} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-60">
              <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
              {cargando ? `Revisando ${PASOS_CARGA[paso].toLowerCase()}…` : c ? `Chequeado ${haceCuanto(c.generado_at, ahora)} · volver a chequear` : "Chequear"}
            </button>
            <button onClick={enviarParte} disabled={enviando || cargando}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-900/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-800/40 disabled:opacity-60">
              <Mail size={13} /> {enviando ? "Enviando…" : "Enviarme el parte ahora"}
            </button>
          </div>
        </div>

        {datos && (!datos.email_configurado || !datos.cron_configurado) && (
          <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-200">
            Para que el parte de las 8:00 llegue a tu email faltan variables en Vercel:{" "}
            {[!datos.cron_configurado && "CRON_SECRET", !datos.email_configurado && "RESEND_API_KEY"].filter(Boolean).join(" y ")}.
            Mientras tanto, los chequeos en vivo de esta pantalla funcionan igual.
          </div>
        )}
        {aviso && <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-xs text-gray-200">{aviso}</div>}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" /> {errorMsg}
          </div>
        )}

        {!c && cargando && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-8">
            <p className="text-sm text-gray-300 mb-4">Revisando el negocio…</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {PASOS_CARGA.map((p, i) => (
                <div key={p} className={`rounded-lg border px-3 py-2 text-xs transition-colors ${i === paso ? "border-amber-700 text-amber-200" : "border-gray-800 text-gray-500"}`}>{p}</div>
              ))}
            </div>
          </div>
        )}

        {c && (
          <div className={`space-y-6 transition-opacity ${cargando ? "opacity-70" : ""}`}>
            {/* Estado general */}
            <div className={`rounded-xl border px-5 py-4 ${ESTADO[c.estado_general].borde} ${ESTADO[c.estado_general].fondo}`}>
              <p className={`inline-flex items-center gap-2 text-sm font-semibold ${ESTADO[c.estado_general].color}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${ESTADO[c.estado_general].punto}`} />
                Estado general: {ESTADO[c.estado_general].texto}
              </p>
              <p className="mt-1.5 text-sm text-gray-200 leading-relaxed">{c.resumen}</p>
            </div>

            {/* Áreas */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {c.areas.map((a) => <TarjetaArea key={a.clave} a={a} activa={filtro === a.clave} onClick={() => setFiltro((f) => (f === a.clave ? "todas" : a.clave))} />)}
            </div>

            {/* Hallazgos */}
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-100">
                  Hallazgos {filtro !== "todas" && <span className="text-gray-500 font-normal">· {c.areas.find((a) => a.clave === filtro)?.nombre}</span>}
                </h3>
                <div className="flex items-center gap-3 text-xs">
                  {filtro !== "todas" && <button onClick={() => setFiltro("todas")} className="text-gray-400 hover:text-gray-200">Ver todas las áreas</button>}
                  {c.ocultos > 0 && (
                    <button onClick={async () => { if (await accion({ accion: "mostrar_todos" })) chequear(); }} className="text-gray-500 hover:text-gray-300">
                      {c.ocultos} oculto{c.ocultos > 1 ? "s" : ""} · mostrar
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70 overflow-hidden">
                {hallazgos.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-500">Nada para mostrar acá.</p>}
                {hallazgos.map((h) => (
                  <FilaHallazgo key={h.clave} h={h} area={c.areas.find((a) => a.clave === h.area)?.nombre ?? h.area}
                    onOcultar={async (estado) => { if (await accion({ accion: "ocultar", clave: h.clave, estado })) chequear(); }} />
                ))}
              </div>
            </section>

            {/* Historial de partes */}
            <section>
              <h3 className="text-sm font-semibold text-gray-100 mb-1">Partes anteriores</h3>
              <p className="text-[11px] text-gray-500 mb-3">El parte diario se genera a las 8:00 y te llega por email. Tocá uno para ver cómo estaba todo ese día.</p>
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800/70 overflow-hidden">
                {datos.historial.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-500">Todavía no hay partes. El primero sale mañana a las 8:00 (o pedilo con “Enviarme el parte ahora”).</p>}
                {datos.historial.map((p) => (
                  <div key={p.id}>
                    <button onClick={() => abrirParte(p.id)} className="w-full text-left px-4 py-3 hover:bg-gray-800/30 flex items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${ESTADO[p.estado_general].punto}`} />
                      <span className="flex-1 min-w-0">
                        <span className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleString("es-UY", { timeZone: "America/Montevideo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {" · "}{p.tipo === "diario" ? "Parte diario" : "A pedido"}
                          {p.email_enviado_at ? <span className="text-emerald-400/80"> · email enviado</span> : p.email_error ? <span className="text-red-400/80" title={p.email_error}> · email no salió</span> : null}
                        </span>
                        <span className="block text-sm text-gray-200 mt-0.5 line-clamp-2">{p.resumen}</span>
                      </span>
                    </button>
                    {parteAbierto?.id === p.id && (
                      <div className="px-4 pb-4 pl-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                        {parteAbierto.chequeo.areas.map((a) => (
                          <div key={a.clave} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs">
                            <p className={`inline-flex items-center gap-1.5 ${ESTADO[a.estado].color}`}><span className={`h-1.5 w-1.5 rounded-full ${ESTADO[a.estado].punto}`} />{a.nombre}</p>
                            <p className="text-gray-300 mt-0.5">{a.titular}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </TarotAdminShell>
  );
}

function TarjetaArea({ a, activa, onClick }: { a: Area; activa: boolean; onClick: () => void }) {
  const e = ESTADO[a.estado];
  const n = a.hallazgos.filter((h) => h.gravedad === "critico" || h.gravedad === "atencion").length;
  return (
    <button onClick={onClick} className={`text-left rounded-xl border px-4 py-3 transition-colors ${e.borde} ${activa ? e.fondo : "bg-gray-900/60 hover:bg-gray-800/40"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-100">{a.nombre}</p>
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${e.color}`}><span className={`h-2 w-2 rounded-full ${e.punto}`} />{e.texto}{n > 0 ? ` · ${n}` : ""}</span>
      </div>
      <p className="text-[11px] text-gray-500">{a.pregunta}</p>
      <p className="mt-2 text-xs text-gray-200 leading-snug">{a.titular}</p>
      <div className="mt-2 space-y-0.5">
        {a.metricas.map((m) => (
          <p key={m.label} className="flex justify-between gap-2 text-[11px]"><span className="text-gray-500">{m.label}</span><span className="text-gray-300 tabular-nums text-right">{m.valor}</span></p>
        ))}
      </div>
    </button>
  );
}

function FilaHallazgo({ h, area, onOcultar }: { h: Hallazgo; area: string; onOcultar: (estado: "listo" | "ignorado") => void }) {
  const g = GRAVEDAD[h.gravedad];
  return (
    <div className={`px-4 py-3 flex items-start gap-3 ${h.gravedad === "critico" ? "bg-red-950/10" : ""}`}>
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${g.punto}`} title={g.texto} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${g.color}`}>{h.titulo}</p>
        {h.detalle && <p className="text-xs text-gray-500 mt-0.5">{h.detalle}</p>}
        {h.que_hacer && <p className="text-xs text-gray-300 mt-1">→ {h.que_hacer}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">{area}</span>
          {h.link && <Link href={h.link as Route} className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200">Abrir <ArrowRight size={11} /></Link>}
        </p>
      </div>
      {h.gravedad !== "bien" && (
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => onOcultar("listo")} className="inline-flex items-center gap-1 rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:border-emerald-700 hover:text-emerald-300" title="Lo oculto 24 h; si sigue pasando, vuelve">
            <Check size={11} /> Listo
          </button>
          <button onClick={() => onOcultar("ignorado")} className="inline-flex items-center gap-1 rounded border border-gray-800 px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-300" title="Lo oculto 7 días">
            <EyeOff size={11} /> Ignorar 7 días
          </button>
        </div>
      )}
    </div>
  );
}
