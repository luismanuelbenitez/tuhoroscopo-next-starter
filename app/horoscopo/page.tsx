export const dynamic = "force-dynamic";

import { Suspense } from "react";
import HomeContent from "../HomeContent";

export default function HoroscopoPage() {
  return (
    <Suspense fallback={<div className="text-center text-white py-16">Cargando...</div>}>
      <HomeContent />
    </Suspense>
  );
}
