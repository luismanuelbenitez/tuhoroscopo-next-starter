'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { storeAttributionFromUrl, trackPageView, aplicarMarcaInternaDesdeUrl } from '@/lib/analytics';

// Una vista por cambio de ruta (incluida la navegación sin recarga del App
// Router). Nada visible ni bloqueante: el evento va a una cola que se envía
// en segundo plano (ver lib/analytics.ts). Sin useSearchParams a propósito:
// obligaría a renderizar el layout en el cliente (perjudica SEO); la query se
// lee de window.location dentro del efecto.
export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    aplicarMarcaInternaDesdeUrl();
    storeAttributionFromUrl();
  }, []);

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
