"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// Medición mínima de las páginas SEO (2026-10-20), con el trackEvent
// existente (no se toca lib/analytics): una vista por página y un evento por
// clic en cualquier CTA marcado con data-seo-cta. No dispara view_item /
// landing_viewed de "tarot" para no mezclar estas páginas con la landing.
export function SeoTracking({ pagina }: { pagina: string }) {
  useEffect(() => {
    trackEvent("seo_landing_viewed", { pagina });
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-seo-cta]");
      if (!a) return;
      trackEvent("seo_cta_click", { pagina, ubicacion: a.dataset.seoCta, tema: a.dataset.tema || "ninguno" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pagina]);
  return null;
}
