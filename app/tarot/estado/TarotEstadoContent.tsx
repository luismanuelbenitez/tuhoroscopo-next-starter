"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { trackPurchase } from "@/lib/analytics";
import { metaPurchase } from "@/lib/metaPixel";
import confetti from "canvas-confetti";
import { Loader2 } from "lucide-react";
import { PaginaMarca } from "@/components/marca/PaginaMarca";
import { HeaderMarca } from "@/components/marca/HeaderMarca";
import { CTA_GRADIENT, CREMA, SERIF } from "@/components/home/theme";
import { FondoGracias } from "@/components/tarot/gracias/FondoGracias";
import { PieMarca } from "@/components/marca/PieMarca";
import {
  CartasRevelando, ESTILOS_GRACIAS, IconoEstado, LecturaPronta, MientrasTanto, PANEL, Pildora,
  ProgresoLectura, QueVasARecibir, type Paso,
} from "@/components/tarot/gracias/Bloques";

// /tarot/gracias (y /tarot/estado) — rediseño visual 2026-10-19 (aspiracional
// "Lectura confirmada"). La lógica de regreso de Mercado Pago y el gate
// server-side de Purchase (log-retorno) NO cambiaron. Nuevo: el avance real
// de la orden (/api/tarot/estado-orden) en vez de pasos fijos, sin
// redirección automática a /lectura (el link solo viaja en WhatsApp y email:
// decisión 2026-10-19, opción "a").

const APROBADOS = new Set(["pago_confirmado", "generando_lectura", "lectura_lista", "generando_pdf", "pdf_listo", "enviando_whatsapp", "entregado", "entregado_simulado"]);
const ENVIANDO = new Set(["pdf_listo", "enviando_whatsapp"]);
const ENTREGADO = new Set(["entregado", "entregado_simulado"]);
const DEMORADOS = new Set(["error_lectura", "error_pdf", "error_whatsapp", "error_critico"]);
const POLL_MS = 5000;
const POLL_MAX_MS = 20 * 60 * 1000;

function calcularPasos(estado: string | null, esCortesia: boolean, conEmail: boolean): { pasos: Paso[]; pie: string; listo: boolean } {
  const canales = conEmail ? "WhatsApp y email" : "WhatsApp";
  const listo = estado !== null && ENTREGADO.has(estado);
  const demorado = estado !== null && DEMORADOS.has(estado);
  const interpretadas = estado !== null && (ENVIANDO.has(estado) || ENTREGADO.has(estado) || estado === "error_whatsapp");
  const p1: Paso = {
    titulo: "Lectura confirmada",
    texto: esCortesia ? "Tu lectura de cortesía ya está registrada." : "Tu pago fue procesado correctamente.",
    estado: "hecho",
  };
  const p2: Paso = interpretadas
    ? { titulo: "Tus 5 cartas, interpretadas", texto: "Tu lectura personalizada ya está escrita.", estado: "hecho" }
    : demorado
      ? { titulo: "Interpretando tus 5 cartas", texto: "Está tardando un poco más de lo normal. Ya estamos sobre ella.", estado: "demorado" }
      : { titulo: "Interpretando tus 5 cartas", texto: "Estamos preparando tu lectura personalizada…", estado: "activo" };
  const p3: Paso = listo
    ? { titulo: `Enviada por ${canales}`, texto: "Ya la tenés en tu teléfono. ¡Que la disfrutes!", estado: "hecho" }
    : interpretadas
      ? { titulo: `Enviando acceso por ${canales}`, texto: "Te llega en instantes.", estado: estado === "error_whatsapp" ? "demorado" : "activo" }
      : { titulo: `Enviando acceso por ${canales}`, texto: "Te avisamos apenas esté lista.", estado: "pendiente" };
  const pie = listo
    ? `¡Listo! Revisá tu ${canales}.`
    : "Te la enviamos apenas esté lista. Podés quedarte en esta página para ver el avance.";
  return { pasos: [p1, p2, p3], pie, listo };
}

