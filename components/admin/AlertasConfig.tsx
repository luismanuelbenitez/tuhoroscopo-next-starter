"use client";
import { useState } from "react";
import { Bell, BellOff, Send, AlertCircle, CheckCircle, ToggleLeft, ToggleRight } from "lucide-react";

interface ConfigRow {
  id: string;
  nombre: string;
  valor: string;
}

interface AlertasConfigProps {
  rows: ConfigRow[];
  onOk: () => void;
}

function get(rows: ConfigRow[], nombre: string): string {
  return rows.find((r) => r.nombre === nombre)?.valor ?? "";
}

async function guardarClave(
  clave: string, valor: string, motivo: string,
): Promise<{ ok: boolean; detalle?: string }> {
  const res = await fetch("/api/admin/config/accion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clave, valor, motivo }),
  });
  const json = await res.json();
  return json;
}

export function AlertasConfig({ rows, onOk }: AlertasConfigProps) {
  const activo   = get(rows, "ALERTAS_EMAIL_ACTIVO") === "true";
  const destino  = get(rows, "ALERTAS_EMAIL_DESTINO");
  const cooldown = get(rows, "ALERTAS_COOLDOWN_HORAS") || "4";
  const umbralO  = get(rows, "ALERTAS_UMBRAL_ORDENES_ERROR") || "1";
  const umbralM  = get(rows, "ALERTAS_UMBRAL_MENSAJES_FALLIDOS") || "5";
  const ultimo   = get(rows, "ALERTAS_ULTIMO_EMAIL");

  const [editandoDestino, setEditandoDestino] = useState(false);
  const [nuevoDestino, setNuevoDestino] = useState(destino);
  const [editandoNumeros, setEditandoNumeros] = useState(false);
  const [nuevoCooldown, setNuevoCooldown] = useState(cooldown);
  const [nuevoUmbralO, setNuevoUmbralO] = useState(umbralO);
  const [nuevoUmbralM, setNuevoUmbralM] = useState(umbralM);

  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function fmtUltimo(iso: string): string {
    if (!iso) return "Nunca";
    try {
      return new Date(iso).toLocaleString("es-UY", {
        timeZone: "America/Montevideo",
        day: "2-digit", month: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
    } catch { return iso; }
  }

  async function toggleActivo() {
    setGuardando(true);
    setMsg(null);
    const nuevoValor = activo ? "false" : "true";
    const r = await guardarClave("ALERTAS_EMAIL_ACTIVO", nuevoValor,
      nuevoValor === "true" ? "Activar alertas por email" : "Desactivar alertas por email");
    if (r.ok) { onOk(); } else { setMsg({ tipo: "error", texto: r.detalle ?? "Error al guardar" }); }
    setGuardando(false);
  }

  async function guardarDestino() {
    if (!nuevoDestino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoDestino)) {
      setMsg({ tipo: "error", texto: "Email inválido" }); return;
    }
    setGuardando(true);
    setMsg(null);
    const r = await guardarClave("ALERTAS_EMAIL_DESTINO", nuevoDestino, "Actualizar email de alertas");
    if (r.ok) { setEditandoDestino(false); onOk(); }
    else { setMsg({ tipo: "error", texto: r.detalle ?? "Error" }); }
    setGuardando(false);
  }

  async function guardarNumeros() {
    const c = parseInt(nuevoCooldown), o = parseInt(nuevoUmbralO), m = parseInt(nuevoUmbralM);
    if (isNaN(c) || c < 1 || isNaN(o) || o < 1 || isNaN(m) || m < 1) {
      setMsg({ tipo: "error", texto: "Todos los valores deben ser números ≥ 1" }); return;
    }
    setGuardando(true);
    setMsg(null);
    const resultados = await Promise.all([
      guardarClave("ALERTAS_COOLDOWN_HORAS", String(c), "Actualizar cooldown alertas"),
      guardarClave("ALERTAS_UMBRAL_ORDENES_ERROR", String(o), "Actualizar umbral órdenes error"),
      guardarClave("ALERTAS_UMBRAL_MENSAJES_FALLIDOS", String(m), "Actualizar umbral mensajes fallidos"),
    ]);
    const error = resultados.find((r) => !r.ok);
    if (!error) { setEditandoNumeros(false); onOk(); }
    else { setMsg({ tipo: "error", texto: error.detalle ?? "Error al guardar" }); }
    setGuardando(false);
  }

  async function enviarPrueba() {
    setProbando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/alertas/prueba", { method: "POST" });
      const json = await res.json();
      if (json.ok && json.estado === "email_enviado") {
        setMsg({ tipo: "ok", texto: `Email de prueba enviado a ${json.destino}` });
        onOk(); // actualiza ALERTAS_ULTIMO_EMAIL
      } else {
        setMsg({ tipo: "error", texto: json.motivo ?? json.error ?? "No se pudo enviar" });
      }
    } catch {
      setMsg({ tipo: "error", texto: "Error de red" });
    } finally {
      setProbando(false);
    }
  }

  if (rows.filter((r) => r.nombre.startsWith("ALERTAS")).length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {activo
            ? <Bell size={15} className="text-violet-400" />
            : <BellOff size={15} className="text-gray-600" />}
          <div>
            <p className="text-sm font-semibold text-gray-100">Alertas por email</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Notificaciones automáticas cuando hay errores críticos · cron cada hora (:30)
            </p>
          </div>
        </div>
        <button
          onClick={toggleActivo}
          disabled={guardando}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            activo
              ? "border-violet-700/50 bg-violet-950/30 text-violet-300 hover:bg-violet-950/50"
              : "border-gray-700/50 bg-gray-800/60 text-gray-400 hover:text-gray-200"
          }`}
        >
          {activo
            ? <><ToggleRight size={14} className="text-violet-400" /> Activado</>
            : <><ToggleLeft size={14} className="text-gray-500" /> Desactivado</>}
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Email destino */}
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2">Email de destino</p>
          {editandoDestino ? (
            <div className="space-y-2">
              <input
                type="email"
                value={nuevoDestino}
                onChange={(e) => setNuevoDestino(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                placeholder="admin@ejemplo.com"
              />
              <div className="flex gap-2">
                <button onClick={guardarDestino} disabled={guardando}
                  className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors">
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
                <button onClick={() => { setEditandoDestino(false); setNuevoDestino(destino); }}
                  className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-gray-300">{destino || "—"}</span>
              <button onClick={() => { setNuevoDestino(destino); setEditandoDestino(true); }}
                className="text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-2 py-1 hover:border-gray-700 transition-colors">
                Editar
              </button>
            </div>
          )}
        </div>

        {/* Umbrales + cooldown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400">Umbrales y cooldown</p>
            {!editandoNumeros && (
              <button onClick={() => {
                setNuevoCooldown(cooldown); setNuevoUmbralO(umbralO); setNuevoUmbralM(umbralM);
                setEditandoNumeros(true);
              }} className="text-xs text-gray-500 hover:text-gray-300 border border-gray-800 rounded-lg px-2 py-1 hover:border-gray-700 transition-colors">
                Editar
              </button>
            )}
          </div>
          {editandoNumeros ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Cooldown (horas)", val: nuevoCooldown, set: setNuevoCooldown, hint: "Entre alertas" },
                  { label: "Umbral errores tarot", val: nuevoUmbralO, set: setNuevoUmbralO, hint: "Órdenes en error" },
                  { label: "Umbral msg fallidos", val: nuevoUmbralM, set: setNuevoUmbralM, hint: "Mensajes 24h" },
                ].map(({ label, val, set, hint }) => (
                  <div key={label}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="number" min="1" max="9999" value={val}
                      onChange={(e) => set(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-600" />
                    <p className="text-xs text-gray-700 mt-0.5">{hint}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={guardarNumeros} disabled={guardando}
                  className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-xs text-white font-medium transition-colors">
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
                <button onClick={() => setEditandoNumeros(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Cooldown", valor: `${cooldown}h`, desc: "Entre alertas" },
                { label: "Umbral errores TTC", valor: `≥ ${umbralO}`, desc: "Órdenes en error" },
                { label: "Umbral msg fallidos", valor: `≥ ${umbralM}`, desc: "Mensajes 24h" },
              ].map(({ label, valor, desc }) => (
                <div key={label} className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2.5">
                  <p className="text-sm font-bold text-gray-200 tabular-nums">{valor}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Último email + botón prueba */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-gray-800/50">
          <div className="text-xs text-gray-600">
            Último email enviado:{" "}
            <span className="text-gray-500 font-mono">{fmtUltimo(ultimo)}</span>
          </div>
          <button
            onClick={enviarPrueba}
            disabled={probando || !destino}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-colors"
          >
            <Send size={12} />
            {probando ? "Enviando…" : "Enviar prueba"}
          </button>
        </div>

        {/* Feedback */}
        {msg && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
            msg.tipo === "ok"
              ? "border border-green-800/50 bg-green-950/30 text-green-300"
              : "border border-red-800/50 bg-red-950/30 text-red-300"
          }`}>
            {msg.tipo === "ok"
              ? <CheckCircle size={13} className="shrink-0 mt-0.5" />
              : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
            {msg.texto}
          </div>
        )}
      </div>
    </div>
  );
}
