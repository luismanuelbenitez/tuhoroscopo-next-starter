"use client";

import { useEffect, useRef, useState } from "react";

// Audio ambiental OPCIONAL para /lectura/[token] — ver sprint "experiencia
// inmersiva de lectura" (2026-09-06). Reglas clave:
//   - Intenta autoplay al entrar; la mayoría de navegadores mobile (Safari
//     iOS en particular) lo bloquean sin gesto previo del usuario — en ese
//     caso se degrada en silencio al flujo manual (botón "Ambientar mi
//     lectura"), nunca se muestra como error.
//   - Fade-in de ~2.5s a volumen bajo al reproducir; pausa limpia sin fade.
//   - Sin controles nativos, sin timeline/duración/nombre de archivo.
//   - Si el archivo no existe o falla la carga, la lectura sigue funcionando
//     igual — el botón pasa a un estado de error discreto, nunca rompe nada.
// Asset esperado: /public/audio/tarot-ambiente.mp3 (ver "ASSETS QUE MANUEL
// DEBE SUBIR" en el reporte del sprint para la ruta y specs exactas).
const AUDIO_SRC = "/audio/tarot-ambiente.mp3";
const VOLUMEN_OBJETIVO = 0.25;
const FADE_IN_MS = 2600;
const GOLD = "#FFCE4D";

type Estado = "idle" | "cargando" | "reproduciendo" | "pausado" | "error";

// Único componente: un solo <audio> interno controla tanto el botón del
// hero como el botón flotante — nunca dos reproductores independientes.
export function AmbientAudioControls() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const heroBtnRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [heroFueraDeVista, setHeroFueraDeVista] = useState(false);

  useEffect(() => {
    return () => {
      if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
      audioRef.current?.pause();
    };
  }, []);

  // Intento silencioso de autoplay al entrar. Si el navegador lo bloquea
  // (lo más común en mobile sin gesto previo), no se muestra ningún error:
  // el botón queda en "idle" listo para el click manual, como si el
  // intento nunca hubiera pasado.
  useEffect(() => {
    let cancelado = false;
    async function intentarAutoplay() {
      try {
        const audio = new Audio(AUDIO_SRC);
        audio.loop = true;
        audio.preload = "none";
        await audio.play();
        if (cancelado) { audio.pause(); return; }
        audioRef.current = audio;
        fadeIn(audio);
        setEstado("reproduciendo");
      } catch {
        // Bloqueado por política de autoplay o archivo no disponible —
        // se degrada en silencio, sin tocar audioRef ni el estado.
      }
    }
    intentarAutoplay();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = heroBtnRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([entry]) => setHeroFueraDeVista(!entry.isIntersecting), {
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function fadeIn(audio: HTMLAudioElement) {
    const t0 = performance.now();
    audio.volume = 0;
    function paso(now: number) {
      const progreso = Math.min(1, Math.max(0, (now - t0) / FADE_IN_MS));
      audio.volume = progreso * VOLUMEN_OBJETIVO;
      if (progreso < 1) {
        fadeRef.current = requestAnimationFrame(paso);
      } else {
        fadeRef.current = null;
      }
    }
    fadeRef.current = requestAnimationFrame(paso);
  }

  async function reproducir() {
    if (estado === "cargando") return; // evita doble click mientras arranca
    setEstado("cargando");
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(AUDIO_SRC);
        audioRef.current.loop = true;
        audioRef.current.preload = "none";
      }
      const audio = audioRef.current;
      await audio.play();
      fadeIn(audio);
      setEstado("reproduciendo");
    } catch {
      // Archivo inexistente, error de red, o el navegador bloqueando el
      // intento por alguna razón — nunca rompe la lectura, solo el botón
      // vuelve a un estado discreto de "no disponible".
      setEstado("error");
    }
  }

  function pausar() {
    if (fadeRef.current) { cancelAnimationFrame(fadeRef.current); fadeRef.current = null; }
    audioRef.current?.pause();
    setEstado("pausado");
  }

  function toggle() {
    if (estado === "reproduciendo") pausar();
    else reproducir();
  }

  const reproduciendo = estado === "reproduciendo" || estado === "cargando";
  const yaActivado = estado === "reproduciendo" || estado === "pausado" || estado === "cargando";

  return (
    <>
      <div ref={heroBtnRef} className="relative inline-block">
        {/* Aro suave que llama la atención hasta que el cliente activa el ambiente (se apaga con "reducir movimiento") */}
        {!yaActivado && estado !== "error" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border border-[rgba(240,197,90,0.55)] animate-ping motion-reduce:hidden"
            style={{ animationDuration: "2.6s" }}
          />
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={estado === "cargando"}
          className="relative inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-[rgba(240,197,90,0.75)] bg-[#241751]/90 px-7 py-3.5 text-[15px] font-semibold tracking-wide text-[#F3E7C4] shadow-[0_6px_22px_rgba(0,0,0,0.45),0_0_18px_rgba(240,197,90,0.18)] backdrop-blur transition-colors hover:bg-[#2e1d63] hover:border-[rgba(240,197,90,0.95)] disabled:opacity-60"
        >
          <span style={{ color: GOLD }} aria-hidden="true">
            {reproduciendo ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
            )}
          </span>
          <span>
            {estado === "error"
              ? "Ambiente no disponible"
              : reproduciendo
                ? "Pausar ambiente"
                : "Ambientar mi lectura"}
          </span>
        </button>
      </div>

      {yaActivado && heroFueraDeVista && (
        <button
          type="button"
          onClick={toggle}
          aria-label={estado === "reproduciendo" ? "Silenciar ambiente" : "Activar ambiente"}
          className="fixed bottom-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(255,206,77,0.45)] bg-[#150c2e]/90 text-base shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition-colors hover:bg-[#1c1140] hover:border-[rgba(255,206,77,0.65)]"
          style={{ color: GOLD }}
        >
          {estado === "reproduciendo" ? "❚❚" : "♪"}
        </button>
      )}
    </>
  );
}
