"use client";
import { useState, useEffect } from "react";
import {
  Users,
  MessageCircle,
  Send,
  AlertTriangle,
  Clock,
  AlertCircle,
  LogOut,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ===========================================================================
// Types — metricas-basicas
// ===========================================================================

interface MetricasSuscriptores {
  premium_activos_actuales: number;
  whatsapp_confirmados_actuales: number;
  pausados_actuales: number;
  altas_periodo: number;
  tasa_confirmacion_whatsapp_pct: number | null;
}

interface MetricasMensajes {
  enviados_periodo: number;
  pendientes_actuales: number;
  procesando_actuales: number;
  fallidos_actuales: number;
  fallo_definitivo_actuales: number;
  tasa_fallidos_sobre_enviados_pct: number | null;
}

interface MetricasContenido {
  generado_periodo: number;
  enviado_periodo: number;
  pendiente_actual: number;
  tasa_envio_contenido_pct: number | null;
}

interface MetricasErrores {
  errores_log_funciones_periodo: number;
}

interface MetricasSuscripciones {
  activadas_definitivamente_periodo: number;
  creadas_periodo: number;
}

interface MetricasData {
  ok: boolean;
  periodo: { desde_utc: string; hasta_utc: string } | null;
  suscriptores: MetricasSuscriptores | null;
  suscripciones: MetricasSuscripciones | null;
  mensajes: MetricasMensajes | null;
  contenido_premium: MetricasContenido | null;
  errores: MetricasErrores | null;
}

// ===========================================================================
// Types — resumen-diario
// ===========================================================================

interface MensajeEnviado {
  tipo_mensaje: string;
  nombre_plantilla: string | null;
  fecha_enviado: string;
}

interface MensajeFallido {
  tipo_mensaje: string;
  nombre_plantilla: string | null;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
  fecha_ultimo_intento: string | null;
}

interface ErrorLog {
  nombre_funcion: string;
  resultado: string;
  fecha_ejecucion: string;
}

interface ResumenData {
  ok: boolean;
  ultimos_mensajes_enviados: MensajeEnviado[];
  ultimos_mensajes_fallidos: MensajeFallido[];
  ultimos_errores: ErrorLog[];
}

// ===========================================================================
// Hooks
// ===========================================================================

function useMetricasBasicas() {
  const [data, setData] = useState<MetricasData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/metricas-basicas")
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? `Error HTTP ${r.status}`);
          return;
        }
        setData(json as MetricasData);
      })
      .catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => setCargando(false));
  }, []);

  return { data, cargando, errorMsg };
}

