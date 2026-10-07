"use client";

// Estilos compartidos entre la home real y la ruta de preview
// (/preview/home-componentes), para que los componentes de components/home/
// se vean igual en ambos lugares sin duplicar reglas.
export function GlobalHomeStyles() {
  return (
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap');

      @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      .fi1 { animation: fadeUp 0.5s ease both; }
      .fi2 { animation: fadeUp 0.5s 0.12s ease both; }
      .fi3 { animation: fadeUp 0.5s 0.24s ease both; }

      @media (prefers-reduced-motion: reduce) {
        .fi1, .fi2, .fi3 { animation: none; }
      }

      .no-scrollbar::-webkit-scrollbar { display: none; }
    `}</style>
  );
}
