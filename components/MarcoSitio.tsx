'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { GoogleAdsTag, GoogleAnalyticsTag } from '@/components/GoogleAdsTag';
import { MetaPixel } from '@/components/MetaPixel';

// Header/footer y etiquetas de terceros según la ruta (2026-11-09).
//
// Antes lo decidía app/layout.tsx leyendo headers() que ponía el middleware
// (x-is-admin, x-hide-chrome). Leer headers() en el layout raíz volvía
// dinámico TODO el sitio: /tarot se armaba en cada visita en iad1 (TTFB
// 1–1,6 s) y Google Ads le ponía "experiencia en la página de destino por
// debajo del promedio". Con usePathname la decisión es la misma, pero las
// páginas de marketing quedan pregeneradas y se entregan desde el CDN.

const esAdmin = (p: string) => p.startsWith('/admin');

// /lectura/[token]: experiencia standalone (llega por WhatsApp/email).
// /tarot/ejemplo (2026-11-03): la misma vista con la lectura de ejemplo.
const sinMarco = (p: string) => esAdmin(p) || p.startsWith('/lectura/') || p === '/tarot/ejemplo';

export function MarcoSitio({ children }: { children: React.ReactNode }) {
  const p = usePathname() ?? '';
  const ocultar = sinMarco(p);
  return (
    <>
      {!ocultar && <Header />}
      <main className="flex-1">{children}</main>
      {!ocultar && <Footer />}
    </>
  );
}

// Admin (2026-11-04): sin Google Analytics, Google Ads ni píxel de Meta: las
// visitas al panel inflaban GA (tiempo, páginas) y las audiencias de Meta.
export function TercerosSitio({ gaId, metaPixelId }: { gaId?: string; metaPixelId?: string }) {
  const p = usePathname() ?? '';
  if (esAdmin(p)) return null;
  return (
    <>
      {gaId && <GoogleAnalyticsTag gaId={gaId} />}
      <GoogleAdsTag />
      {metaPixelId && <MetaPixel pixelId={metaPixelId} />}
    </>
  );
}
