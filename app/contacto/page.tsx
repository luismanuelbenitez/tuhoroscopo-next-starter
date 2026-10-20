import { Mail, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional } from '@/components/marca/PaginaInstitucional';
import { GOLD, CTA_GRADIENT } from '@/components/home/theme';

// Estética de marca (2026-10-19): envoltorio común PaginaInstitucional.
// Textos sin cambios.
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? '';

export default function Contacto() {
  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Soporte" titulo="Contacto">
        <p className="max-w-xl mx-auto">
          Estamos para ayudarte. Si tenés una consulta sobre tu tirada o tu pago, estas son las
          formas de comunicarte con nosotros.
        </p>
      </EncabezadoInstitucional>

      <div className="space-y-4 mb-10">
        <PanelInstitucional titulo="Correo electrónico">
          <p>
            La forma más confiable de contactarnos. Respondemos en un plazo de 24 a 48 horas
            hábiles.
          </p>
          <a
            href="mailto:hola@tuoraculo.uy"
            className="inline-flex items-center gap-2 text-[15px] font-bold rounded-xl px-5 py-3 transition-all hover:brightness-105"
            style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: '0 6px 24px rgba(240,197,90,0.30)' }}
          >
            <Mail size={16} aria-hidden="true" />
            hola@tuoraculo.uy
          </a>
        </PanelInstitucional>

        {WA_NUMBER && (
          <PanelInstitucional titulo="WhatsApp">
            <p>
              Si ya compraste tu tirada, respondé directamente al mensaje que te llegó — es el
              camino más rápido. Si todavía no compraste y tenés una duda, también podés
              escribirnos acá.
            </p>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[15px] font-semibold rounded-xl px-5 py-3 transition-colors hover:bg-[#F0C55A]/10"
              style={{ border: '1px solid rgba(240,197,90,0.45)', color: GOLD }}
            >
              <MessageCircle size={16} aria-hidden="true" />
              Escribinos por WhatsApp
            </a>
          </PanelInstitucional>
        )}

        <PanelInstitucional titulo="No recibí mi tirada">
          <p>
            Primero revisá que el número de WhatsApp esté bien escrito y mirá tu email (incluida la
            carpeta de spam, si pediste copia ahí). Si pasaron 15 minutos desde el pago y no
            recibiste nada, escribinos por cualquiera de los canales de arriba con el nombre y el
            teléfono que usaste al comprar — te la reenviamos de inmediato.
          </p>
        </PanelInstitucional>

        <PanelInstitucional titulo="Motivos de contacto más frecuentes">
          <ul className="space-y-2.5">
            {[
              'No recibí mi tirada después de pagar',
              'Tengo una duda sobre el cobro en Mercado Pago',
              'Quiero corregir un dato de mi consulta (nombre, teléfono, fecha)',
              'El enlace a mi lectura online dejó de funcionar',
              'Tengo una sugerencia o comentario',
            ].map(motivo => (
              <li key={motivo} className="flex gap-3 items-start">
                <span className="mt-[9px] shrink-0 text-[9px] leading-none" style={{ color: GOLD }} aria-hidden="true">✦</span>
                <span>{motivo}</span>
              </li>
            ))}
          </ul>
        </PanelInstitucional>
      </div>

      <div className="text-center">
        <p className="text-white/60 text-[15px] mb-1.5">¿Buscás una respuesta rápida?</p>
        <Link href="/faq" className="text-[15px] underline underline-offset-4 hover:text-white transition-colors" style={{ color: GOLD }}>
          Revisá las preguntas frecuentes →
        </Link>
      </div>
    </PaginaInstitucional>
  );
}
