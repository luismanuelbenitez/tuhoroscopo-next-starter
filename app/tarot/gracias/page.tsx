export const dynamic = "force-dynamic";

import { Suspense } from "react";
import TarotEstadoContent from "../estado/TarotEstadoContent";
import { numeroWhatsApp } from "@/lib/contacto";

// Fondo, header y pie los pone TarotEstadoContent (PaginaMarca, 2026-10-19).
export default function TarotGraciasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "#0b0818" }} />}>
      <TarotEstadoContent waNumero={numeroWhatsApp()} />
    </Suspense>
  );
}