function useResumenDiario() {
  const [data, setData] = useState<ResumenData | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch("/api/admin/resumen-diario")
      .then(async (r) => {
        if (!r.ok) return;
        const json = await r.json().catch(() => null);
        if (json) setData(json as ResumenData);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  return { data, cargando };
}

// ===========================================================================
// Shared helpers
// ===========================================================================

function Row({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{String(valor)}</span>
    </div>
  );
}

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

function truncar(s: string | null, max = 55): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ===========================================================================
// MetricCard — wrapper genérico con expand/collapse
// ===========================================================================

interface MetricCardProps {
  iconColor: string;
  borderColor: string;
  hoverBorderColor: string;
  alertBadgeColor?: string;
  icon: React.ReactNode;
  valor: number | string;
  titulo: string;
  alerta?: boolean;
  children?: React.ReactNode;
}

function MetricCard({
  iconColor,
  borderColor,
  hoverBorderColor,
  alertBadgeColor,
  icon,
  valor,
  titulo,
  alerta,
  children,
}: MetricCardProps) {
  const [abierto, setAbierto] = useState(false);
  const clicable = children != null && children !== false;
  const valorVacio = valor === "—";

  return (
    <div
      className={`rounded-xl border ${borderColor} bg-gray-900 p-5 flex flex-col gap-3
        ${clicable ? `cursor-pointer select-none transition-colors ${hoverBorderColor}` : ""}`}
      onClick={clicable ? () => setAbierto((v) => !v) : undefined}
    >
      <div className="flex items-center justify-between">
        <span className={iconColor}>{icon}</span>
        <div className="flex items-center gap-2">
          {alerta && alertBadgeColor && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${alertBadgeColor}`}>
              alerta
            </span>
          )}
          {clicable && (
            <span className="text-gray-600">
              {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          )}
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold ${valorVacio ? "text-gray-600" : ""}`}>{valor}</p>
        <p className="text-sm text-gray-400 mt-0.5">{titulo}</p>
      </div>
      {abierto && children && (
        <div className="mt-1 pt-3 border-t border-gray-800">{children}</div>
      )}
    </div>
  );
}

// ===========================================================================
// Card 1: Premium activos
// ===========================================================================

function CardPremiumActivos({ metricas }: { metricas: MetricasData | null }) {
  const s = metricas?.suscriptores;
  const sus = metricas?.suscripciones;
  const valor = s?.premium_activos_actuales ?? "—";
  const tasa = s?.tasa_confirmacion_whatsapp_pct != null ? `${s.tasa_confirmacion_whatsapp_pct}%` : "—";

  return (
    <MetricCard
      iconColor="text-emerald-400"
      borderColor="border-emerald-800/40"
      hoverBorderColor="hover:border-emerald-700/60"
      icon={<Users size={20} />}
      valor={valor}
      titulo="Premium activos"
    >
      {s && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="WhatsApp confirmados" valor={`${s.whatsapp_confirmados_actuales} / ${s.premium_activos_actuales}`} />
          <Row label="Tasa confirmación" valor={tasa} />
          <Row label="Pausados" valor={s.pausados_actuales} />
          <Row label="Altas hoy" valor={s.altas_periodo} />
          {sus && <Row label="Suscripciones activadas hoy" valor={sus.activadas_definitivamente_periodo} />}
          {metricas.periodo && (
            <p className="text-xs text-gray-600 mt-1">
              Período UTC: {metricas.periodo.desde_utc.slice(0, 10)} → {metricas.periodo.hasta_utc.slice(0, 10)}
            </p>
          )}
        </div>
      )}
    </MetricCard>
  );
}

// ===========================================================================
// Card 2: WhatsApp confirmados
// ===========================================================================

function CardWhatsAppConfirmados({ metricas }: { metricas: MetricasData | null }) {
  const s = metricas?.suscriptores;
  const valor = s?.whatsapp_confirmados_actuales ?? "—";
  const sinConfirmar = s != null ? s.premium_activos_actuales - s.whatsapp_confirmados_actuales : null;
  const tasa = s?.tasa_confirmacion_whatsapp_pct != null ? `${s.tasa_confirmacion_whatsapp_pct}%` : "—";
  const alerta = sinConfirmar != null && sinConfirmar > 0;

  return (
    <MetricCard
      iconColor="text-sky-400"
      borderColor="border-sky-800/40"
      hoverBorderColor="hover:border-sky-700/60"
      alertBadgeColor="bg-sky-900/50 text-sky-300"
      icon={<ShieldCheck size={20} />}
      valor={valor}
      titulo="WhatsApp confirmados"
      alerta={alerta}
    >
      {s && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Confirmados" valor={s.whatsapp_confirmados_actuales} />
          <Row label="Sin confirmar" valor={sinConfirmar ?? "—"} />
          <Row label="Tasa confirmación" valor={tasa} />
          <Row label="Pausados" valor={s.pausados_actuales} />
        </div>
      )}
    </MetricCard>
  );
}

// ===========================================================================
// Card 3: Mensajes enviados hoy
// ===========================================================================

