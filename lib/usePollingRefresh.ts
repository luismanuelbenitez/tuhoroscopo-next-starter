"use client";
import { useEffect } from "react";

export const ALERTAS_POLL_MS = 30_000;
const EVENTO_CAMBIO = "tarot-alertas:changed";

/**
 * Avisa a todos los consumidores de usePollingRefresh activos en la página
 * (campanita, Centro de Alertas, Dashboard) que refresquen ya, sin esperar
 * el próximo ciclo de 30s. Pensado para usarse justo después de una
 * mutación local exitosa relacionada con alertas (marcar leída / marcar
 * todas), para que el badge y cualquier otra vista queden sincronizados
 * al instante.
 *
 * Es un CustomEvent nativo del browser — no un store global, no Context,
 * no event bus: la forma más simple de que componentes hermanos (sin
 * relación padre/hijo directa, ej. TarotAdminShell y TarotAlertasEventos,
 * que solo se tocan vía `children`) se avisen un cambio sin levantar
 * estado ni introducir dependencias nuevas. El nombre queda ligado a
 * "alertas" porque ese sigue siendo el único disparador de mutación local
 * hoy — no representa un cambio genérico de cualquier dato.
 */
export function notificarAlertasCambiaron() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

/**
 * Poll canónico de refresco para paneles del admin Tarot. Llama a
 * `fetcher` al montar, cada `intervalMs` mientras el componente vive
 * (pausado si la pestaña está oculta), de inmediato al recuperar
 * visibilidad, y de inmediato cuando algún consumidor llama a
 * notificarAlertasCambiaron().
 *
 * Reutilizado por la campanita y el Centro de Alertas (TarotAdminShell,
 * TarotAlertasEventos) y por el Dashboard (`app/admin/tarot/page.tsx`) —
 * un solo mecanismo de polling para todo el admin, sin duplicar la
 * lógica de intervalo/visibilidad/solapamiento en cada consumidor.
 */
export function usePollingRefresh(
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
