"use client";

import { useEffect, useRef, useState } from "react";

// Audio ambiental OPCIONAL para /lectura/[token] — ver sprint "experiencia
// inmersiva de lectura" (2026-09-06). Reglas clave:
//   - NUNCA autoplay: solo arranca por click explícito del usuario.
//   - Fade-in de ~2.5s a volumen bajo al reproducir; pausa limpia sin fade.
//   - Sin controles nativos, sin timeline/duración/nombre de archivo.
//   - Si el archivo no existe o falla la carga, la lectura sigue funcionando
//     igual — el botón pasa a un estado de error discreto, nunca rompe nada.
// Asset esperado: /public/audio/tarot-ambiente.mp3 (ver "ASSETS QUE MANUEL
// DEBE SUBIR" en el reporte del sprint para la ruta y specs exactas).
const AUDIO_SRC = "/audio/tarot-ambiente.mp3";
const VOLUMEN_OBJETIVO = 0.35;
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
      const progreso = Math.min(1, (now - t0) / FADE_IN_MS);
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
      <div ref={heroBtnRef} className="inline-block">
        <button
          type="button"
          onClick={toggle}
          disabled={estado === "cargando"}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-[12px] tracking-wide text-[#c9c4d6] transition-colors hover:bg-white/10 hover:border-white/25 disabled:opacity-60"
        >
          <span style={{ color: GOLD }}>{reproduciendo ? "❚❚" : "♪"}</span>
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
          aria-label={estado === "reproduciendo" ? "Pausar ambiente" : "Reanudar ambiente"}
          className="fixed bottom-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#150c2e]/90 text-base shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur transition-colors hover:bg-[#1c1140]"
          style={{ color: GOLD }}
        >
          {estado === "reproduciendo" ? "❚❚" : "♪"}
        </button>
      )}
    </>
  );
}
