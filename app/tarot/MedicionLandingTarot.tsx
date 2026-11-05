"use client";

import { useEffect } from "react";
import { trackViewItem, trackLandingViewed, medirSecciones } from "@/lib/analytics";
import { metaViewContent } from "@/lib/metaPixel";

// Medición de /tarot (antes dentro de TarotLandingContent, que pasó a ser
// componente de servidor el 2026-11-05). Mismos eventos y mismo orden.
export function MedicionLandingTarot({ precioUYU }: { precioUYU: number | null }) {
  useEffect(() => {
    trackViewItem("tarot", precioUYU ?? undefined);
    trackLandingViewed("tarot");
    metaViewContent(precioUYU ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => medirSecciones(document.body), []);
  return null;
}
