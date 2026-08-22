'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { metaPageView } from '@/lib/metaPixel';

/**
 * Meta Pixel (browser) — V1 discovery comercial, ver docs/product/DECISIONS.md
 * 2026-08-22. Solo se monta si NEXT_PUBLIC_META_PIXEL_ID está configurada
 * (chequeado por el caller en app/layout.tsx) — si no está, este componente
 * ni se renderiza y la app funciona exactamente igual sin tracking de Meta.
 *
 * Snippet oficial mínimo de Meta (sin SDK pesado). Sin Advanced Matching —
 * decisión explícita, no se pasan datos de identidad (email/teléfono) al
 * init del Pixel.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  const esPrimerRender = useRef(true);

  // PageView en cada cambio de ruta (navegación client-side dentro de la
  // app). El PageView de la carga inicial ya lo dispara el snippet de init
  // de abajo — evitamos dispararlo dos veces en el primer render.
  useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false;
      return;
    }
    metaPageView();
  }, [pathname]);

  return (
    <>
      <Script
        id="meta-pixel-base"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
