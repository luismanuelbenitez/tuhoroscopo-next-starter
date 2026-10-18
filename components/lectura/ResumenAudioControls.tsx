"use client";

import { useEffect, useRef, useState } from "react";

// Narración en audio (TTS OpenAI) del Resumen — feature opcional, ver
// docs/product/DECISIONS.md. Mismo lenguaje visual que AmbientAudioControls
// (components/lectura/AmbientAudio.tsx) pero: sin loop, sin autoplay, y la
// fuente viene por prop (no un archivo estático) porque es única por lectura.
// Si audioUrl es null (tts apagado, todavía generándose, o falló), el
// componente no renderiza nada — nunca un botón roto.
// Piel alineada con /tarot (2026-10-17): CTA principal dorado. Solo estilos.
const TINTA_BOTON = "#180e00";

type Estado = "idle" | "cargando" | "reproduciendo" | "pausado" | "error";

// `variante` solo cambia la piel (rediseño 2026-10-18). Lógica sin cambios.
export function ResumenAudioControls({ audioUrl, variante = "dorado" }: { audioUrl: string | null; variante?: "dorado" | "pergamino" }) {
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
      className={variante === "pergamino"
        ? "relative inline-flex items-center justify-center gap-2 rounded-full min-h-[40px] px-4 text-[13.5px] font-semibold text-[#2a1a12] border border-[rgba(90,60,20,0.55)] bg-[rgba(255,250,235,0.5)] transition-colors hover:bg-[rgba(255,250,235,0.85)] disabled:opacity-60"
        : "relative inline-flex items-center justify-center gap-2.5 rounded-full min-h-[50px] px-7 text-[15.5px] font-bold text-[#180e00] bg-[linear-gradient(135deg,#c8980e_0%,#FFCE4D_60%,#e8bc3a_100%)] shadow-[0_6px_22px_rgba(240,197,90,0.30)] transition hover:brightness-105 disabled:opacity-60"}
    >
      <span style={{ color: variante === "pergamino" ? "#7a5418" : TINTA_BOTON }} aria-hidden="true">
        {reproduciendo ? (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          variante === "pergamino"
            ? <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Z" /><path d="M20 14a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z" /></svg>
            : <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>
        )}
      </span>
      <span>
        {estado === "error"
          ? "Audio no disponible"
          : reproduciendo
            ? "Pausar"
            : variante === "pergamino" ? "Escuchar resumen" : "Escuchar tu resumen"}
      </span>
    </button>
  );
}
