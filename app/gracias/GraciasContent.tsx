// ============================================================
// === Archivo: app/gracias/GraciasContent.tsx
// === Descripción: Componente CLIENTE para la página de agradecimiento post-pago.
// ===              Lee el estado del pago desde URL y los datos del usuario
// ===              (incluyendo WhatsApp) desde sessionStorage.
// ============================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { Loader2, Sparkles, Target, Hash, Palette, Wind, Calendar } from 'lucide-react';

// Tipo para los datos guardados en sessionStorage
interface CheckoutData {
  name?: string;
  signo?: string;
  contenidoPreferido?: string;
  whatsapp?: string; // Esperamos el formato 09...
}

// Tipo genérico para parámetros
type AnyDict = Record<string, any>;

// --- Componentes de Íconos (sin cambios) ---
function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="w-16 h-16 text-emerald-400"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-16 h-16 text-amber-400"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-16 h-16 text-rose-500"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}
// --- Fin Componentes de Íconos ---


export default function GraciasContent() {
  // Hook para leer parámetros de la URL
  const sp = useSearchParams();

  // --- Lógica de Parámetros de URL ---
  // Extrae todos los parámetros de la URL en un objeto
  const allParams = useMemo(() => {
    const obj: AnyDict = {};
    try {
      // `sp.entries()` devuelve un iterador, lo convertimos a array y lo recorremos
      for (const [k, v] of Array.from(sp.entries())) {
        // Maneja parámetros repetidos convirtiéndolos en array
        if (obj[k] === undefined) obj[k] = v;
        else obj[k] = Array.isArray(obj[k]) ? [...obj[k], v] : [obj[k], v];
      }
    } catch (_) {
        // Ignora errores si `sp` no es iterable (poco probable)
    }
    return obj;
  }, [sp]); // Se recalcula solo si cambian los searchParams

  // Extrae parámetros específicos necesarios para la lógica
  const id = (allParams.id_suscriptor ?? allParams.id ?? "") as string;
  const preapproval_id = (
    allParams.preapproval_id ?? allParams.preapproval ?? ""
  ) as string;
  const status = (allParams.status ?? allParams.collection_status ?? "") as string;

  // Guarda la URL actual para logging (solo una vez al montar)
  const envSnapshot = useMemo(
    () => ({
      href: typeof window !== "undefined" ? window.location.href : "", // Asegura que solo se ejecute en cliente
    }),
    []
  );

  // --- Estados de UI ---
  // Controla qué bloque de contenido mostrar (cargando, éxito, pendiente, error)
  const [uiStatus, setUiStatus] = useState<"idle" | "ok" | "warn" | "error">(
    "idle" // Comienza en 'idle' para mostrar el loader
  );
  // Almacena los datos del usuario recuperados de sessionStorage
  const [nombre, setNombre] = useState<string | null>(null);
  const [signo, setSigno] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);


  // Objeto con datos para enviar a la API de logs (sin cambios)
  const report: AnyDict = {
    message: "BackURL recibido en /gracias (página de USUARIO)",
    params_crudos: allParams,
    campos: { id_suscriptor: id, preapproval_id, status },
    entorno: envSnapshot,
  };


  // --- useEffect para leer datos de sessionStorage ---
  // Se ejecuta una sola vez al cargar el componente para personalizar el mensaje.
  useEffect(() => {
    // Usamos try/catch por si sessionStorage no está disponible o falla
    try {
      // Intentamos leer el objeto guardado desde CheckoutContent
      const dataString = sessionStorage.getItem('checkoutData');
      if (dataString) {
        // Parseamos el JSON guardado
        const data: CheckoutData = JSON.parse(dataString);
        // Si encontramos nombre, lo guardamos en el estado local
        if (data.name) {
          setNombre(data.name);
        }
        // Si encontramos signo, lo guardamos en el estado local
        if (data.signo) {
          setSigno(data.signo);
        }
        // Leer y guardar WhatsApp
        if (data.whatsapp) {
          setWhatsapp(data.whatsapp); // Guardamos el número local (ej: 099...)
        }
        sessionStorage.removeItem('checkoutData');
      }
    } catch { /* non-blocking */ }
  }, []); // El array vacío asegura ejecución única al montar


  // --- Efecto principal: detecta estado del pago y registra la llegada ---
  useEffect(() => {
    // Log fire-and-forget — evidencia de que el usuario completó el flujo MP
    try {
      fetch("/api/log-backurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "BACKURL_MP_USUARIO", ...report }),
      });
    } catch { /* fire-and-forget */ }

    const statusNorm = String(status || "").toLowerCase().trim();
    const positivos = ["authorized", "approved", "success", "active", ""];

    if (positivos.includes(statusNorm)) {
      setUiStatus("ok");
      lanzarConfeti();
    } else if (statusNorm === "pending" || statusNorm === "in_process") {
      setUiStatus("warn");
    } else {
      setUiStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ejecutar solo una vez al montar

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


  // --- Renderizado de UI ---
  return (
    <>
      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before {
          display: none !important;
        }
      `}</style>

      <div
        className="min-h-screen text-white relative z-[1]"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(88,28,180,0.13), transparent)', zIndex: 0 }}
        />

        <div className="relative mx-auto max-w-xl px-4 py-16 sm:py-24 text-center" style={{ zIndex: 1 }}>

          {/* Estado Idle */}
          {uiStatus === "idle" && (
            <div className="space-y-6 flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
              <h1 className="text-2xl sm:text-3xl font-bold text-white/80">
                Procesando tu pago…
              </h1>
            </div>
          )}

          {/* Camino feliz */}
          {uiStatus === "ok" && (
            <div className="space-y-6 flex flex-col items-center">

              {/* Ícono con glow */}
              <div className="relative flex items-center justify-center">
                <div
                  className="absolute w-28 h-28 rounded-full blur-2xl"
                  style={{ background: 'rgba(52,211,153,0.15)' }}
                />
                <CheckIcon />
              </div>

              {/* Badge */}
              <div className="inline-block px-3 py-1 rounded-full border border-violet-500/25 bg-violet-900/30 text-violet-300 text-xs tracking-widest uppercase -mt-2">
                ✦ Suscripción activa
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-white -mt-2">
                ¡Todo listo{nombre ? `, ${nombre}` : ""}!
              </h1>

              <p className="text-white/70 text-base -mt-2 leading-relaxed">
                Tu guía{signo ? ` de ${signo}` : ""} ya está activa.
                En minutos vas a recibir tu primer mensaje.
              </p>

              {/* Próximos pasos */}
              <div
                className="w-full rounded-2xl border border-white/8 p-6 text-left space-y-5"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <h2 className="text-base font-semibold text-white/90">Próximos pasos</h2>
                <div className="flex items-start gap-3">
                  <div className="font-extrabold text-xl text-violet-400 leading-none w-5 shrink-0 mt-0.5">1.</div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    <strong className="text-white/90">Revisá tu WhatsApp.</strong>{" "}
                    Ya deberías tener nuestro mensaje en el número que registraste
                    {whatsapp ? ` (terminado en …${whatsapp.slice(-3)})` : ""}.
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
                    <strong className="text-white/90">¿No llegó nada en 30 minutos?</strong>{" "}
                    Escribinos a{" "}
                    <a
                      href="mailto:hola@tuoraculo.uy"
                      className="text-violet-300 underline hover:text-violet-200"
                    >
                      hola@tuoraculo.uy
                    </a>{" "}y lo resolvemos de inmediato.
                  </p>
                </div>
              </div>

              {/* Preview del producto */}
              <div
                className="w-full rounded-2xl border border-violet-500/15 p-5 text-left"
                style={{ background: 'rgba(88,28,180,0.07)' }}
              >
                <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
                  Cada mañana vas a recibir
                </p>
                <ul className="space-y-2.5">
                  {[
                    { Icon: Sparkles,  text: 'Horóscopo personalizado por tu signo' },
                    { Icon: Target,    text: 'Foco del día según tu preferencia' },
                    { Icon: Hash,      text: 'Número de la suerte' },
                    { Icon: Palette,   text: 'Color del día' },
                    { Icon: Wind,      text: 'Una pausa' },
                    { Icon: Calendar,  text: 'Los domingos: balance semanal y ritual especial' },
                  ].map(({ Icon, text }) => (
                    <li key={text} className="flex items-center gap-2.5 text-sm text-white/65 leading-relaxed">
                      <Icon size={14} className="shrink-0" style={{ color: 'rgba(167,139,250,0.65)' }} />
                      {text}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 pt-3 border-t border-white/8 text-xs" style={{ color: 'rgba(167,139,250,0.50)' }}>
                  Tu guía llega a las 8:30 · 7 días a la semana
                </p>
              </div>

              {/* Compartir */}
              <button
                onClick={() => {
                  const text = encodeURIComponent('Empecé a recibir mi horóscopo diario por WhatsApp con Tu Oráculo 🔮 tuoraculo.uy');
                  window.open(`https://wa.me/?text=${text}`, '_blank');
                }}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]"
                style={{ background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.22)', color: 'rgba(37,211,102,0.80)' }}
              >
                Compartí con una amiga · WhatsApp
              </button>

              {/* Cross-sell tarot */}
              <div
                className="w-full rounded-2xl border border-amber-500/15 p-5 text-left"
                style={{ background: 'rgba(120,80,0,0.07)' }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(212,175,55,0.65)' }}>
                  ¿Querés más claridad?
                </p>
                <p className="text-white/85 text-sm font-semibold mb-1">Lectura de tarot personalizada</p>
                <p className="text-white/50 text-xs leading-relaxed mb-4">
                  Preguntá sobre amor, trabajo o lo que más te preocupa. Tirada de 5 cartas generada con IA, enviada por WhatsApp en menos de 15 minutos.
                </p>
                <a
                  href="/tarot"
                  className="inline-block rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.28)', color: 'rgba(212,175,55,0.90)' }}
                >
                  Ver lectura de tarot →
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
                Mercado Pago puede tardar unos minutos en confirmar la suscripción. En cuanto se apruebe, tu guía se activa automáticamente.
              </p>
              <div
                className="w-full rounded-2xl border border-white/8 p-6 space-y-4"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <p className="text-sm font-semibold text-white/80">¿Qué hacer mientras tanto?</p>
                <p className="text-sm text-white/60 leading-relaxed">
                  No necesitás hacer nada. En cuanto se confirme el pago, recibís el primer mensaje en WhatsApp.
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

          {/* Error en el pago */}
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
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <p className="text-sm text-white/65 leading-relaxed">
                  El pago pudo ser rechazado o faltaron datos. Podés volver a intentarlo sin problema.
                </p>
                <a
                  href="/checkout"
                  className="inline-block w-full rounded-xl bg-gradient-to-r from-violet-700 to-violet-500 py-4 text-base font-bold text-white text-center transition-all hover:from-violet-600 hover:to-violet-400 active:scale-[0.98]"
                  style={{ boxShadow: '0 4px 24px rgba(109,40,217,0.35)' }}
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

