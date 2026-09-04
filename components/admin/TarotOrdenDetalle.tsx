"use client";
import { useEffect, useState } from "react";
import { X, ExternalLink, AlertCircle, RotateCcw, CheckCircle2, Loader2, KeyRound, Copy, RefreshCw, Check, Ban, Mail } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface Orden {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string;
  estado: string;
  external_reference: string;
  pregunta_usuario: string;
  tema: string;
  precio_cobrado: number;
  moneda: string;
  origen_canal: string;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
  estado_resumen: string;
  warnings: string[];
}

interface Lectura {
  id: string;
  estado: string;
  numero_intento: number;
  es_vigente: boolean;
  ia_modelo: string;
  ia_tokens_entrada: number;
  ia_tokens_salida: number;
  ia_costo_usd: number;
  resumen_lectura: string | null;
  mensaje_final: string | null;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  created_at: string;
  warnings: string[];
}

interface Pdf {
  id: string;
  estado: string;
  numero_intento: number;
  storage_url: string | null;
  tamano_bytes: number | null;
  paginas: number | null;
  plantilla_usada: string;
  error_codigo: string | null;
  error_mensaje: string | null;
  generado_at: string | null;
  url_expira_at: string | null;
  warnings: string[];
}

interface Pago {
  id: string;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  mp_payment_type: string | null;
  monto: number | null;
  moneda: string | null;
  webhook_received_at: string | null;
  warnings: string[];
}

interface AccesoWeb {
  estado: string;
  created_at: string;
  expira_at: string;
  opened_count: number;
  last_opened_at: string | null;
}

interface ImagenEstado {
  existe: boolean;
  signedUrl: string | null;
}

interface EmailEstado {
  aplica: boolean;
  estado: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" });
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
      <span className="text-gray-200 break-all">{value}</span>
    </div>
  );
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

const ESTADO_ORDEN: Record<string, { label: string; cls: string }> = {
  formulario_completo:  { label: "Formulario",    cls: "bg-gray-800 text-gray-400" },
  pago_iniciado:        { label: "Pago iniciado", cls: "bg-amber-900/50 text-amber-300" },
  pago_confirmado:      { label: "Pago ok",       cls: "bg-sky-900/50 text-sky-300" },
  pago_rechazado:       { label: "Rechazado",     cls: "bg-red-900/50 text-red-300" },
  pago_expirado:        { label: "Expirado",      cls: "bg-red-900/50 text-red-300" },
  generando_lectura:    { label: "Generando IA",  cls: "bg-amber-900/50 text-amber-300" },
  lectura_lista:        { label: "Lectura lista", cls: "bg-sky-900/50 text-sky-300" },
  generando_pdf:        { label: "Generando PDF", cls: "bg-amber-900/50 text-amber-300" },
  pdf_listo:            { label: "PDF listo",     cls: "bg-violet-900/50 text-violet-300" },
  enviando_whatsapp:    { label: "Enviando WA",   cls: "bg-amber-900/50 text-amber-300" },
  entregado:            { label: "Entregado",     cls: "bg-emerald-900/50 text-emerald-300" },
  error_lectura:        { label: "Error lectura", cls: "bg-red-900/50 text-red-300" },
  error_pdf:            { label: "Error PDF",     cls: "bg-red-900/50 text-red-300" },
  error_whatsapp:       { label: "Error WA",      cls: "bg-red-900/50 text-red-300" },
  error_critico:        { label: "Error crítico", cls: "bg-red-900/50 text-red-400 font-bold" },
  cancelado:            { label: "Cancelado",     cls: "bg-gray-800 text-gray-400" },
};

const ESTADO_LECTURA: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: "Pendiente",   cls: "bg-gray-800 text-gray-400" },
  generando:   { label: "Generando",  cls: "bg-amber-900/50 text-amber-300" },
  completada:  { label: "Completada", cls: "bg-emerald-900/50 text-emerald-300" },
  error:       { label: "Error",      cls: "bg-red-900/50 text-red-300" },
};

