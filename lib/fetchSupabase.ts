// fetch para el cliente de Supabase de lectura en Server Components.
//
// Sin opciones: cache "no-store" (lo de siempre). Lo usan el checkout, la API
// del precio y todo lo que cobra: el precio siempre fresco.
//
// Con revalidar (segundos): se cachea ese tiempo. Lo usan solo las páginas de
// marketing (/, /tarot, las de temas, faq...), así quedan pregeneradas y Vercel
// las entrega ya armadas desde São Paulo. 2026-11-09, auditoría de Nivel de
// Calidad de Google Ads: /tarot se armaba en cada visita en iad1 (TTFB 1–1,6 s)
// y la "experiencia en la página de destino" salía por debajo del promedio.
export function fetchSupabase(revalidar?: number): typeof fetch {
  if (!revalidar) return (input, init) => fetch(input, { ...init, cache: "no-store" });
  return (input, init) => {
    const { cache: _sinCache, ...resto } = init ?? {};
    return fetch(input, { ...resto, next: { revalidate: revalidar } });
  };
}

/** Segundos que las páginas de marketing pueden mostrar precio y testimonios sin releer la base. */
export const REVALIDAR_MARKETING = 60;
