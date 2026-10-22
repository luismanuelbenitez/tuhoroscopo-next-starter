'use client';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { esTraficoInterno, sanitizarPath } from '@/lib/analytics';

// Vercel Web Analytics + Speed Insights (2026-10-22). Tráfico agregado y
// experiencia real se consultan en el panel de Vercel; no se replican en
// Supabase. Scripts diferidos y livianos (no bloquean la carga).
//
// beforeSend: fuera el admin y nuestras pruebas (cookie tuo_interno); las
// rutas con tokens privados (/lectura/<token>, …) salen enmascaradas.
// Requiere habilitar Web Analytics y Speed Insights en el proyecto de Vercel;
// mientras no estén habilitados no recolectan nada.
function filtrar<T extends { url: string }>(evento: T): T | null {
  try {
    if (esTraficoInterno()) return null;
    const u = new URL(evento.url);
    if (u.pathname.startsWith('/admin')) return null;
    u.pathname = sanitizarPath(u.pathname);
    return { ...evento, url: u.toString() };
  } catch {
    return evento;
  }
}

export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={(e: BeforeSendEvent) => filtrar(e)} />
      {/* Nivel gratuito: 10.000 mediciones / 30 días. Muestreo 25 % para no
          pausarse con el tráfico de campañas; ajustable. */}
      <SpeedInsights sampleRate={0.25} beforeSend={(e) => filtrar(e)} />
    </>
  );
}
