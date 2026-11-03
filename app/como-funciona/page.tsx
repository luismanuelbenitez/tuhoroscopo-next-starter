import Link from 'next/link';

import { PaginaInstitucional, EncabezadoInstitucional, PANEL_INSTITUCIONAL } from '@/components/marca/PaginaInstitucional';
import { PASOS } from '@/components/home2/pasosComoFunciona';
import { MotorNarrativo } from '@/components/home2/MotorNarrativo';
import { IconoConFallback } from '@/components/home/IconoConFallback';
import { GOLD, CTA_GRADIENT } from '@/components/home/theme';
import { metadataPagina } from '@/lib/seo/metadataPagina';

// Cómo funciona (2026-11-02): página propia con el mismo marco y fondo que
// Privacidad (a pedido: "exactamente igual"). El menú lleva acá; la sección de
// la Home sigue igual. Los 4 pasos son los mismos de la Home (PASOS).
export const metadata = metadataPagina(
  '/como-funciona',
  'Cómo funciona | Tu Oráculo',
  'De tu consulta a tu lectura de Tarot en cuatro pasos: elegís el tema, pagás con Mercado Pago y en minutos recibís tus 5 cartas por WhatsApp, con resumen en audio y PDF.',
);

export default function ComoFunciona() {
  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Simple, rápido y desde tu celular" titulo="¿Cómo funciona?">
        <p>De tu consulta a tu lectura, en cuatro pasos.</p>
      </EncabezadoInstitucional>

      <ol className="space-y-3 mb-10">
        {PASOS.map((p) => (
          <li key={p.n} className="flex items-center gap-4 rounded-2xl px-5 py-4" style={PANEL_INSTITUCIONAL}>
            <IconoConFallback src={p.icon} size={52} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[16px] md:text-[17px] font-semibold leading-snug text-white">
                <span style={{ color: GOLD }}>{p.n}.</span> {p.t}
              </p>
              <p className="text-[14px] text-white/75 leading-snug mt-1">{p.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="-mx-5 md:-mx-8">
        <MotorNarrativo />
      </div>

      <div className="rounded-2xl px-6 py-6 text-center mt-4" style={PANEL_INSTITUCIONAL}>
        <p className="text-white/85 text-[15px] mb-4">Tu lectura de 5 cartas, escrita para tu consulta, en minutos.</p>
        <Link
          href="/tarot/checkout"
          className="inline-flex items-center gap-2 text-[15px] font-bold rounded-xl px-6 py-3 transition-all hover:brightness-105"
          style={{ background: CTA_GRADIENT, color: '#180e00', boxShadow: '0 6px 24px rgba(240,197,90,0.30)' }}
        >
          Quiero mi lectura →
        </Link>
        <p className="text-white/55 text-[13px] mt-4">
          ¿Tenés dudas? Mirá las{' '}
          <Link href="/faq" className="underline underline-offset-2" style={{ color: GOLD }}>preguntas frecuentes</Link>.
        </p>
      </div>
    </PaginaInstitucional>
  );
}