function CardMensajesEnviados({
  metricas,
  resumen,
  cargandoResumen,
}: {
  metricas: MetricasData | null;
  resumen: ResumenData | null;
  cargandoResumen: boolean;
}) {
  const m = metricas?.mensajes;
  const valor = m?.enviados_periodo ?? "—";

  return (
    <MetricCard
      iconColor="text-violet-400"
      borderColor="border-violet-800/40"
      hoverBorderColor="hover:border-violet-700/60"
      icon={<Send size={20} />}
      valor={valor}
      titulo="Mensajes enviados hoy"
    >
      {m && (
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Enviados período" valor={m.enviados_periodo} />
          <Row label="Pendientes actuales" valor={m.pendientes_actuales} />
          <Row label="Procesando" valor={m.procesando_actuales} />
          {m.tasa_fallidos_sobre_enviados_pct != null && (
            <Row label="Tasa fallidos / enviados" valor={`${m.tasa_fallidos_sobre_enviados_pct}%`} />
          )}
          {cargandoResumen && (
            <p className="text-xs text-gray-500 animate-pulse mt-1">Cargando últimos enviados…</p>
          )}
          {!cargandoResumen && resumen && resumen.ultimos_mensajes_enviados.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1.5">Últimos enviados</p>
              <div className="flex flex-col gap-1">
                {resumen.ultimos_mensajes_enviados.slice(0, 5).map((msg, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 truncate max-w-[60%]">
                      {msg.nombre_plantilla ?? msg.tipo_mensaje}
                    </span>
                    <span className="text-gray-500">{fechaHora(msg.fecha_enviado)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!cargandoResumen && !resumen && (
            <p className="text-xs text-gray-600 mt-1">Detalle no disponible</p>
          )}
        </div>
      )}
    </MetricCard>
  );
}

// ===========================================================================
// Card 4: Mensajes fallidos
// ===========================================================================

function CardMensajesFallidos({
  metricas,
  resumen,
  cargandoResumen,
}: {
  metricas: MetricasData | null;
  resumen: ResumenData | null;
  cargandoResumen: boolean;
}) {
  const m = metricas?.mensajes;
  const total = m != null ? m.fallidos_actuales + m.fallo_definitivo_actuales : null;
  const valor = total ?? "—";
  const alerta = total != null && total > 0;

  return (
    <MetricCard
      iconColor="text-red-400"
      borderColor="border-red-800/40"
      hoverBorderColor="hover:border-red-700/60"
      alertBadgeColor="bg-red-900/50 text-red-300"
      icon={<AlertCircle size={20} />}
      valor={valor}
      titulo="Mensajes fallidos"
      alerta={alerta}
    >
      {m && (
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Fallidos (recuperables)" valor={m.fallidos_actuales} />
          <Row label="Fallo definitivo" valor={m.fallo_definitivo_actuales} />
          <Row label="Pendientes actuales" valor={m.pendientes_actuales} />
          {cargandoResumen && (
            <p className="text-xs text-gray-500 animate-pulse mt-1">Cargando detalle…</p>
          )}
          {!cargandoResumen && resumen && resumen.ultimos_mensajes_fallidos.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">Sin mensajes fallidos actuales.</p>
          )}
          {!cargandoResumen && resumen && resumen.ultimos_mensajes_fallidos.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1.5">Últimos fallidos</p>
              <div className="flex flex-col gap-2">
                {resumen.ultimos_mensajes_fallidos.slice(0, 5).map((msg, i) => (
                  <div key={i} className="text-xs border-l-2 border-red-800/50 pl-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300">{msg.nombre_plantilla ?? msg.tipo_mensaje}</span>
                      <span className={msg.estado === "fallo_definitivo" ? "text-red-400" : "text-amber-400"}>
                        {msg.estado}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-500 truncate max-w-[75%]">{truncar(msg.ultimo_error)}</span>
                      <span className="text-gray-600 ml-2 shrink-0">{msg.intentos}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!cargandoResumen && !resumen && (
            <p className="text-xs text-gray-600 mt-1">Detalle no disponible</p>
          )}
        </div>
      )}
    </MetricCard>
  );
}

// ===========================================================================
// Card 5: Contenido pendiente
// ===========================================================================

function CardContenidoPendiente({ metricas }: { metricas: MetricasData | null }) {
  const c = metricas?.contenido_premium;
  const valor = c?.pendiente_actual ?? "—";
  const alerta = c != null && c.pendiente_actual > 0;
  const tasa = c?.tasa_envio_contenido_pct != null ? `${c.tasa_envio_contenido_pct}%` : "—";

  return (
    <MetricCard
      iconColor="text-amber-400"
      borderColor="border-amber-800/40"
      hoverBorderColor="hover:border-amber-700/60"
      alertBadgeColor="bg-amber-900/50 text-amber-300"
      icon={<Clock size={20} />}
      valor={valor}
      titulo="Contenido pendiente"
      alerta={alerta}
    >
      {c && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label="Pendiente actual" valor={c.pendiente_actual} />
          <Row label="Generado período" valor={c.generado_periodo} />
          <Row label="Enviado período" valor={c.enviado_periodo} />
          <Row label="Tasa de envío" valor={tasa} />
        </div>
      )}
    </MetricCard>
  );
}

// ===========================================================================
// Card 6: Errores recientes
// ===========================================================================

function CardErroresRecientes({
  metricas,
  resumen,
  cargandoResumen,
}: {
  metricas: MetricasData | null;
  resumen: ResumenData | null;
  cargandoResumen: boolean;
}) {
  const e = metricas?.errores;
  const valor = e?.errores_log_funciones_periodo ?? "—";
  const alerta = e != null && e.errores_log_funciones_periodo > 0;

  return (
    <MetricCard
      iconColor="text-red-400"
      borderColor="border-red-800/40"
      hoverBorderColor="hover:border-red-700/60"
      alertBadgeColor="bg-red-900/50 text-red-300"
      icon={<AlertTriangle size={20} />}
      valor={valor}
      titulo="Errores recientes"
      alerta={alerta}
    >
      {e && (
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Errores en el período" valor={e.errores_log_funciones_periodo} />
          {cargandoResumen && (
            <p className="text-xs text-gray-500 animate-pulse mt-1">Cargando errores…</p>
          )}
          {!cargandoResumen && resumen && resumen.ultimos_errores.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">Sin errores en el período.</p>
          )}
          {!cargandoResumen && resumen && resumen.ultimos_errores.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1.5">Últimos errores</p>
              <div className="flex flex-col gap-2">
                {resumen.ultimos_errores.slice(0, 5).map((err, i) => (
                  <div key={i} className="text-xs border-l-2 border-red-800/50 pl-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 truncate max-w-[65%]">{err.nombre_funcion}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{fechaHora(err.fecha_ejecucion)}</span>
                    </div>
                    <p className="text-amber-400/80 mt-0.5">{truncar(err.resultado, 60)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!cargandoResumen && !resumen && (
            <p className="text-xs text-gray-600 mt-1">Detalle no disponible</p>
          )}
        </div>
      )}
    </MetricCard>
  );
}

// ===========================================================================
// AdminDashboard
// ===========================================================================

export function AdminDashboard() {
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const { data: metricas, cargando, errorMsg } = useMetricasBasicas();
  const { data: resumen, cargando: cargandoResumen } = useResumenDiario();

  async function handleLogout() {
    setCerrandoSesion(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={22} className="text-violet-400" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Panel THC</h1>
              <p className="text-xs text-gray-500 leading-tight">Administración operativa</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={cerrandoSesion}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            <LogOut size={15} />
            {cerrandoSesion ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
        {/* Nav */}
        <div className="max-w-5xl mx-auto px-6 flex gap-0">
          <span className="text-sm text-white border-b-2 border-violet-500 py-2.5 px-3">
            Dashboard
          </span>
          <a
            href="/admin/suscriptores"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Suscriptores
          </a>
          <a
            href="/admin/mensajes-problematicos"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Mensajes
          </a>
          <a
            href="/admin/contenido"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Contenido
          </a>
          <a
            href="/admin/suscripciones"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Suscripciones
          </a>
          <a
            href="/admin/logs"
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors"
          >
            Logs
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {cargando && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-sm text-gray-400">
            <span className="animate-pulse">Cargando métricas…</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={15} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardPremiumActivos metricas={metricas} />
          <CardWhatsAppConfirmados metricas={metricas} />
          <CardMensajesEnviados metricas={metricas} resumen={resumen} cargandoResumen={cargandoResumen} />
          <CardMensajesFallidos metricas={metricas} resumen={resumen} cargandoResumen={cargandoResumen} />
          <CardContenidoPendiente metricas={metricas} />
          <CardErroresRecientes metricas={metricas} resumen={resumen} cargandoResumen={cargandoResumen} />
        </div>
      </main>
    </div>
  );
}
