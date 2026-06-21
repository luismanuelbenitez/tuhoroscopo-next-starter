"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { Loader2, Layers, Eye, Lightbulb, FileText } from "lucide-react";

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-16 h-16 text-emerald-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-amber-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-rose-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

export default function TarotEstadoContent() {
  const sp = useSearchParams();

  const estadoParam       = sp.get("estado") ?? "";
  const externalReference = sp.get("ref") ?? "";
  // MP también inyecta sus propios parámetros al redirigir
  const mpStatus = (sp.get("status") ?? sp.get("collection_status") ?? "").toLowerCase().trim();

  const [uiStatus, setUiStatus] = useState<"idle" | "ok" | "warn" | "error">("idle");
  const [nombre, setNombre]     = useState<string | null>(null);

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
    // Log fire-and-forget — evidencia de que el usuario completó el flujo MP
    try {
      fetch("/api/tarot/log-retorno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_reference: externalReference,
          estado: estadoParam,
          mp_status: mpStatus,
          params: Object.fromEntries(sp.entries()),
        }),
      });
    } catch { /* fire-and-forget */ }

    const exitosos   = ["exitoso"];
    const mpOk       = ["approved", "authorized", "active"];
    const pendientes = ["pendiente"];
    const mpPending  = ["pending", "in_process"];

    if (exitosos.includes(estadoParam) || mpOk.includes(mpStatus)) {
      setUiStatus("ok");
      lanzarConfeti();
    } else if (pendientes.includes(estadoParam) || mpPending.includes(mpStatus)) {
      setUiStatus("warn");
    } else {
      setUiStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function lanzarConfeti() {
    const colors = ['#FFCE4D', '#D4AF37', '#7c3aed', '#a855f7', '#e9d5ff', '#ffffff'];
    const duration = 8000;
    const end = Date.now() + duration;
    (function frame() {
      confetti({ particleCount: 8, angle: 60, spread: 80, origin: { x: 0 }, colors });
      confetti({ particleCount: 8, angle: 120, spread: 80, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  return (
    <>
      <style jsx global>{`
        body { background-image: none !important; background-color: #0e0b22 !important; }
        body::before { display: none !important; }
      `}</style>

      <div
        className="min-h-screen text-white relative z-[1]"
        style={{ background: "linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(88,28,180,0.13), transparent)", zIndex: 0 }}
        />

        <div className="relative mx-auto max-w-xl px-4 py-16 sm:py-24 text-center" style={{ zIndex: 1 }}>

          {/* Cargando */}
          {uiStatus === "idle" && (
            <div className="space-y-6 flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
              <h1 className="text-2xl sm:text-3xl font-bold text-white/80">
                Procesando tu pago…
              </h1>
            </div>
          )}

          {/* Pago exitoso */}
          {uiStatus === "ok" && (
            <div className="space-y-6 flex flex-col items-center">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-28 h-28 rounded-full blur-2xl" style={{ background: "rgba(52,211,153,0.15)" }} />
                <CheckIcon />
              </div>

              <div className="inline-block px-3 py-1 rounded-full border border-violet-500/25 bg-violet-900/30 text-violet-300 text-xs tracking-widest uppercase -mt-2">
                ✦ Pago confirmado
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-white -mt-2">
                ¡{nombre ? `${nombre}, tu` : "Tu"} tirada está en camino!
              </h1>

              <p className="text-white/70 text-base -mt-2 leading-relaxed">
                Estamos preparando tu lectura personalizada. En los próximos minutos la recibirás por WhatsApp en el número que registraste.
              </p>

              <div
                className="w-full rounded-2xl border border-white/8 p-6 text-left space-y-5"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <h2 className="text-base font-semibold text-white/90">Próximos pasos</h2>
                <div className="flex items-start gap-3">
                  <div className="font-extrabold text-xl text-violet-400 leading-none w-5 shrink-0 mt-0.5">1.</div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    <strong className="text-white/90">Revisá tu WhatsApp.</strong>{" "}
                    Vas a recibir tu tirada de tarot completa como PDF en el número que ingresaste al momento de compra.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="font-extrabold text-xl text-violet-400 leading-none w-5 shrink-0 mt-0.5">2.</div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    <strong className="text-white/90">Guardá el número.</strong>{" "}
                    Agreganos a tus contactos para que el mensaje siempre llegue sin problemas.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="font-extrabold text-xl text-violet-400 leading-none w-5 shrink-0 mt-0.5">3.</div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    <strong className="text-white/90">¿No llegó nada en 15 minutos?</strong>{" "}
                    Escribinos a{" "}
                    <a href="mailto:hola@tuoraculo.uy" className="text-violet-300 underline hover:text-violet-200">
                      hola@tuoraculo.uy
                    </a>.
                  </p>
                </div>
              </div>

              <div
                className="w-full rounded-2xl border border-violet-500/15 p-5 text-left"
                style={{ background: "rgba(88,28,180,0.07)" }}
              >
                <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
                  Tu tirada incluye
                </p>
                <ul className="space-y-2.5">
                  {[
                    { Icon: Layers,   text: "5 cartas en cruz con interpretación personalizada" },
                    { Icon: Eye,      text: "Situación actual · Obstáculo · Base inconsciente" },
                    { Icon: Lightbulb,text: "Consejo práctico · Tendencia próxima" },
                    { Icon: FileText, text: "PDF premium enviado por WhatsApp" },
                  ].map(({ Icon, text }) => (
                    <li key={text} className="flex items-start gap-2.5 text-sm text-white/65 leading-relaxed">
                      <Icon size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(167,139,250,0.65)" }} />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Compartir */}
              <button
                onClick={() => {
                  const text = encodeURIComponent('Pedí una lectura de tarot en Tu Oráculo y fue increíble 🔮 tuoraculo.uy/tarot');
                  window.open(`https://wa.me/?text=${text}`, '_blank');
                }}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]"
                style={{ background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.22)', color: 'rgba(37,211,102,0.80)' }}
              >
                Compartí con una amiga · WhatsApp
              </button>

              {/* Cross-sell horóscopo */}
              <div
                className="w-full rounded-2xl border border-violet-500/20 p-5 text-left"
                style={{ background: "rgba(88,28,180,0.08)" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(167,139,250,0.65)" }}>
                  Mientras esperás tu lectura
                </p>
                <p className="text-white/85 text-sm font-semibold mb-1">Horóscopo diario por WhatsApp</p>
                <p className="text-white/50 text-xs leading-relaxed mb-4">
                  Cada mañana tu guía personalizada: horóscopo por signo, foco del día y número de la suerte — directo a tu WhatsApp.
                </p>
                <a
                  href="/horoscopo"
                  className="inline-block rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.32)', color: 'rgba(167,139,250,0.90)' }}
                >
                  Ver planes →
                </a>
              </div>
            </div>
          )}

          {/* Pago pendiente */}
          {uiStatus === "warn" && (
            <div className="space-y-6 flex flex-col items-center">
              <ClockIcon />
              <h1 className="text-3xl sm:text-4xl font-extrabold text-amber-400">
                Tu pago está en proceso.
              </h1>
              <p className="text-white/70 text-base leading-relaxed">
                Mercado Pago puede tardar unos minutos en confirmar el pago. En cuanto se apruebe, comenzamos a preparar tu tirada automáticamente.
              </p>
              <div
                className="w-full rounded-2xl border border-white/8 p-6 space-y-4"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <p className="text-sm font-semibold text-white/80">¿Qué hacer mientras tanto?</p>
                <p className="text-sm text-white/60 leading-relaxed">
                  No necesitás hacer nada. En cuanto Mercado Pago confirme el pago, tu lectura se genera y te llega por WhatsApp en minutos.
                </p>
                <p className="text-sm text-white/45 leading-relaxed">
                  Si en 30 minutos no recibís nada, escribinos a{" "}
                  <a href="mailto:hola@tuoraculo.uy" className="text-violet-300 underline hover:text-violet-200 transition-colors">
                    hola@tuoraculo.uy
                  </a>
                  {" "}y lo resolvemos de inmediato.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {uiStatus === "error" && (
            <div className="space-y-6 flex flex-col items-center">
              <ErrorIcon />
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
                Algo salió mal.
              </h1>
              <p className="text-white/70 text-base leading-relaxed">
                No se realizó ningún cargo en tu tarjeta.
              </p>
              <div
                className="w-full rounded-2xl border border-white/8 p-6 space-y-5"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <p className="text-sm text-white/65 leading-relaxed">
                  El pago pudo ser rechazado o faltaron datos. Podés volver a intentarlo sin problema.
                </p>
                <a
                  href="/tarot/checkout"
                  className="inline-block w-full rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 py-4 text-base font-bold text-white text-center transition-all hover:from-violet-600 hover:to-violet-400 active:scale-[0.98]"
                  style={{ boxShadow: "0 4px 24px rgba(109,40,217,0.35)" }}
                >
                  Intentar de nuevo →
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
