"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Bloques que en el celular se ocultaban con CSS (hidden md:…) pero igual
// se armaban: el teléfono procesaba ~240 elementos y ~90 KB que no mostraba
// (Lighthouse móvil 2026-11-05, objetivo LCP 2,5 s). Ahora se arman solo si
// la pantalla es de escritorio, después de cargar. Cambiar el ancho de la
// ventana los muestra u oculta igual que antes.
export function useEsEscritorio() {
  const [es, setEs] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const actualizar = () => setEs(m.matches);
    actualizar();
    m.addEventListener("change", actualizar);
    return () => m.removeEventListener("change", actualizar);
  }, []);
  return es;
}

// "Así vivís la experiencia": en el celular repite lo que ya muestra el
// bloque 2 (auditoría 2026-11-04). Su código tampoco se descarga en el celular.
const AsiSeViveTarot = dynamic(() => import("@/components/tarot/AsiSeViveTarot").then((m) => m.AsiSeViveTarot), { ssr: false });

export function AsiSeViveSoloEscritorio() {
  return useEsEscritorio() ? <AsiSeViveTarot /> : null;
}
