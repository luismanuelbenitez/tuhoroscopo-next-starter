import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import StaticPageLayout from '@/components/StaticPageLayout';
import { getPrecioTarot } from '@/lib/getPrecioTarot';

const GOLD = '#F0C55A';

export default async function FAQ() {
  const precio = await getPrecioTarot();
  const precioTexto = precio !== null ? `$U ${precio}` : 'el precio que ves en el checkout';

  const FAQS = [
    {
      q: '¿Qué recibo exactamente?',
      a: 'Un mensaje en tu WhatsApp (y en tu email, si lo pedís) con tus 5 cartas y dos accesos: "Leer mi tirada", una lectura online pensada para el celular disponible 30 días, y "Descargar PDF", un archivo de 3 páginas que es tuyo para siempre.',
    },
    {
      q: '¿Cuánto tarda?',
      a: 'Menos de 15 minutos desde que se confirma tu pago. Si pasado ese tiempo no la recibiste, escribinos a hola@tuoraculo.uy y te la enviamos de inmediato.',
    },
    {
      q: '¿Alguien más se entera de mi consulta?',
      a: 'No. Tu tirada llega directo a tu WhatsApp (y a tu email, si lo pedís) — nadie más la ve, y nosotros no la compartimos con nadie. Podés preguntar sobre lo que sea sin dar explicaciones.',
    },
    {
      q: '¿Es realmente personalizada?',
      a: 'Sí. Tus 5 cartas se sortean para vos y se interpretan con tu nombre, tu fecha de nacimiento, el tema que elegiste y tu pregunta, si la escribís. No es texto estándar ni genérico.',
    },
    {
      q: '¿Cuánto cuesta?',
      a: `Tu Tirada cuesta ${precioTexto}, un pago único. Sin suscripción, sin renovaciones ni cargos futuros.`,
    },
    {
      q: '¿Cómo se paga?',
      a: 'El pago se procesa de forma segura con Mercado Pago. Podés pagar con tarjeta, saldo o transferencia. Tus datos bancarios nunca pasan por nuestros servidores.',
    },
    {
      q: '¿Qué pasa si no me llega?',
      a: 'Primero revisá que el número de WhatsApp esté bien escrito y mirá tu email (incluida la carpeta de spam). Si pasaron 15 minutos y no hay nada, escribinos a hola@tuoraculo.uy y te la reenviamos.',
    },
    {
      q: '¿Es IA o hay un tarotista humano?',
      a: 'Las cartas se sortean y la lectura la genera inteligencia artificial, aplicando la simbología del tarot clásico a tu situación. No hay un tarotista humano detrás. Es una perspectiva simbólica para reflexionar, no una predicción.',
    },
    {
      q: '¿Puedo consultar más de una vez?',
      a: 'Sí. Cada tirada es independiente: cada vez se sortean cartas nuevas. Podés pedir otra cuando quieras, sobre el mismo tema o uno diferente.',
    },
    {
      q: '¿Necesito instalar alguna app?',
      a: 'No. Todo llega directo a tu WhatsApp, que ya tenés instalado. La lectura online se abre en el navegador del celular, sin descargar nada.',
    },
    {
      q: '¿Tienen otros productos además de Tu Tirada?',
      a: 'Por ahora Tu Tirada es el único producto disponible. Somos una empresa nueva y estamos construyendo más experiencias — cuando estén listas, las vas a encontrar en este mismo sitio.',
    },
  ];

  return (
    <StaticPageLayout>

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
          Dudas frecuentes
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
          Preguntas frecuentes
        </h1>
        <p className="text-white/70 text-base leading-relaxed">
          Todo lo que necesitás saber sobre Tu Tirada, antes o después de comprar.
        </p>
      </div>

      {/* Accordion */}
      <div className="space-y-2 mb-10">
        {FAQS.map((faq, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-white/8 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <summary className="px-5 py-4 flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-white/95 text-sm font-semibold">{faq.q}</span>
              <ChevronDown
                size={15}
                className="shrink-0 transition-transform duration-200 group-open:rotate-180"
                style={{ color: GOLD }}
              />
            </summary>
            <div className="px-5 pb-5">
              <div className="border-t border-white/6 pt-3">
                <p className="text-white/60 text-sm leading-relaxed">{faq.a}</p>
              </div>
            </div>
          </details>
        ))}
      </div>

      {/* ¿Quedó alguna duda? */}
      <div
        className="rounded-2xl border border-white/8 p-6 mb-8 text-center"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <p className="text-white/80 text-sm mb-1">¿Quedó alguna duda sin responder?</p>
        <Link href="/contacto" className="text-sm underline underline-offset-2 transition-colors" style={{ color: GOLD }}>
          Escribinos desde la página de contacto
        </Link>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/tarot"
          className="inline-block rounded-xl px-8 py-3.5 text-sm font-bold"
          style={{
            background: `linear-gradient(135deg, #c49008 0%, ${GOLD} 55%, #f2cc44 100%)`,
            color: '#180e00',
            boxShadow: '0 4px 20px rgba(240,197,90,0.30)',
          }}
        >
          Quiero mi tirada →
        </Link>
        <p className="mt-2 text-[12px] text-white/40">{precioTexto} · un pago único · te llega en menos de 15 min</p>
      </div>

    </StaticPageLayout>
  );
}
