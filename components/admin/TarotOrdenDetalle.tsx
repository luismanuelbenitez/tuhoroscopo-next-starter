"use client";
import { useEffect, useState } from "react";
import { X, ExternalLink, AlertCircle, RotateCcw, CheckCircle2, Loader2, KeyRound, Copy, RefreshCw, Check, Mail, XCircle, Clock, ChevronDown } from "lucide-react";

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
  tipo_orden?: "venta" | "cortesia";
  codigo_cortesia?: string | null;
  // Vienen del listado de órdenes (2026-10-31); opcionales.
  utm_source?: string | null;
  utm_campaign?: string | null;
  recorrido?: {
    pagado_at: string | null;
    lectura_at: string | null;
    pdf_at: string | null;
    whatsapp_at: string | null;
    abierta_at: string | null;
    aperturas: number;
    pdf_clicks: number;
    fallos_ia: number;
    costo_ia_usd: number;
    codigo: string | null;
    interna: boolean;
  } | null;
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

interface AudioEstado {
  estado: string;
  voz: string | null;
  modelo: string | null;
  caracteres: number | null;
  intentos: number;
  generado_at: string | null;
  error: string | null;
  costo_usd_estimado: number | null;
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

const ESTADO_AUDIO: Record<string, { label: string; cls: string }> = {
  no_generado: { label: "No generado", cls: "bg-gray-800 text-gray-400" },
  generando:   { label: "Generando",   cls: "bg-amber-900/50 text-amber-300" },
  listo:       { label: "Generado",    cls: "bg-emerald-900/50 text-emerald-300" },
  error:       { label: "Error",       cls: "bg-red-900/50 text-red-300" },
};

const ESTADO_PDF: Record<string, { label: string; cls: string }> = {
  pendiente:        { label: "Pendiente",      cls: "bg-gray-800 text-gray-400" },
  generando:        { label: "Generando",      cls: "bg-amber-900/50 text-amber-300" },
  listo:            { label: "Generado",       cls: "bg-emerald-900/50 text-emerald-300" },
  generado:         { label: "Generado",       cls: "bg-emerald-900/50 text-emerald-300" },
  error_generacion: { label: "Error",          cls: "bg-red-900/50 text-red-300" },
  invalidado:       { label: "Invalidado",     cls: "bg-gray-800 text-gray-400" },
};

// Checklist visual (rediseño 2026-10-31): un paso por fila con ✓ / ✗ / en curso,
// hora y, si corresponde, un link. Todo sale de datos ya cargados.
type Tono = "ok" | "pendiente" | "error" | "na";

function Paso({ tono, titulo, detalle, link }: {
  tono: Tono; titulo: string; detalle?: React.ReactNode; link?: { href: string; label: string } | null;
}) {
  const icono = tono === "ok" ? <CheckCircle2 size={17} className="text-emerald-400" />
    : tono === "error" ? <XCircle size={17} className="text-red-400" />
    : tono === "pendiente" ? <Clock size={17} className="text-amber-400/80" />
    : <span className="block h-[17px] w-[17px] rounded-full border border-gray-700" />;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
      <span className="shrink-0">{icono}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${tono === "na" ? "text-gray-500" : "text-gray-100"}`}>{titulo}</p>
        {detalle && <p className="text-[11px] text-gray-500 mt-0.5">{detalle}</p>}
      </div>
      {link && (
        <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="shrink-0 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">
          {link.label} <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

function hora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" });
}

function lapso(desde: string | null | undefined, hasta: string | null | undefined): string | null {
  if (!desde || !hasta) return null;
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-xl bg-gray-800/40 px-3 py-2.5">
      <p className="text-base font-semibold text-white leading-tight">{valor}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{etiqueta}</p>
    </div>
  );
}

function Plegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-gray-800 bg-gray-900/60">
      <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 [&::-webkit-details-marker]:hidden" style={{ listStyle: "none" }}>
        {titulo}
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
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
  const [audioEstado, setAudioEstado] = useState<AudioEstado | null>(null);
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
        setAudioEstado(dAcceso.ok ? (dAcceso.audio ?? null) : null);
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

  // Cortesía: "pago_confirmado" no implica pago — se muestra como confirmada.
  const estadoOrden = orden.tipo_orden === "cortesia" && orden.estado === "pago_confirmado"
    ? { label: "Confirmada", cls: "bg-sky-900/50 text-sky-300" }
    : ESTADO_ORDEN[orden.estado] ?? { label: orden.estado, cls: "bg-gray-800 text-gray-400" };
  const lectura = lecturas.find((l) => l.es_vigente) ?? lecturas[0];
  const pdf = pdfs[0];
  const pago = pagos.find((p) => p.mp_status === "approved") ?? pagos[0];
  const r = orden.recorrido ?? null;
  const esCortesia = orden.tipo_orden === "cortesia";
  const entregado = orden.estado === "entregado" || orden.estado === "entregado_simulado";
  const fallosIa = lecturas.filter((l) => l.estado === "error").length;
  const costoIa = lecturas.reduce((a, l) => a + (Number(l.ia_costo_usd) || 0), 0);
  const aperturas = accesoInfo?.opened_count ?? r?.aperturas ?? 0;
  const pdfOk = pdf?.estado === "listo" || pdf?.estado === "generado";
  const src = (orden.utm_source ?? "").toLowerCase();
  const origen = esCortesia ? `Cortesía${orden.codigo_cortesia ? ` · ${orden.codigo_cortesia}` : ""}`
    : (src.includes("facebook") || src.includes("meta") || src.includes("instagram") || src === "fb" || src === "ig")
      ? `Meta Ads${orden.utm_campaign ? ` · ${orden.utm_campaign}` : ""}`
      : src ? `${orden.utm_source}${orden.utm_campaign ? ` · ${orden.utm_campaign}` : ""}` : "Directo";
  const salud = entregado
    ? (aperturas > 0 ? { texto: "Entregada y leída", cls: "bg-emerald-900/50 text-emerald-300" } : { texto: "Entregada, sin abrir", cls: "bg-emerald-900/30 text-emerald-300/80" })
    : orden.estado.startsWith("error") ? { texto: "Necesita atención", cls: "bg-red-900/50 text-red-300" }
    : { texto: estadoOrden.label, cls: estadoOrden.cls };
  const entregaEn = lapso(r?.pagado_at ?? pago?.webhook_received_at ?? null, r?.whatsapp_at ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4">

        {/* Encabezado: quién y cómo está */}
        <div className="sticky top-0 z-10 bg-gray-900 flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-700/60">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-white truncate">{nombreSnapshot ?? orden.cliente_nombre ?? "Orden"}</span>
              <Badge text={salud.texto} cls={salud.cls} />
              {r?.interna && <Badge text="Interna" cls="bg-gray-800 text-gray-400" />}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {esCortesia ? "Cortesía" : "Venta"} · {origen} · {orden.tema ? orden.tema.charAt(0).toUpperCase() + orden.tema.slice(1) : "—"} · {fmt(orden.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Resumen en cifras */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Cifra valor={esCortesia ? "Sin cargo" : `${orden.moneda} ${orden.precio_cobrado}`} etiqueta={esCortesia ? "Cortesía" : "Cobrado"} />
            <Cifra valor={entregaEn ?? "—"} etiqueta="Del pago a la entrega" />
            <Cifra valor={aperturas > 0 ? `${aperturas} ${aperturas === 1 ? "vez" : "veces"}` : "Todavía no"} etiqueta="Abrió la lectura" />
            <Cifra valor={costoIa > 0 ? `US$ ${costoIa.toFixed(3)}` : "—"} etiqueta={fallosIa ? `Costo IA · ${fallosIa} reintento${fallosIa > 1 ? "s" : ""}` : "Costo IA"} />
          </div>

          {/* Checklist de la entrega */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-1">
            {loadingRelated ? (
              <p className="text-sm text-gray-500 animate-pulse py-3">Cargando…</p>
            ) : (
              <>
                <Paso
                  tono={esCortesia ? "ok" : pago?.mp_status === "approved" ? "ok" : pago?.mp_status === "rejected" ? "error" : pago ? "pendiente" : "na"}
                  titulo={esCortesia ? "Cortesía confirmada (sin pago)" : pago?.mp_status === "approved" ? "Pago aprobado en Mercado Pago" : pago?.mp_status === "rejected" ? "Pago rechazado" : pago ? "Pago en proceso" : "Sin pago"}
                  detalle={esCortesia ? (orden.codigo_cortesia ? `Código ${orden.codigo_cortesia}` : null) : pago ? [hora(pago.webhook_received_at), pago.mp_payment_type].filter(Boolean).join(" · ") : null}
                />
                <Paso
                  tono={lectura?.estado === "completada" ? "ok" : lectura?.estado === "error" && !lecturas.some((l) => l.estado === "completada") ? "error" : lectura ? "pendiente" : "na"}
                  titulo={lectura?.estado === "completada" ? "Lectura generada" : lectura?.estado === "error" ? "La lectura falló" : lectura ? "Generando la lectura…" : "Lectura sin generar"}
                  detalle={[lectura?.generado_at ? hora(lectura.generado_at) : null, fallosIa ? `${fallosIa} intento${fallosIa > 1 ? "s" : ""} fallido${fallosIa > 1 ? "s" : ""} antes` : null].filter(Boolean).join(" · ") || null}
                />
                <Paso
                  tono={audioEstado?.estado === "listo" ? "ok" : audioEstado?.estado === "error" ? "error" : audioEstado?.estado === "generando" ? "pendiente" : "na"}
                  titulo={audioEstado?.estado === "listo" ? "Audio del resumen" : audioEstado?.estado === "error" ? "El audio falló" : audioEstado?.estado === "generando" ? "Generando el audio…" : "Audio sin generar"}
                  detalle={audioEstado?.generado_at ? hora(audioEstado.generado_at) : null}
                  link={audioEstado?.signedUrl ? { href: audioEstado.signedUrl, label: "Escuchar" } : null}
                />
                <Paso
                  tono={pdfOk ? "ok" : pdf?.estado === "error_generacion" ? "error" : pdf ? "pendiente" : "na"}
                  titulo={pdfOk ? "PDF generado" : pdf?.estado === "error_generacion" ? "El PDF falló" : pdf ? "Generando el PDF…" : "PDF sin generar"}
                  detalle={pdf?.generado_at ? `${hora(pdf.generado_at)}${pdf.paginas ? ` · ${pdf.paginas} páginas` : ""}` : null}
                  link={pdf?.storage_url ? { href: pdf.storage_url, label: "Abrir PDF" } : null}
                />
                <Paso
                  tono={imagenEstado?.existe ? "ok" : "na"}
                  titulo={imagenEstado?.existe ? "Imagen del WhatsApp" : "Imagen del WhatsApp sin generar"}
                  link={imagenUrl ? { href: imagenUrl, label: "Ver imagen" } : null}
                />
                <Paso
                  tono={entregado ? "ok" : orden.estado === "enviando_whatsapp" ? "pendiente" : orden.estado === "error_whatsapp" ? "error" : "na"}
                  titulo={orden.estado === "entregado_simulado" ? "WhatsApp simulado" : entregado ? "WhatsApp enviado" : orden.estado === "enviando_whatsapp" ? "Enviando WhatsApp…" : orden.estado === "error_whatsapp" ? "El WhatsApp falló" : "WhatsApp sin enviar"}
                  detalle={r?.whatsapp_at ? hora(r.whatsapp_at) : null}
                />
                {emailEstado?.aplica && (
                  <Paso
                    tono={emailEstado.estado === "enviado" ? "ok" : emailEstado.estado === "error" ? "error" : "pendiente"}
                    titulo={emailEstado.estado === "enviado" ? "Email enviado" : emailEstado.estado === "error" ? "El email falló" : "Email pendiente"}
                    detalle={orden.cliente_email || null}
                  />
                )}
                <Paso
                  tono={accesoBadge(accesoInfo).label === "Activo" ? "ok" : accesoInfo ? "error" : "na"}
                  titulo={accesoInfo ? `Acceso a la lectura: ${accesoBadge(accesoInfo).label.toLowerCase()}` : "Acceso a la lectura sin generar"}
                  detalle={accesoInfo ? `vence ${fmt(accesoInfo.expira_at)}` : null}
                />
                <Paso
                  tono={aperturas > 0 ? "ok" : entregado ? "pendiente" : "na"}
                  titulo={aperturas > 0 ? "El cliente abrió su lectura" : "El cliente todavía no abrió su lectura"}
                  detalle={aperturas > 0 ? [`${aperturas} ${aperturas === 1 ? "vez" : "veces"}`, accesoInfo?.last_opened_at ? `última ${fmt(accesoInfo.last_opened_at)}` : null, r?.pdf_clicks ? `bajó el PDF ${r.pdf_clicks > 1 ? `${r.pdf_clicks} veces` : "1 vez"}` : null].filter(Boolean).join(" · ") : null}
                />
              </>
            )}
          </div>

          {/* Pregunta y cliente */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-800/30 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Su pregunta</p>
              <p className="text-sm text-gray-200 leading-snug">{orden.pregunta_usuario?.trim() ? `“${orden.pregunta_usuario.trim()}”` : <span className="text-gray-500">Sin pregunta (lectura general)</span>}</p>
            </div>
            <div className="rounded-xl bg-gray-800/30 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Contacto</p>
              <p className="text-sm text-gray-200 font-mono">{orden.cliente_telefono || "—"}</p>
              <p className="text-xs text-gray-400 mt-0.5 break-all">{orden.cliente_email || "Sin email"}</p>
            </div>
          </div>

          {orden.notas_internas && (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200">
              <span className="text-[11px] uppercase tracking-wider text-amber-400/80 mr-2">Nota</span>{orden.notas_internas}
            </div>
          )}

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

                {/* Error crítico (2026-10-31): ronda nueva de intentos de la IA.
                    El servidor solo la acepta si la orden no tiene lectura y ya
                    hubo intentos (un error crítico del pago o del envío se rechaza). */}
                {esCritico && accionEstado !== "ok" && (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        if (window.confirm("Se inicia una ronda nueva de intentos de la IA para esta orden.\n\nSolo funciona si la orden nunca tuvo una lectura (por ejemplo, fallaron los 3 intentos). Si el error crítico vino del pago o del envío, el sistema lo rechaza.\n\n¿Continuar?")) {
                          ejecutarAccion("reintentar_lectura");
                        }
                      }}
                      disabled={accionEstado === "enviando"}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-900/30 hover:bg-amber-800/40 text-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {accionEstado === "enviando" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      {accionEstado === "enviando" ? "Enviando…" : "Reintentar lectura (nueva ronda)"}
                    </button>
                    <p className="text-xs text-gray-500">
                      Solo para órdenes sin lectura (fallaron los intentos de la IA). Si la orden ya tiene lectura o el error vino del pago, se rechaza.
                    </p>
                  </div>
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

          {/* Herramientas de entrega (plegado): mismo link, token y cabezal que recibe el comprador */}
          <Plegable titulo="Herramientas de entrega">
            <p className="text-xs text-gray-500 mb-3">
              Mismo link, token y cabezal que recibe el comprador — no una URL de preview alternativa.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Cabezal de WhatsApp */}
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
                      {imagenEstado?.existe === false ? "Cabezal aún no generado" : "Sin preview"}
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

              {/* Acceso web y accesos directos */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
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
                    Para abrir o copiar el link hay que generar el acceso en esta sesión (abajo).
                  </p>
                )}
              </div>
            </div>

            {entregado && (
              <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300 mb-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Esta orden ya tuvo una entrega REAL. Regenerar el acceso invalida el link que ese cliente ya tiene.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
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

            {expError && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                <AlertCircle size={14} className="shrink-0" /> {expError}
              </div>
            )}
          </Plegable>

          {/* Datos técnicos (plegado) */}
          <Plegable titulo="Datos técnicos">
            {orden.warnings.length > 0 && (
              <p className="text-xs text-amber-300/90 mb-2">Avisos: {orden.warnings.join(" · ")}</p>
            )}
            <DataRow label="ID de la orden" value={<span className="font-mono text-xs">{orden.id}</span>} />
            <DataRow label="Referencia MP" value={<span className="font-mono text-xs">{orden.external_reference}</span>} />
            <DataRow label="ID cliente" value={<span className="font-mono text-xs">{orden.cliente_id}</span>} />
            <DataRow label="Estado técnico" value={<Badge text={estadoOrden.label} cls={estadoOrden.cls} />} />
            <DataRow label="Canal" value={orden.origen_canal || "—"} />
            <DataRow label="Actualizada" value={fmt(orden.updated_at)} />
            {!esCortesia && pago && (
              <>
                <DataRow label="Pago MP" value={`${(ESTADO_PAGO[pago.mp_status ?? ""]?.label) ?? pago.mp_status ?? "—"}${pago.mp_status_detail ? ` · ${pago.mp_status_detail}` : ""}`} />
                <DataRow label="MP Payment ID" value={<span className="font-mono text-xs">{pago.mp_payment_id ?? "—"}</span>} />
                <DataRow label="Monto MP" value={pago.monto != null ? `${pago.moneda} ${pago.monto}` : "—"} />
              </>
            )}
            {lectura && (
              <>
                <DataRow label="Lectura" value={`${(ESTADO_LECTURA[lectura.estado]?.label) ?? lectura.estado} · intento ${lectura.numero_intento} · ${lectura.ia_modelo}`} />
                <DataRow label="Tokens IA" value={`${lectura.ia_tokens_entrada.toLocaleString()} entrada · ${lectura.ia_tokens_salida.toLocaleString()} salida`} />
                {lectura.error_mensaje && <DataRow label="Error lectura" value={<span className="text-red-300">{lectura.error_mensaje}</span>} />}
              </>
            )}
            {audioEstado && (
              <>
                <DataRow label="Audio" value={`${(ESTADO_AUDIO[audioEstado.estado]?.label) ?? audioEstado.estado}${audioEstado.voz ? ` · voz ${audioEstado.voz}` : ""}${audioEstado.modelo ? ` · ${audioEstado.modelo}` : ""}`} />
                <DataRow label="Costo audio (estim.)" value={audioEstado.costo_usd_estimado != null ? `US$ ${audioEstado.costo_usd_estimado.toFixed(4)}` : "—"} />
                {audioEstado.error && <DataRow label="Error audio" value={<span className="text-red-300">{audioEstado.error}</span>} />}
              </>
            )}
            {pdf && (
              <>
                <DataRow label="PDF" value={`${(ESTADO_PDF[pdf.estado]?.label) ?? pdf.estado} · ${pdf.plantilla_usada}${pdf.tamano_bytes ? ` · ${(pdf.tamano_bytes / 1024).toFixed(0)} KB` : ""}`} />
                {pdf.error_mensaje && <DataRow label="Error PDF" value={<span className="text-red-300">{pdf.error_mensaje}</span>} />}
              </>
            )}
            {accesoInfo && (
              <DataRow label="Acceso web" value={`creado ${fmt(accesoInfo.created_at)} · vence ${fmt(accesoInfo.expira_at)}`} />
            )}
          </Plegable>

        </div>
      </div>
    </div>
  );
}
