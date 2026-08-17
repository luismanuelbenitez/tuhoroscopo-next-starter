"use client";
import { useEffect } from "react";

export const ALERTAS_POLL_MS = 30_000;
const EVENTO_CAMBIO = "tarot-alertas:changed";

/**
 * Avisa a todos los consumidores de useAlertPolling activos en la página
 * (campanita + Centro de Alertas) que refresquen ya, sin esperar el
 * próximo ciclo de 30s. Pensado para usarse justo después de una mutación
 * local exitosa (marcar leída / marcar todas), para que el badge y la
 * lista queden sincronizados al instante.
 *
 * Es un CustomEvent nativo del browser — no un store global, no Context,
 * no event bus: la forma más simple de que dos componentes hermanos (sin
 * relación padre/hijo directa, ej. TarotAdminShell y TarotAlertasEventos,
 * que solo se tocan vía `children`) se avisen un cambio sin levantar
 * estado ni introducir dependencias nuevas.
 */
export function notificarAlertasCambiaron() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

/**
 * Poll canónico para alertas operativas del admin Tarot. Llama a `fetcher`
 * al montar, cada `intervalMs` mientras el componente vive, de inmediato
 * cuando la pestaña recupera visibilidad (el browser puede throttlear o
 * pausar setInterval en pestañas en background — sin esto, volver a la
 * pestaña podría tardar hasta intervalMs en reflejar novedades), y de
 * inmediato cuando algún consumidor llama a notificarAlertasCambiaron().
 *
 * Reutilizado por la campanita (TarotAdminShell) y el Centro de Alertas
 * (TarotAlertasEventos) — misma fuente de verdad (`tarot_alertas_eventos`),
 * un solo mecanismo de polling, sin duplicar la lógica de intervalo.
 */
export function useAlertPolling(
  fetcher: () => void | Promise<void>,
  intervalMs: number = ALERTAS_POLL_MS,
) {
  useEffect(() => {
    // Guarda contra solapamiento: si visibilitychange, el evento de cambio
    // y el propio interval caen casi juntos, solo el primero dispara un
    // fetch real — los demás lo ignoran en vez de acumular requests.
    let enVuelo = false;
    async function tick() {
      if (enVuelo) return;
      enVuelo = true;
      try {
        await fetcher();
      } finally {
        enVuelo = false;
      }
    }

    // El interval solo corre con la pestaña visible — no tiene sentido
    // seguir pidiendo datos cada 30s mientras nadie mira el badge/lista.
    // Al volver a visible se hace un tick inmediato (misma garantía de
    // frescura de antes) y recién ahí se reinicia el interval.
    let id: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (id === null) id = setInterval(tick, intervalMs);
    }
    function stop() {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    }

    tick();
    if (document.visibilityState === "visible") start();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    }
    function onCambio() {
      tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(EVENTO_CAMBIO, onCambio);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(EVENTO_CAMBIO, onCambio);
    };
  }, [fetcher, intervalMs]);
}
