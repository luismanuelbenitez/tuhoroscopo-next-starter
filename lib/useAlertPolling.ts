"use client";
import { useEffect } from "react";

export const ALERTAS_POLL_MS = 30_000;

/**
 * Poll canónico para alertas operativas del admin Tarot. Llama a `fetcher`
 * al montar, cada `intervalMs` mientras el componente vive, y de inmediato
 * cuando la pestaña recupera visibilidad (el browser puede throttlear o
 * pausar setInterval en pestañas en background — sin esto, volver a la
 * pestaña podría tardar hasta intervalMs en reflejar novedades).
 *
 * Reutilizado por la campanita (TarotAdminShell) y el Centro de Alertas
 * (TarotAlertasEventos) — misma fuente de verdad (`tarot_alertas_eventos`),
 * un solo mecanismo de polling, sin duplicar la lógica de intervalo.
 */
export function useAlertPolling(fetcher: () => void, intervalMs: number = ALERTAS_POLL_MS) {
  useEffect(() => {
    fetcher();
    const id = setInterval(fetcher, intervalMs);

    function onVisibility() {
      if (document.visibilityState === "visible") fetcher();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetcher, intervalMs]);
}
