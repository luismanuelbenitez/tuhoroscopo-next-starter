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
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(88,28,180,0.10), transparent)', zIndex: 0 }}
        />
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16 relative z-[1]">
          {children}
        </div>
      </div>
    </>
  );
}