export default function TarotEstadoContent() {
  const sp = useSearchParams();

  const estadoParam       = sp.get("estado") ?? "";
  const externalReference = sp.get("ref") ?? "";
  // MP también inyecta sus propios parámetros al redirigir
  const mpStatus = (sp.get("status") ?? sp.get("collection_status") ?? "").toLowerCase().trim();

  const [uiStatus, setUiStatus] = useState<"idle" | "ok" | "warn" | "error">("idle");
  const [nombre, setNombre]     = useState<string | null>(null);
  // Cortesía (2026-10-18): orden gratuita — no hubo pago, la UI no lo dice.
  const [esCortesia, setEsCortesia] = useState(false);

  // Leer nombre guardado por TarotCheckoutContent antes de redirigir a MP
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tarotCheckoutData");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.nombre) setNombre(data.nombre);
        sessionStorage.removeItem("tarotCheckoutData");
      }
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => {
    // Verifica estado real de la orden en el servidor.
    // El servidor setea analytics_purchase_sent_at atómicamente para evitar doble conteo.
    (async () => {
      try {
        const res = await fetch("/api/tarot/log-retorno", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            external_reference: externalReference,
            estado:             estadoParam,
            mp_status:          mpStatus,
            params:             Object.fromEntries(sp.entries()),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.es_cortesia === true) setEsCortesia(true);
        // Solo reportamos el evento de compra con un valor verificado por el
        // servidor (precio_cobrado de la orden real) — nunca con un precio
        // histórico inventado si el dato no vino en la respuesta.
        if (data.can_fire_purchase && data.transaction_id && typeof data.value === "number") {
          trackPurchase({
            transactionId: data.transaction_id,
            productKey:    "tarot",
            value:         data.value,
            currency:      data.currency ?? "UYU",
          });
          // Mismo gate server-side que GA4 arriba — nunca se dispara por
          // haber llegado a esta URL, solo cuando el servidor ya confirmó
          // que existe una compra válida y no reportada antes.
          metaPurchase({
            eventId:  data.transaction_id,
            value:    data.value,
            currency: data.currency ?? "UYU",
          });
        }
      } catch { /* best-effort, no bloquea la UI */ }
    })();

    const exitosos   = ["exitoso"];
    const mpOk       = ["approved", "authorized", "active"];
    const pendientes = ["pendiente"];
    const mpPending  = ["pending", "in_process"];

    if (exitosos.includes(estadoParam) || mpOk.includes(mpStatus)) {
      setUiStatus("ok");
    } else if (pendientes.includes(estadoParam) || mpPending.includes(mpStatus)) {
      setUiStatus("warn");
    } else {
      setUiStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function lanzarConfeti() {
    const colors = ['#F0C55A', '#FFCE4D', '#D4AF37', '#C9A7FF', '#F5EFE0'];
    // Mobile (2026-10-21): con 16 partículas por cuadro durante 8 s (~7.600)
    // el confeti tapaba el título y los pasos en pantallas chicas. En mobile:
    // 3,5 s, un disparo cada 4 cuadros, 3 por lado, más chicas (~300 en total).
    // Escritorio sin cambios.
    const mobile = window.matchMedia?.('(max-width: 767px)').matches ?? false;
    const duration = mobile ? 3500 : 8000;
    const porLado = mobile ? 3 : 8;
    const cadaCuadros = mobile ? 4 : 1;
    const scalar = mobile ? 0.8 : 1;
    const end = Date.now() + duration;
    let cuadro = 0;
    (function frame() {
      if (cuadro++ % cadaCuadros === 0) {
        confetti({ particleCount: porLado, angle: 60, spread: 80, origin: { x: 0 }, colors, scalar });
        confetti({ particleCount: porLado, angle: 120, spread: 80, origin: { x: 1 }, colors, scalar });
      }
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }


  // ── Avance real de la orden (consulta liviana, sin PII) ───────────────────
  const [estadoOrden, setEstadoOrden] = useState<string | null>(null);
  const [conEmail, setConEmail] = useState(false);
  const confetiLanzado = useRef(false);

  useEffect(() => {
    if (!externalReference) return;
    let cancelado = false;
    const inicio = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function consultar() {
      try {
        const r = await fetch(`/api/tarot/estado-orden?ref=${encodeURIComponent(externalReference)}`, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (!cancelado && d?.ok) {
          setEstadoOrden(d.estado);
          setConEmail(d.email === true);
          if (d.es_cortesia === true) setEsCortesia(true);
          // Pago pendiente que se aprueba mientras la persona espera → pasa a "ok".
          if (APROBADOS.has(d.estado)) setUiStatus((u) => (u === "warn" || u === "idle" ? "ok" : u));
          if (ENTREGADO.has(d.estado)) return; // terminado: no se consulta más
        }
      } catch { /* reintenta en el próximo ciclo */ }
      if (!cancelado && Date.now() - inicio < POLL_MAX_MS) timer = setTimeout(consultar, POLL_MS);
    }
    consultar();
    return () => { cancelado = true; if (timer) clearTimeout(timer); };
  }, [externalReference]);

  useEffect(() => {
    if (uiStatus === "ok" && !confetiLanzado.current) {
      confetiLanzado.current = true;
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) lanzarConfeti();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiStatus]);

  const { pasos, pie, listo } = calcularPasos(estadoOrden, esCortesia, conEmail);

  // Handoff a /lectura (2026-10-20): recién con la lectura entregada se pide
  // el link canónico al servidor (que exige el handoff de este navegador).
  // Una sola consulta por carga; sin link → se queda como estaba.
  const [urlLectura, setUrlLectura] = useState<string | null>(null);
  const linkPedido = useRef(false);
  useEffect(() => {
    if (!listo || !externalReference || linkPedido.current) return;
    linkPedido.current = true;
    (async () => {
      try {
        const r = await fetch("/api/tarot/acceso-lectura", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: externalReference }),
          cache: "no-store",
        });
        const d = await r.json().catch(() => null);
        if (d?.ok && typeof d.url === "string" && d.url.startsWith("/lectura/")) setUrlLectura(d.url);
      } catch { /* sin link: estado actual */ }
    })();
  }, [listo, externalReference]);
  const primerNombre = nombre?.trim().split(/\s+/)[0] ?? "";
  const saludo = primerNombre ? `${primerNombre}, tu` : "Tu";

  return (
    <PaginaMarca fondo={<FondoGracias />}>
      <style dangerouslySetInnerHTML={{ __html: `body > footer { display: none !important; } ${ESTILOS_GRACIAS}` }} />
      <HeaderMarca variante="minimo" />

      <main className="gracias-raiz relative px-4 md:px-6 pt-8 md:pt-10 text-center">
        {uiStatus === "idle" && (
          <div className="py-24 flex flex-col items-center gap-4 text-white/70">
            <Loader2 size={34} className="animate-spin" style={{ color: "#F0C55A" }} aria-hidden="true" />
            <p>Confirmando tu lectura…</p>
          </div>
        )}

        {uiStatus === "ok" && (
          <>
            <IconoEstado tipo="ok" />
            <div className="mt-5"><Pildora>Lectura confirmada</Pildora></div>
            <h1 className="gracias-hero mt-4 px-2" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(30px, 6vw, 46px)", lineHeight: 1.1, color: CREMA }}>
              {listo ? `¡${saludo} lectura ya llegó!` : `¡${saludo} lectura está en camino!`}
            </h1>
            <p className="gracias-hero mt-3 mx-auto max-w-[620px] text-[16px] md:text-[18px] text-white/80 leading-relaxed" style={{ fontFamily: SERIF }}>
              {listo && urlLectura
                ? "Tu lectura ya está pronta. Podés explorarla ahora o abrirla desde el mensaje que te enviamos."
                : listo
                ? "Ya te la enviamos. Abrila desde el mensaje que te llegó y descubrí lo que tus cartas tienen para vos."
                : "Tu lectura ya se está preparando. En cuanto esté pronta te llega directo. Podés quedarte en esta página para ver el avance."}
            </p>
            <div className="mt-7"><ProgresoLectura pasos={pasos} pie={pie} final={listo && urlLectura ? <LecturaPronta url={urlLectura} /> : undefined} /></div>
            <CartasRevelando texto={listo ? "Tus cartas ya se revelaron" : "Las cartas se están revelando…"} />
          </>
        )}

        {uiStatus === "warn" && (
          <>
            <IconoEstado tipo="espera" />
            <div className="mt-5"><Pildora>Pago en proceso</Pildora></div>
            <h1 className="gracias-hero mt-4" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(30px, 6vw, 44px)", lineHeight: 1.1, color: CREMA }}>
              Tu pago está en proceso
            </h1>
            <p className="gracias-hero mt-3 mx-auto max-w-[600px] text-[16px] md:text-[18px] text-white/80 leading-relaxed" style={{ fontFamily: SERIF }}>
              Mercado Pago puede tardar unos minutos en confirmarlo. En cuanto se apruebe, empezamos a preparar tu lectura automáticamente: no necesitás hacer nada.
            </p>
            <div className="mt-7">
              <ProgresoLectura
                pasos={[
                  { titulo: "Esperando la confirmación del pago", texto: "Esta página se actualiza sola cuando se apruebe.", estado: "activo" },
                  { titulo: "Interpretando tus 5 cartas", texto: "Empieza apenas se confirme el pago.", estado: "pendiente" },
                  { titulo: "Enviando acceso por WhatsApp", texto: "Te avisamos apenas esté lista.", estado: "pendiente" },
                ]}
                pie="Si en 30 minutos no recibís nada, escribinos a hola@tuoraculo.uy."
              />
            </div>
          </>
        )}

        {uiStatus === "error" && (
          <section className="mx-auto max-w-[580px] pb-48 md:pb-72">
            <IconoEstado tipo="error" />
            <h1 className="mt-6" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(30px, 6vw, 42px)", lineHeight: 1.1, color: CREMA }}>
              No pudimos confirmar tu pago
            </h1>
            <p className="mt-3 text-[16px] md:text-[18px] text-white/80 leading-relaxed" style={{ fontFamily: SERIF }}>
              El pago pudo ser rechazado o quedar incompleto: podés volver a intentarlo sin problema. Si ves un cargo en Mercado Pago, escribinos y lo resolvemos.
            </p>
            <div className="mt-7 rounded-2xl px-6 py-6" style={PANEL}>
              <Link
                href="/tarot/checkout"
                className="block w-full rounded-xl py-4 text-[17px] font-bold transition-all hover:brightness-105 active:scale-[0.98]"
                style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 6px 24px rgba(240,197,90,0.30)" }}
              >
                Intentar de nuevo →
              </Link>
              <p className="mt-3 text-[13px] text-white/55">¿Necesitás ayuda? Escribinos a <a href="mailto:hola@tuoraculo.uy" className="underline" style={{ color: "#C9A7FF" }}>hola@tuoraculo.uy</a></p>
            </div>
          </section>
        )}

        {(uiStatus === "ok" || uiStatus === "warn") && (
          <div className="mt-10 mx-auto max-w-[960px] grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
            <QueVasARecibir />
            <MientrasTanto />
          </div>
        )}
      </main>

      <PieMarca className="mt-12" />
    </PaginaMarca>
  );
}
