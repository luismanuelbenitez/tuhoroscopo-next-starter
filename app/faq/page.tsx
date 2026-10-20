import { ChevronDown, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { PaginaInstitucional, EncabezadoInstitucional, PANEL_INSTITUCIONAL as PANEL } from '@/components/marca/PaginaInstitucional';
import { GOLD, SERIF, CREMA, CTA_GRADIENT } from '@/components/home/theme';

// Estética de marca (2026-10-19): envoltorio común PaginaInstitucional.

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
      a: `El Tarot cuesta ${precioTexto}, un pago único. Sin suscripción, sin renovaciones ni cargos futuros.`,
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
      q: '¿Tienen otros productos además del Tarot?',
      a: 'Por ahora el Tarot es el único producto disponible. Somos una empresa nueva y estamos construyendo más experiencias — cuando estén listas, las vas a encontrar en este mismo sitio.',
    },
  ];

  return (
    <PaginaInstitucional>
        <EncabezadoInstitucional eyebrow="Dudas frecuentes" titulo="Preguntas frecuentes">
          <p>Todo lo que necesitás saber sobre el Tarot, antes o después de comprar.</p>
        </EncabezadoInstitucional>

        {/* Acordeón */}
        <div className="space-y-3 mb-10">
          {FAQS.map((faq, i) => (
            <details key={i} className="group rounded-2xl overflow-hidden" style={PANEL}>
              <summary className="px-5 md:px-6 py-4 flex items-center justify-between gap-4 cursor-pointer select-none transition-colors hover:bg-white/[0.03]">
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.25, color: CREMA }}>{faq.q}</span>
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
                </div>
              </div>
            </details>
          ))}
        </div>

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
            Quiero mi tirada →
          </Link>
          <p className="mt-2.5 text-[12.5px] text-white/50">{precioTexto} · un pago único · te llega en menos de 15 min</p>
        </div>
    </PaginaInstitucional>
  );
}
