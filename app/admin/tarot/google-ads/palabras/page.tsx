"use client";
import { MarcoGoogleAds } from "@/components/admin/googleAds/gobernanza/Marco";
import { PanelDetalle } from "@/components/admin/googleAds/PanelDetalle";

// Google Ads · Palabras y búsquedas (2026-11-14): la cuenta tal como la lee la API.
export default function GoogleAdsPalabras() {
  return (
    <MarcoGoogleAds bajada="Gasto, palabras clave y lo que buscó la gente, según Google.">
      <PanelDetalle seccion="palabras" />
    </MarcoGoogleAds>
  );
}
