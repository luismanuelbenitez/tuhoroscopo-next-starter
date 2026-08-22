"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, AlertCircle, ExternalLink } from "lucide-react";

// ============================================================================
// Detalle de una persona (identidad consolidada) — Fase 8 del sprint
// "Módulo Clientes V1". Mismo patrón visual de drawer que
// components/admin/TarotClienteDetalle.tsx (registro individual) — no se
// duplica el detalle de orden, se navega a /admin/tarot/ordenes?orden_id=
// reutilizando el deep-link ya existente ahí.
// ============================================================================

interface Persona {
  persona_id: string;
  nombre: string;
  telefono_principal: string | null;
  email_principal: string | null;
  telefonos_observados: string[];
  emails_observados: string[];
  fecha_nacimiento: string | null;
  primer_registro: string;
  ultimo_registro: string;
  compras: number;
  gastado_por_moneda: Record<string, number>;
  primera_compra: string | null;
  ultima_compra: string | null;
  dias_promedio_entre_compras: number | null;
  estado: "sin_compra" | "nuevo" | "recurrente";
}

interface RegistroResumen {
  id: string;
  nombre_completo: string;
  telefono: string;
  email: string | null;
  created_at: string;
}

interface OrdenResumen {
  id: string;
  estado: string;
  tema: string;
  pregunta_usuario: string | null;
  precio_cobrado: number;
  moneda: string;
  created_at: string;
  utm_source: string | null;
  utm_campaign: string | null;
  descuento_aplicado: number | null;
}

interface DetalleData {
  ok: boolean;
  persona: Persona;
  registros: RegistroResumen[];
  ordenes: OrdenResumen[];
}

const SIMBOLO_MONEDA: Record<string, string> = { UYU: "$U", ARS: "AR$", USD: "US$" };

const ORDEN_ESTADO_CLS: Record<string, string> = {
  formulario_completo: "bg-gray-800 text-gray-400",
  pago_iniciado: "bg-amber-900/50 text-amber-300",
  pago_confirmado: "bg-sky-900/50 text-sky-300",
  generando_lectura: "bg-violet-900/50 text-violet-300",
  lectura_lista: "bg-blue-900/50 text-blue-300",
  generando_pdf: "bg-violet-900/50 text-violet-300",
  pdf_listo: "bg-teal-900/50 text-teal-300",
  enviando_whatsapp: "bg-teal-900/50 text-teal-300",
  entregado: "bg-emerald-900/50 text-emerald-300",
  error_lectura: "bg-red-900/50 text-red-300",
  error_pdf: "bg-red-900/50 text-red-300",
  error_whatsapp: "bg-red-900/50 text-red-300",
  error_critico: "bg-red-900/50 text-red-300",
};
function estadoOrdenCls(estado: string) {
  return ORDEN_ESTADO_CLS[estado] ?? "bg-gray-800 text-gray-400";
}

const ESTADO_LABEL: Record<Persona["estado"], string> = {
  nuevo: "Nuevo", recurrente: "Recurrente", sin_compra: "Sin compra",
};

function num(n: number, dec = 0) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMonedas(obj: Record<string, number>): string {
  const entradas = Object.entries(obj);
  if (entradas.length === 0) return "—";
  return entradas.map(([m, v]) => `${SIMBOLO_MONEDA[m] ?? m} ${num(v)}`).join(" · ");
}
function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}
function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-gray-800/50 text-sm last:border-0">
      <span className="w-44 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

export interface PersonaDetalleProps {
  clienteId: string;
  onClose: () => void;
}

export function PersonaDetalle({ clienteId, onClose }: PersonaDetalleProps) {
  const [data, setData] = useState<DetalleData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setErrorMsg(null);
    setData(null);
    fetch(`/api/admin/tarot/clientes-unicos?vista=detalle&cliente_id=${encodeURIComponent(clienteId)}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || !json.ok) {
          setErrorMsg(json?.detalle ?? json?.motivo ?? "Error al cargar el cliente");
        } else {
          setData(json as DetalleData);
        }
      })
      .catch((e: unknown) => setErrorMsg(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setCargando(false));
  }, [clienteId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-medium text-white">
            {data ? data.persona.nombre : "Detalle cliente"}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {cargando && <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Cargando…</p>}

          {!cargando && errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={14} className="shrink-0" />
              {errorMsg}
            </div>
          )}

          {!cargando && data && (
            <>
              <Sect title="Identidad">
                <DataRow label="Nombre (más reciente)" value={data.persona.nombre} />
                <DataRow label="Teléfonos observados" value={data.persona.telefonos_observados.join(", ") || "—"} />
                <DataRow label="Emails observados" value={data.persona.emails_observados.join(", ") || "—"} />
                <DataRow label="Fecha nacimiento" value={fmtFecha(data.persona.fecha_nacimiento)} />
                <DataRow label="Primer registro" value={fmtFechaHora(data.persona.primer_registro)} />
                <DataRow label="Último registro" value={fmtFechaHora(data.persona.ultimo_registro)} />
                <DataRow label="Registros consolidados" value={`${data.registros.length}`} />
              </Sect>

              <Sect title="Resumen comercial">
                <DataRow label="Estado" value={ESTADO_LABEL[data.persona.estado]} />
                <DataRow label="Compras" value={data.persona.compras} />
                <DataRow label="Total gastado (histórico)" value={fmtMonedas(data.persona.gastado_por_moneda)} />
                <DataRow label="Primera compra" value={fmtFecha(data.persona.primera_compra)} />
                <DataRow label="Última compra" value={fmtFecha(data.persona.ultima_compra)} />
                {data.persona.dias_promedio_entre_compras !== null && (
                  <DataRow label="Días promedio entre compras" value={data.persona.dias_promedio_entre_compras.toFixed(1)} />
                )}
              </Sect>

              <Sect title={`Historial de órdenes (${data.ordenes.length})`}>
                {data.ordenes.length === 0 && <p className="text-sm text-gray-500">Sin órdenes registradas.</p>}
                <div className="space-y-3">
                  {data.ordenes.map((o) => (
                    <div key={o.id} className="rounded-lg border border-gray-800 bg-gray-800/20 p-3">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoOrdenCls(o.estado)}`}>{o.estado}</span>
                        <span className="text-xs text-amber-300 font-medium capitalize">{o.tema}</span>
                        <span className="text-xs text-gray-400 font-mono ml-auto">{fmtFecha(o.created_at)}</span>
                        <Link
                          href={`/admin/tarot/ordenes?orden_id=${o.id}`}
                          target="_blank"
                          className="text-xs text-gray-500 hover:text-amber-300 transition-colors flex items-center gap-1"
                          title="Ver orden completa"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="text-gray-300 font-medium">{o.precio_cobrado} {o.moneda}</span>
                        {o.descuento_aplicado !== null && o.descuento_aplicado > 0 && (
                          <span className="text-emerald-400">-{o.descuento_aplicado} desc.</span>
                        )}
                        {(o.utm_source || o.utm_campaign) && (
                          <span className="text-gray-500">{[o.utm_source, o.utm_campaign].filter(Boolean).join(" / ")}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Sect>

              <Sect title="Registros individuales">
                <div className="space-y-1.5">
                  {data.registros.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 text-xs bg-gray-800/30 rounded px-3 py-2">
                      <span className="text-gray-200 font-medium">{r.nombre_completo}</span>
                      <span className="font-mono text-gray-500">{r.telefono}</span>
                      <span className="text-gray-500">{r.email ?? "—"}</span>
                      <span className="text-gray-600 ml-auto">{fmtFechaHora(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              </Sect>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
