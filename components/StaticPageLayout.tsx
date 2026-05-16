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
        header {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
      `}</style>
      <div
        className="min-h-screen text-white"
        style={{ background: 'linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)' }}
      >
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16 relative z-[1]">
          {children}
        </div>
      </div>
    </>
  );
}
