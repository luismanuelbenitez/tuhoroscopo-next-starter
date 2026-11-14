"use client";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";
import { PanelDetalle } from "@/components/admin/googleAds/PanelDetalle";

// Google Ads · Ranking y calidad (2026-11-14): nota por palabra, subasta y cómo califica Google la página.
export default function GoogleAdsRanking() {
  return (
    <MarcoGoogleAds bajada="Lo que Google informa de forma oficial: nota de calidad, subasta, anuncios y página de destino.">
      <PanelDetalle seccion="ranking" />
    </MarcoGoogleAds>
  );
}
