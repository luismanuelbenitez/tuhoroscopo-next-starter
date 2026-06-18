export const dynamic = "force-dynamic";

import { Suspense } from "react";
import GraciasContent from "../../gracias/GraciasContent";

export default function HoroscopoGraciasPage() {
  return (
    <div
      className="w-full min-h-screen"
      style={{
        backgroundImage: "url('/bg-stars.svg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Suspense fallback={<div className="text-center text-white py-16 text-lg">Cargando...</div>}>
        <GraciasContent />
      </Suspense>
    </div>
  );
}
