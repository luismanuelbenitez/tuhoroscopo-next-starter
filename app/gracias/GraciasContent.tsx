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
import { Loader2 } from 'lucide-react'; // Importar Loader2

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

  // --- Función de Confeti (sin cambios) ---
  function lanzarConfeti() {
    const duration = 8000;
    const end = Date.now() + duration;
    (function frame() {
      confetti({ particleCount: 8, angle: 60, spread: 80, origin: { x: 0 } });
      confetti({ particleCount: 8, angle: 120, spread: 80, origin: { x: 1 } });
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
                    <strong className="text-white/90">¿No llegó nada en 5 minutos?</strong>{" "}
                    Escribinos a{" "}
                    <a
                      href="mailto:soporte@tuhoroscopocosmico.com"
                      className="text-violet-300 underline hover:text-violet-200"
                    >
                      soporte@tuhoroscopocosmico.com
                    </a>.
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
                <ul className="space-y-2">
                  {[
                    "🌐  Horóscopo personalizado por tu signo",
                    "💙  Foco del día según tu preferencia",
                    "🔢  Tu número de la suerte",
                    "🎨  Tu color del día",
                    "🧘  Una pausa cósmica",
                  ].map((item) => (
                    <li key={item} className="text-sm text-white/65 leading-relaxed">{item}</li>
                  ))}
                </ul>
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
                Esto es normal. Mercado Pago puede tardar unos minutos en confirmar la suscripción.
              </p>
              <div
                className="w-full rounded-2xl border border-white/8 p-6"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <p className="text-sm text-white/65 leading-relaxed">
                  Te avisaremos por WhatsApp en cuanto se confirme. No necesitás hacer nada más.
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

