"use client";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";
import { PanelDetalle } from "@/components/admin/googleAds/PanelDetalle";

// Google Ads · Página y embudo (2026-11-14): qué hacen en la web las visitas de Google.
export default function GoogleAdsEmbudo() {
  return (
    <MarcoGoogleAds bajada="Qué hacen en la web las visitas de Google: checkout paso a paso, búsquedas, páginas y cada visita.">
      <PanelDetalle seccion="embudo" />
    </MarcoGoogleAds>
  );
}
