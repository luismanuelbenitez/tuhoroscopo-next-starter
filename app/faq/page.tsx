import { ChevronDown, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { PaginaInstitucional, EncabezadoInstitucional, PANEL_INSTITUCIONAL as PANEL } from '@/components/marca/PaginaInstitucional';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';
import { metadataPagina } from '@/lib/seo/metadataPagina';
import { htmlJsonLd } from '@/lib/seo/jsonLd';

// Metadata propia (Paquete SEO 1, 2026-10-21): título, descripción, canonical y OG.
export const metadata = metadataPagina(
  '/faq',
  'Preguntas frecuentes sobre el Tarot online | Tu Oráculo',
  'Cómo funciona el Tarot online de Tu Oráculo: qué recibís, cuánto tarda, cómo se paga, privacidad, uso de inteligencia artificial y qué hacer si no te llega.',
);

// Estética de marca (2026-10-19): envoltorio común PaginaInstitucional.

export default async function FAQ() {
  const precio = await getPrecioTarot();
  const precioTexto = precio !== null ? `$U ${precio}` : 'el precio que ves en el checkout';

  // Ordenadas por momento (auditoría UX 2026-10-30, F2): primero lo que se
  // pregunta antes de comprar, después lo que importa una vez pagado.
  const FAQS = [
    {
      grupo: 'antes' as const,
      q: '¿Qué recibo exactamente?',
      a: 'Un mensaje en tu WhatsApp (y en tu email, si lo pedís) con tus 5 cartas y dos accesos: "Leer mi tirada", una lectura online pensada para el celular disponible 30 días, y "Descargar PDF", un archivo de 3 páginas que es tuyo para siempre.',
    },
    {
      grupo: 'antes' as const,
      q: '¿Cuánto cuesta?',
      a: `El Tarot cuesta ${precioTexto}, un pago único. Sin suscripción, sin renovaciones ni cargos futuros.`,
    },
    {
      grupo: 'antes' as const,
      q: '¿Es IA o hay un tarotista humano?',
      a: 'Las cartas se sortean y la lectura la genera inteligencia artificial, aplicando la simbología del tarot clásico a tu situación. No hay un tarotista humano detrás. Es una perspectiva simbólica para reflexionar, no una predicción.',
    },
    {
      grupo: 'antes' as const,
      q: '¿Es realmente personalizada?',
      a: 'Sí. Tus 5 cartas se sortean para vos y se interpretan con tu nombre, tu fecha de nacimiento, el tema que elegiste y tu pregunta, si la escribís. No es texto estándar ni genérico.',
      // Enlazado interno (Paquete SEO 1, 2026-10-21)
      extra: <>Más detalle en <Link href="/tarot/lectura-personalizada" className="underline underline-offset-2 hover:text-white" style={{ color: GOLD }}>qué incluye una lectura personalizada</Link>.</>,
    },
    {
      grupo: 'antes' as const,
      q: '¿Alguien más se entera de mi consulta?',
      a: 'No. Tu tirada llega directo a tu WhatsApp (y a tu email, si lo pedís) — nadie más la ve, y nosotros no la compartimos con nadie. Podés preguntar sobre lo que sea sin dar explicaciones.',
    },
    {
      grupo: 'antes' as const,
      q: '¿Cómo se paga?',
      a: 'El pago se procesa de forma segura con Mercado Pago. Podés pagar con tarjeta, saldo o transferencia. Tus datos bancarios nunca pasan por nuestros servidores.',
    },
    {
      grupo: 'antes' as const,
      q: '¿Necesito instalar alguna app?',
      a: 'No. Todo llega directo a tu WhatsApp, que ya tenés instalado. La lectura online se abre en el navegador del celular, sin descargar nada.',
    },
    {
      grupo: 'antes' as const,
      q: '¿Tienen otros productos además del Tarot?',
      a: 'Por ahora el Tarot es el único producto disponible. Somos una empresa nueva y estamos construyendo más experiencias — cuando estén listas, las vas a encontrar en este mismo sitio.',
    },
    {
      grupo: 'despues' as const,
      q: '¿Cuánto tarda?',
      a: 'Menos de 15 minutos desde que se confirma tu pago. Si pasado ese tiempo no la recibiste, escribinos a hola@tuoraculo.uy y te la enviamos de inmediato.',
    },
    {
      grupo: 'despues' as const,
      q: '¿Qué pasa si no me llega?',
      a: 'Primero revisá que el número de WhatsApp esté bien escrito y mirá tu email (incluida la carpeta de spam). Si pasaron 15 minutos y no hay nada, escribinos a hola@tuoraculo.uy y te la reenviamos.',
    },
    {
      grupo: 'despues' as const,
      q: '¿Puedo consultar más de una vez?',
      a: 'Sí. Cada tirada es independiente: cada vez se sortean cartas nuevas. Podés pedir otra cuando quieras, sobre el mismo tema o uno diferente.',
      extra: <>Mirá cómo es una lectura sobre <Link href="/tarot/amor" className="underline underline-offset-2 hover:text-white" style={{ color: GOLD }}>amor</Link>, <Link href="/tarot/trabajo-y-dinero" className="underline underline-offset-2 hover:text-white" style={{ color: GOLD }}>trabajo y dinero</Link> o <Link href="/tarot/decisiones" className="underline underline-offset-2 hover:text-white" style={{ color: GOLD }}>una decisión</Link>.</>,
    },
  ];

  // FAQPage (Paquete SEO 2): mismas preguntas y respuestas visibles, en texto plano.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <PaginaInstitucional>
        <script type="application/ld+json" dangerouslySetInnerHTML={htmlJsonLd(jsonLd)} />
        <EncabezadoInstitucional eyebrow="Dudas frecuentes" titulo="Preguntas frecuentes">
          <p>Todo lo que necesitás saber sobre el Tarot, antes o después de comprar.</p>
        </EncabezadoInstitucional>

        {/* Acordeón */}
        {([['antes', 'Antes de comprar'], ['despues', 'Después de comprar']] as const).map(([grupo, titulo]) => (
        <div key={grupo} className="mb-10">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>{titulo}</p>
        <div className="space-y-3">
          {FAQS.filter((f) => f.grupo === grupo).map((faq, i) => (
            <details key={i} className="group rounded-2xl overflow-hidden" style={PANEL}>
              <summary className="px-5 md:px-6 py-4 flex items-center justify-between gap-4 cursor-pointer select-none transition-colors hover:bg-white/[0.03]">
                {/* Paquete SEO 2: cada pregunta es un h2 (mismo estilo que el span anterior) */}
                <h2 className="m-0" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.25, color: CREMA }}>{faq.q}</h2>
                <span
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{ width: 30, height: 30, border: '1px solid rgba(240,197,90,0.45)', background: 'rgba(240,197,90,0.06)' }}
                >
                  <ChevronDown size={15} className="transition-transform duration-200 group-open:rotate-180" style={{ color: GOLD }} aria-hidden="true" />
                </span>
              </summary>
              <div className="px-5 md:px-6 pb-5">
                <div className="pt-3" style={{ borderTop: '1px solid rgba(240,197,90,0.18)' }}>
                  <p className="text-white/70 text-[15px] leading-relaxed">{faq.a}</p>
                  {faq.extra && <p className="mt-2 text-white/70 text-[15px] leading-relaxed">{faq.extra}</p>}
                </div>
              </div>
            </details>
          ))}
        </div>
        </div>
        ))}

        {/* ¿Quedó alguna duda? */}
        <div className="rounded-2xl px-6 py-6 mb-10 text-center" style={PANEL}>
          <span className="mx-auto mb-3 flex items-center justify-center rounded-full" style={{ width: 44, height: 44, border: '1px solid rgba(240,197,90,0.45)', background: 'rgba(240,197,90,0.08)' }}>
            <MessageCircle size={19} style={{ color: GOLD }} aria-hidden="true" />
          </span>
          <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 21, color: CREMA }}>¿Quedó alguna duda sin responder?</p>
          <Link href="/contacto" className="mt-1 inline-block text-[14px] underline underline-offset-4 transition-colors hover:text-white" style={{ color: GOLD }}>
            Escribinos desde la página de contacto
          </Link>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/tarot"
            className="inline-block rounded-xl px-8 py-4 text-[16px] font-bold transition-all hover:brightness-105"
            style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: '0 6px 24px rgba(240,197,90,0.32)' }}
          >
            Quiero mi lectura →
          </Link>
          <p className="mt-2.5 text-[12.5px] text-white/50">{precioTexto} · un pago único · te llega en menos de 15 min</p>
        </div>
    </PaginaInstitucional>
  );
}
