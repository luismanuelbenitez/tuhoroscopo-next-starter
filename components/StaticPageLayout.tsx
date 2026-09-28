'use client';

import { ReactNode } from 'react';

export default function StaticPageLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before {
          display: none !important;
        }
        details summary { list-style: none; }
        details summary::-webkit-details-marker { display: none; }
      `}</style>
      <div
        className="min-h-screen text-white relative"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >
        {/* Ambiente institucional: misma imagen en las 5 páginas estáticas
            (terciopelo/velas/astrolabio, sin texto ni cartas — es la marca
            Tu Oráculo, no el producto Tarot). Solo detrás del encabezado;
            se apaga con un degradado antes de llegar al cuerpo del texto. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[340px] md:h-[400px]"
          style={{
            backgroundImage: 'url(/img/institucional/ambiente-header.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 35%',
            zIndex: 0,
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[340px] md:h-[400px]"
          style={{
            background: 'linear-gradient(180deg, rgba(10,7,24,0.55) 0%, rgba(10,7,24,0.30) 30%, rgba(13,8,32,0.88) 78%, #0e0b22 100%)',
            zIndex: 0,
          }}
        />
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16 relative z-[1]">
          {children}
        </div>
      </div>
    </>
  );
}