const ESTADO_PDF: Record<string, { label: string; cls: string }> = {
  pendiente:        { label: "Pendiente",      cls: "bg-gray-800 text-gray-400" },
  generando:        { label: "Generando",      cls: "bg-amber-900/50 text-amber-300" },
  generado:         { label: "Generado",       cls: "bg-emerald-900/50 text-emerald-300" },
  error_generacion: { label: "Error",          cls: "bg-red-900/50 text-red-300" },
  invalidado:       { label: "Invalidado",     cls: "bg-gray-800 text-gray-400" },
};

// Checklist "Estado resumido de experiencia" (item 4) — deriva todo de
// datos ya cargados por el componente, no agrega ninguna tabla ni fetch
// nuevo aparte de lo que ya trae ef_tarot_admin_orden_experiencia.
type ChecklistTono = "ok" | "pendiente" | "error";

function ChecklistBadge({ label, tono }: { label: string; tono: ChecklistTono }) {
  const cls = tono === "ok"
    ? "bg-emerald-900/40 text-emerald-300 border-emerald-800/60"
    : tono === "error"
      ? "bg-red-900/40 text-red-300 border-red-800/60"
      : "bg-gray-800/60 text-gray-400 border-gray-700/60";
  const Icono = tono === "ok" ? CheckCircle2 : tono === "error" ? Ban : Loader2;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border whitespace-nowrap ${cls}`}>
      <Icono size={12} className={tono === "pendiente" ? "opacity-60" : ""} />
      {label}
    </span>
  );
}

function whatsappChecklist(estadoOrden: string): { label: string; tono: ChecklistTono } {
  if (estadoOrden === "entregado") return { label: "WhatsApp: enviado", tono: "ok" };
  if (estadoOrden === "entregado_simulado") return { label: "WhatsApp: simulado", tono: "ok" };
  if (estadoOrden === "enviando_whatsapp") return { label: "WhatsApp: enviando…", tono: "pendiente" };
  if (estadoOrden === "error_whatsapp" || estadoOrden === "error_critico") return { label: "WhatsApp: error", tono: "error" };
  return { label: "WhatsApp: pendiente", tono: "pendiente" };
}

function accesoBadge(info: AccesoWeb | null): { label: string; cls: string } {
  if (!info) return { label: "Sin generar", cls: "bg-gray-800 text-gray-400" };
  if (info.estado === "revocado") return { label: "Revocado", cls: "bg-red-900/50 text-red-300" };
  if (new Date(info.expira_at).getTime() < Date.now()) return { label: "Expirado", cls: "bg-red-900/50 text-red-300" };
  return { label: "Activo", cls: "bg-emerald-900/50 text-emerald-300" };
}

const ESTADO_PAGO: Record<string, { label: string; cls: string }> = {
  pending:      { label: "Pendiente",    cls: "bg-amber-900/50 text-amber-300" },
  approved:     { label: "Aprobado",    cls: "bg-emerald-900/50 text-emerald-300" },
  in_process:   { label: "En proceso",  cls: "bg-sky-900/50 text-sky-300" },
  rejected:     { label: "Rechazado",   cls: "bg-red-900/50 text-red-300" },
  cancelled:    { label: "Cancelado",   cls: "bg-gray-800 text-gray-400" },
  refunded:     { label: "Reembolsado", cls: "bg-orange-900/50 text-orange-300" },
  charged_back: { label: "Contracargo", cls: "bg-red-900/50 text-red-400 font-bold" },
};

// ============================================================================
// Component
// ============================================================================

type AccionEstado = "idle" | "enviando" | "ok" | "error";

const ACCIONES_POR_ESTADO: Record<string, { accion: "reintentar_lectura" | "reintentar_pdf" | "reintentar_whatsapp"; label: string }[]> = {
  pago_confirmado:  [{ accion: "reintentar_lectura",  label: "Iniciar lectura" }],
  error_lectura:    [{ accion: "reintentar_lectura",  label: "Reintentar lectura" }],
  lectura_lista:    [{ accion: "reintentar_pdf",      label: "Generar PDF" }],
  error_pdf:        [{ accion: "reintentar_pdf",      label: "Reintentar PDF" }],
  pdf_listo:        [{ accion: "reintentar_whatsapp", label: "Enviar WhatsApp" }],
  error_whatsapp:   [{ accion: "reintentar_whatsapp", label: "Reintentar WhatsApp" }],
};

export function TarotOrdenDetalle({ orden, onClose }: { orden: Orden; onClose: () => void }) {
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [errorRelated, setErrorRelated] = useState<string | null>(null);

  const [accionEstado, setAccionEstado] = useState<AccionEstado>("idle");
  const [accionMsg, setAccionMsg] = useState<string | null>(null);

  // Experiencia del cliente: acceso web (token) + imagen de WhatsApp.
  // El token en texto plano NUNCA se persiste server-side (mismo diseño que
  // el resto del proyecto) — solo vive en este estado local, mientras dura
  // la sesión del admin en pantalla. Nunca se renderiza como texto visible.
  const [accesoInfo, setAccesoInfo] = useState<AccesoWeb | null>(null);
  const [tokenActual, setTokenActual] = useState<string | null>(null);
  const [nombreSnapshot, setNombreSnapshot] = useState<string | null>(null);
  const [imagenEstado, setImagenEstado] = useState<ImagenEstado | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [emailEstado, setEmailEstado] = useState<EmailEstado | null>(null);
  const [expAccion, setExpAccion] = useState<"" | "generar_acceso" | "ver_imagen" | "regenerar_imagen" | "preview_email">("");
  const [expError, setExpError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"" | "lectura" | "pdf" | "datos">("");

  useEffect(() => {
    async function fetchRelated() {
      setLoadingRelated(true);
      setErrorRelated(null);
      setTokenActual(null);
      setExpError(null);
      setImagenUrl(null);
      try {
        const [rLect, rPdfs, rPagos, rAcceso] = await Promise.all([
          fetch(`/api/admin/tarot/lecturas?orden_id=${orden.id}&limit=10`),
          fetch(`/api/admin/tarot/pdfs?orden_id=${orden.id}&limit=5`),
          fetch(`/api/admin/tarot/pagos?orden_id=${orden.id}&limit=5`),
          fetch(`/api/admin/tarot/ordenes/${orden.id}/experiencia-cliente`),
        ]);
        const [dLect, dPdfs, dPagos, dAcceso] = await Promise.all([
          rLect.json().catch(() => ({})),
          rPdfs.json().catch(() => ({})),
          rPagos.json().catch(() => ({})),
          rAcceso.json().catch(() => ({})),
        ]);
        setLecturas(dLect.lecturas ?? []);
        setPdfs(dPdfs.pdfs ?? []);
        setPagos(dPagos.pagos ?? []);
        setAccesoInfo(dAcceso.ok ? (dAcceso.acceso ?? null) : null);
        setNombreSnapshot(dAcceso.ok ? (dAcceso.nombre_snapshot ?? null) : null);
        setImagenEstado(dAcceso.ok ? (dAcceso.imagen ?? null) : null);
        setEmailEstado(dAcceso.ok ? (dAcceso.email ?? null) : null);
        // El cabezal, si ya existe, se re-firma automáticamente para mostrar
        // la preview sin un click extra — esto NO regenera nada (solo firma
        // una URL fresca del PNG ya guardado). Si todavía no existe, no se
        // dispara nada acá: el admin decide con el botón "Generar cabezal".
        if (dAcceso.ok && dAcceso.imagen?.existe && dAcceso.imagen?.signedUrl) {
          setImagenUrl(dAcceso.imagen.signedUrl as string);
        }
      } catch (e: unknown) {
        setErrorRelated(e instanceof Error ? e.message : "Error al cargar datos relacionados");
      } finally {
        setLoadingRelated(false);
      }
    }
    fetchRelated();
  }, [orden.id]);

  async function ejecutarExperiencia(accion: "generar_acceso" | "ver_imagen" | "regenerar_imagen") {
    if (accion === "generar_acceso" && accesoInfo) {
      const advertenciaReal = orden.estado === "entregado"
        ? "\n\n⚠️ Esta orden ya tuvo una entrega REAL por WhatsApp. Regenerar invalida el link que recibió el cliente."
        : "";
      const confirmar = window.confirm(
        `Ya existe un acceso web para esta orden. Regenerarlo invalida el link anterior (no se puede recuperar).${advertenciaReal}\n\n¿Continuar?`,
      );
      if (!confirmar) return;
    }
    setExpAccion(accion);
    setExpError(null);
    try {
      const res = await fetch(`/api/admin/tarot/ordenes/${orden.id}/experiencia-cliente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      const data = await res.json();
      if (!data.ok) {
        setExpError(data.motivo ?? "Error al ejecutar la acción");
        return;
      }
      if (accion === "generar_acceso") {
        setTokenActual(data.token as string);
        setAccesoInfo((data.acceso as AccesoWeb | null) ?? null);
      } else {
        setImagenUrl(data.signedUrl as string);
        setImagenEstado({ existe: true, signedUrl: data.signedUrl as string });
      }
    } catch {
      setExpError("Error de red");
    } finally {
      setExpAccion("");
    }
  }

  function abrirLecturaMovil() {
    if (!tokenActual) return;
    window.open(`/lectura/${tokenActual}`, "_blank", "noopener,noreferrer");
  }

  function abrirPdfCliente() {
    if (!tokenActual) return;
    window.open(`/api/lectura/${tokenActual}/pdf`, "_blank", "noopener,noreferrer");
  }

  function urlLecturaCliente(): string {
    return `${window.location.origin}/lectura/${tokenActual}`;
  }

  function urlPdfCliente(): string {
    return `${window.location.origin}/api/lectura/${tokenActual}/pdf`;
  }

  async function copiarLinkCliente(tipo: "lectura" | "pdf") {
    if (!tokenActual) return;
    const url = tipo === "lectura" ? urlLecturaCliente() : urlPdfCliente();
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(tipo);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      setExpError("No se pudo copiar al portapapeles");
    }
  }

  // QA manual: solo lo mínimo para verificar la entrega — nunca teléfono,
  // email, fecha de nacimiento, pregunta ni el token aislado.
  async function copiarDatosEntrega() {
    if (!tokenActual) return;
    const texto = [
      `Nombre: ${nombreSnapshot ?? orden.cliente_nombre ?? "—"}`,
      `Lectura: ${urlLecturaCliente()}`,
      `PDF: ${urlPdfCliente()}`,
      `Vence: ${fmt(accesoInfo?.expira_at)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado("datos");
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      setExpError("No se pudo copiar al portapapeles");
    }
  }

  // Previsualizar el HTML real del email de entrega — nunca envía nada.
  // Si ya generaste el acceso web en esta sesión, el preview usa ese token
  // para mostrar links funcionales; si no, muestra la misma degradación
  // que vería un envío real sin acceso disponible (sin CTA de lectura).
  async function previsualizarEmail() {
    setExpAccion("preview_email");
    setExpError(null);
    try {
      const res = await fetch(`/api/admin/tarot/ordenes/${orden.id}/experiencia-cliente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "preview_email", ...(tokenActual ? { token: tokenActual } : {}) }),
      });
      const data = await res.json();
      if (!data.ok || typeof data.html !== "string") {
        setExpError(data.motivo ?? "Error al generar el preview");
        return;
      }
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setExpError("Error de red");
    } finally {
      setExpAccion("");
    }
  }

  async function ejecutarAccion(accion: "reintentar_lectura" | "reintentar_pdf" | "reintentar_whatsapp") {
    setAccionEstado("enviando");
    setAccionMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/ordenes/${orden.id}/accion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      const data = await res.json();
      if (data.ok) {
        setAccionEstado("ok");
        setAccionMsg(data.mensaje ?? "Acción iniciada");
      } else {
        setAccionEstado("error");
        setAccionMsg(data.detalle ?? data.motivo ?? "Error al ejecutar la acción");
      }
    } catch {
      setAccionEstado("error");
      setAccionMsg("Error de red");
    }
  }

  const estadoOrden = ESTADO_ORDEN[orden.estado] ?? { label: orden.estado, cls: "bg-gray-800 text-gray-400" };
  const lectura = lecturas.find((l) => l.es_vigente) ?? lecturas[0];
  const pdf = pdfs[0];
  const pago = pagos.find((p) => p.mp_status === "approved") ?? pagos[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-center justify-between px-5 py-3 border-b border-gray-700/60">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-white">Orden Tarot</span>
            <Badge text={estadoOrden.label} cls={estadoOrden.cls} />
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Warnings */}
          {orden.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{orden.warnings.join(" · ")}</span>
            </div>
          )}

          {/* Orden */}
          <Sect title="Orden">
            <DataRow label="ID" value={<span className="font-mono text-xs">{orden.id}</span>} />
            <DataRow label="Referencia MP" value={<span className="font-mono text-xs">{orden.external_reference}</span>} />
            <DataRow label="Estado" value={<Badge text={estadoOrden.label} cls={estadoOrden.cls} />} />
            <DataRow label="Tema" value={orden.tema} />
            <DataRow label="Precio" value={`${orden.moneda} ${orden.precio_cobrado}`} />
            <DataRow label="Canal" value={orden.origen_canal} />
            <DataRow label="Creada" value={fmt(orden.created_at)} />
            <DataRow label="Actualizada" value={fmt(orden.updated_at)} />
            {orden.notas_internas && (
              <DataRow label="Notas internas" value={<span className="text-amber-300">{orden.notas_internas}</span>} />
            )}
          </Sect>

          {/* Pregunta */}
          {orden.pregunta_usuario && (
            <Sect title="Pregunta del cliente">
              <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/40 rounded-lg px-3 py-2">
                {orden.pregunta_usuario}
              </p>
            </Sect>
          )}

          {/* Cliente */}
          <Sect title="Cliente">
            <DataRow label="ID cliente" value={<span className="font-mono text-xs">{orden.cliente_id}</span>} />
            <DataRow label="Nombre" value={orden.cliente_nombre || "—"} />
            <DataRow label="Teléfono" value={<span className="font-mono">{orden.cliente_telefono || "—"}</span>} />
            <DataRow label="Email" value={orden.cliente_email || "—"} />
          </Sect>

          {/* Pago */}
          <Sect title="Pago Mercado Pago">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>
            ) : pago ? (
              <>
                <DataRow label="Estado MP" value={
                  <Badge
                    text={(ESTADO_PAGO[pago.mp_status ?? ""] ?? { label: pago.mp_status ?? "—", cls: "bg-gray-800 text-gray-400" }).label}
                    cls={(ESTADO_PAGO[pago.mp_status ?? ""] ?? { label: "", cls: "bg-gray-800 text-gray-400" }).cls}
                  />
                } />
                <DataRow label="Detalle" value={pago.mp_status_detail ?? "—"} />
                <DataRow label="Monto" value={pago.monto != null ? `${pago.moneda} ${pago.monto}` : "—"} />
                <DataRow label="Tipo" value={pago.mp_payment_type ?? "—"} />
                <DataRow label="MP Payment ID" value={<span className="font-mono text-xs">{pago.mp_payment_id ?? "—"}</span>} />
                <DataRow label="Webhook recibido" value={fmt(pago.webhook_received_at)} />
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin pago registrado.</p>
            )}
          </Sect>

          {/* Lectura IA */}
          <Sect title="Lectura IA">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>
            ) : lectura ? (
              <>
                <DataRow label="Estado" value={
                  <Badge
                    text={(ESTADO_LECTURA[lectura.estado] ?? { label: lectura.estado, cls: "bg-gray-800 text-gray-400" }).label}
                    cls={(ESTADO_LECTURA[lectura.estado] ?? { label: "", cls: "bg-gray-800 text-gray-400" }).cls}
                  />
                } />
                <DataRow label="Modelo IA" value={<span className="font-mono text-xs">{lectura.ia_modelo}</span>} />
                <DataRow label="Tokens entrada" value={lectura.ia_tokens_entrada.toLocaleString()} />
                <DataRow label="Tokens salida" value={lectura.ia_tokens_salida.toLocaleString()} />
                <DataRow label="Costo USD" value={<span className="font-mono text-xs">${Number(lectura.ia_costo_usd).toFixed(6)}</span>} />
                <DataRow label="Intento #" value={lectura.numero_intento} />
                <DataRow label="Generada" value={fmt(lectura.generado_at)} />
                {lectura.error_mensaje && (
                  <DataRow label="Error" value={<span className="text-red-300">{lectura.error_mensaje}</span>} />
                )}
                {lectura.resumen_lectura && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Resumen</p>
                    <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/40 rounded-lg px-3 py-2">
                      {lectura.resumen_lectura}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin lectura generada aún.</p>
            )}
          </Sect>

          {/* PDF */}
          <Sect title="PDF">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse">Cargando…</p>
            ) : pdf ? (
              <>
                <DataRow label="Estado" value={
                  <Badge
                    text={(ESTADO_PDF[pdf.estado] ?? { label: pdf.estado, cls: "bg-gray-800 text-gray-400" }).label}
                    cls={(ESTADO_PDF[pdf.estado] ?? { label: "", cls: "bg-gray-800 text-gray-400" }).cls}
                  />
                } />
                <DataRow label="Plantilla" value={<span className="font-mono text-xs">{pdf.plantilla_usada}</span>} />
                <DataRow label="Páginas" value={pdf.paginas ?? "—"} />
                <DataRow label="Tamaño" value={pdf.tamano_bytes ? `${(pdf.tamano_bytes / 1024).toFixed(1)} KB` : "—"} />
                <DataRow label="Intento #" value={pdf.numero_intento} />
                <DataRow label="Generado" value={fmt(pdf.generado_at)} />
                <DataRow label="URL expira" value={fmt(pdf.url_expira_at)} />
                {pdf.error_mensaje && (
                  <DataRow label="Error" value={<span className="text-red-300">{pdf.error_mensaje}</span>} />
                )}
                {pdf.storage_url && (
                  <div className="mt-3">
                    <a
                      href={pdf.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 transition-colors"
                    >
                      <ExternalLink size={13} />
                      Abrir PDF
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Sin PDF generado aún.</p>
            )}
          </Sect>

          {/* Experiencia del cliente — preview real, mismo link/token que recibe el comprador */}
          <Sect title="Experiencia del cliente">
            <p className="text-xs text-gray-500 mb-3">
              Mismo link, token y cabezal que recibirá el comprador por WhatsApp — no una URL de preview alternativa.
            </p>

            {/* Checklist resumido (item 4) */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <ChecklistBadge
                label={lectura?.estado === "completada" ? "Lectura generada" : "Lectura pendiente"}
                tono={lectura?.estado === "completada" ? "ok" : lectura?.estado === "error" ? "error" : "pendiente"}
              />
              <ChecklistBadge
                label={pdf?.estado === "generado" ? "PDF generado" : "PDF pendiente"}
                tono={pdf?.estado === "generado" ? "ok" : pdf?.estado === "error_generacion" ? "error" : "pendiente"}
              />
              <ChecklistBadge
                label={accesoBadge(accesoInfo).label === "Activo" ? "Acceso web activo" : "Acceso web " + accesoBadge(accesoInfo).label.toLowerCase()}
                tono={accesoBadge(accesoInfo).label === "Activo" ? "ok" : accesoInfo ? "error" : "pendiente"}
              />
              <ChecklistBadge
                label={imagenEstado?.existe ? "Cabezal generado" : "Cabezal pendiente"}
                tono={imagenEstado?.existe ? "ok" : "pendiente"}
              />
              {(() => { const wa = whatsappChecklist(orden.estado); return <ChecklistBadge label={wa.label} tono={wa.tono} />; })()}
              {emailEstado?.aplica && (
                <ChecklistBadge
                  label={
                    emailEstado.estado === "enviado" ? "Email enviado"
                    : emailEstado.estado === "error" ? "Email: error del proveedor"
                    : "Email pendiente"
                  }
                  tono={emailEstado.estado === "enviado" ? "ok" : emailEstado.estado === "error" ? "error" : "pendiente"}
                />
              )}
            </div>

            {/* "Así recibirá su tirada" — cabezal + nombre + acceso + accesos directos */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-950/50 p-3 mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">Así recibirá su tirada</p>

              <div className="flex flex-col sm:flex-row gap-3">
                {/* Preview del cabezal — 2:1, responsive, click abre el original */}
                <div className="w-full sm:w-56 shrink-0">
                  {imagenUrl ? (
                    <a href={imagenUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={imagenUrl}
                        alt="Cabezal WhatsApp"
                        className="w-full h-auto aspect-[2/1] object-cover rounded-lg border border-gray-700/60 bg-gray-900 hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ) : (
                    <div className="w-full aspect-[2/1] rounded-lg border border-dashed border-gray-700/60 bg-gray-900/60 flex items-center justify-center px-2">
                      <p className="text-xs text-gray-500 text-center">
                        {imagenEstado?.existe === false ? "Cabezal aún no generado" : "Cargando preview…"}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <button
                      onClick={() => ejecutarExperiencia("ver_imagen")}
                      disabled={expAccion !== ""}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-amber-700/60 bg-amber-900/30 hover:bg-amber-800/40 text-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {expAccion === "ver_imagen" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      {imagenEstado?.existe ? "Actualizar preview" : "Generar cabezal"}
                    </button>
                    {imagenEstado?.existe && (
                      <button
                        onClick={() => ejecutarExperiencia("regenerar_imagen")}
                        disabled={expAccion !== ""}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-amber-700/60 bg-amber-900/30 hover:bg-amber-800/40 text-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {expAccion === "regenerar_imagen" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                        Regenerar
                      </button>
                    )}
                  </div>
                </div>

                {/* Nombre + acceso + accesos directos */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{nombreSnapshot ?? orden.cliente_nombre ?? "—"}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge text={accesoBadge(accesoInfo).label} cls={accesoBadge(accesoInfo).cls} />
                    <span className="text-xs text-gray-500">vence {fmt(accesoInfo?.expira_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <button
                      onClick={abrirLecturaMovil}
                      disabled={!tokenActual}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ExternalLink size={13} /> Abrir lectura
                    </button>
                    <button
                      onClick={abrirPdfCliente}
                      disabled={!tokenActual}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-violet-700 bg-violet-800/40 hover:bg-violet-700/60 text-violet-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ExternalLink size={13} /> Abrir PDF
                    </button>
                  </div>
                  {!tokenActual && (
                    <p className="text-xs text-gray-500 mt-2">
                      Generá el acceso web (abajo) para habilitar estos botones en esta sesión.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Acceso web: detalle + generar/regenerar */}
            <DataRow label="Creado" value={accesoInfo ? fmt(accesoInfo.created_at) : "—"} />
            <DataRow label="Vence" value={accesoInfo ? fmt(accesoInfo.expira_at) : "—"} />
            <DataRow label="Aperturas" value={accesoInfo ? accesoInfo.opened_count : "—"} />
            <DataRow label="Última apertura" value={accesoInfo?.last_opened_at ? fmt(accesoInfo.last_opened_at) : "—"} />

            {orden.estado === "entregado" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300 mt-3">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Esta orden ya tuvo una entrega REAL por WhatsApp. Regenerar el acceso invalida el link que ese cliente ya tiene.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => ejecutarExperiencia("generar_acceso")}
                disabled={expAccion !== ""}
                className={
                  accesoInfo
                    ? "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-700/70 bg-red-900/30 hover:bg-red-800/40 text-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    : "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-sky-700/60 bg-sky-900/30 hover:bg-sky-800/40 text-sky-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                }
              >
                {expAccion === "generar_acceso" ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                {accesoInfo ? "Regenerar acceso web (invalida el anterior)" : "Generar acceso web"}
              </button>
            </div>

            {/* Copiado — QA manual */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => copiarLinkCliente("lectura")}
                disabled={!tokenActual}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-700/60 text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiado === "lectura" ? <Check size={13} /> : <Copy size={13} />} {copiado === "lectura" ? "¡Copiado!" : "Copiar link lectura"}
              </button>
              <button
                onClick={() => copiarLinkCliente("pdf")}
                disabled={!tokenActual}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-700/60 text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiado === "pdf" ? <Check size={13} /> : <Copy size={13} />} {copiado === "pdf" ? "¡Copiado!" : "Copiar link PDF"}
              </button>
              <button
                onClick={copiarDatosEntrega}
                disabled={!tokenActual}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-700/60 text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiado === "datos" ? <Check size={13} /> : <Copy size={13} />} {copiado === "datos" ? "¡Copiado!" : "Copiar datos de entrega"}
              </button>
              <button
                onClick={previsualizarEmail}
                disabled={expAccion !== ""}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-sky-700/60 bg-sky-900/30 hover:bg-sky-800/40 text-sky-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Abre el HTML real del email en una pestaña nueva — nunca envía nada"
              >
                {expAccion === "preview_email" ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                Previsualizar email
              </button>
            </div>
            {!tokenActual && (
              <p className="text-xs text-gray-500 mt-2">
                El preview de email funciona sin acceso generado (misma degradación que un envío real sin token), pero los CTA de lectura/PDF no serán clickeables hasta que generes el acceso.
              </p>
            )}

            {expError && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                <AlertCircle size={14} className="shrink-0" /> {expError}
              </div>
            )}
          </Sect>

          {/* Error si falla la carga de relacionados */}
          {errorRelated && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
              <AlertCircle size={15} className="shrink-0" />
              {errorRelated}
            </div>
          )}

          {/* Acciones admin */}
          {(() => {
            const acciones = ACCIONES_POR_ESTADO[orden.estado];
            const esCritico = orden.estado === "error_critico";
            if (!acciones && !esCritico) return null;
            return (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Acciones</p>

                {acciones && accionEstado !== "ok" && (
                  <div className="flex flex-wrap gap-2">
                    {acciones.map(({ accion, label }) => (
                      <button
                        key={accion}
                        onClick={() => ejecutarAccion(accion)}
                        disabled={accionEstado === "enviando"}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-900/30 hover:bg-amber-800/40 text-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {accionEstado === "enviando" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        {accionEstado === "enviando" ? "Enviando…" : label}
                      </button>
                    ))}
                  </div>
                )}

                {esCritico && accionEstado === "idle" && (
                  <p className="text-xs text-gray-500">
                    Estado de error crítico. Requiere intervención manual en la base de datos para poder reintentar.
                  </p>
                )}

                {accionEstado === "ok" && accionMsg && (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                    <span>
                      {accionMsg}
                      <span className="block text-xs text-emerald-500 mt-0.5">
                        Recargá la lista en unos momentos para ver el estado actualizado.
                      </span>
                    </span>
                  </div>
                )}

                {accionEstado === "error" && accionMsg && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    {accionMsg}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
