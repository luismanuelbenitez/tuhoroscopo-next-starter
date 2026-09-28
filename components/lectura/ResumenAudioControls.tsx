"use client";

import { useEffect, useRef, useState } from "react";

// Narración en audio (TTS OpenAI) del Resumen — feature opcional, ver
// docs/product/DECISIONS.md. Mismo lenguaje visual que AmbientAudioControls
// (components/lectura/AmbientAudio.tsx) pero: sin loop, sin autoplay, y la
// fuente viene por prop (no un archivo estático) porque es única por lectura.
// Si audioUrl es null (tts apagado, todavía generándose, o falló), el
// componente no renderiza nada — nunca un botón roto.
const GOLD = "#FFCE4D";

type Estado = "idle" | "cargando" | "reproduciendo" | "pausado" | "error";

export function ResumenAudioControls({ audioUrl }: { audioUrl: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [estado, setEstado] = useState<Estado>("idle");

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  async function reproducir() {
    if (!audioUrl || estado === "cargando") return;
    setEstado("cargando");
    try {
      if (!audioRef.current) {
        const audio = new Audio(audioUrl);
        audio.preload = "none";
        audio.onended = () => setEstado("idle");
        audioRef.current = audio;
      }
      await audioRef.current.play();
      setEstado("reproduciendo");
    } catch {
      setEstado("error");
    }
  }

  function pausar() {
    audioRef.current?.pause();
    setEstado("pausado");
  }

  function toggle() {
    if (estado === "reproduciendo") pausar();
    else reproducir();
  }

  if (!audioUrl) return null;

  const reproduciendo = estado === "reproduciendo" || estado === "cargando";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={estado === "cargando"}
      className="relative inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-[rgba(240,197,90,0.75)] bg-[#241751]/90 px-6 py-3 text-[14px] font-semibold tracking-wide text-[#F3E7C4] shadow-[0_6px_22px_rgba(0,0,0,0.35),0_0_16px_rgba(240,197,90,0.16)] backdrop-blur transition-colors hover:bg-[#2e1d63] hover:border-[rgba(240,197,90,0.95)] disabled:opacity-60"
    >
      <span style={{ color: GOLD }} aria-hidden="true">
        {reproduciendo ? (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>
        )}
      </span>
      <span>
        {estado === "error"
          ? "Audio no disponible"
          : reproduciendo
            ? "Pausar"
            : "Escuchar tu resumen"}
      </span>
    </button>
  );
}
