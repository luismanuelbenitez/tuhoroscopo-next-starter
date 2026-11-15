import Link from 'next/link';

import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL, IndiceLegal, anclaSeccion } from '@/components/marca/PaginaInstitucional';
import { GOLD } from '@/components/home/theme';
import { getPrecioTarot } from '@/lib/getPrecioTarot';
import { REVALIDAR_MARKETING } from "@/lib/fetchSupabase";
import { metadataPagina } from '@/lib/seo/metadataPagina';
import { pesosUY } from '@/lib/ctaTarot';
import { seccionesTerminos, LEGAL_ACTUALIZADO } from '@/lib/textosLegales';

// Pregenerada; precio y testimonios se releen cada 60 s (lib/fetchSupabase).
export const revalidate = 60;

// Metadata propia (Paquete SEO 1, 2026-10-21): título, descripción, canonical y OG.
export const metadata = metadataPagina(
  '/terminos-del-servicio',
  'Términos del servicio | Tu Oráculo',
  'Condiciones de Tu Oráculo: qué es la lectura de Tarot, precio y pago único, entrega, arrepentimiento y devoluciones, y dónde reclamar.',
);

export default async function TerminosServicio() {
  const precioTarot = await getPrecioTarot({ revalidar: REVALIDAR_MARKETING });
  const precioTarotTexto = precioTarot !== null ? pesosUY(precioTarot) : 'el precio que ves en el checkout';

  // Textos en lib/textosLegales.ts (los comparte la hoja del checkout).
  const SECTIONS = seccionesTerminos(precioTarotTexto);

  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Legal" titulo="Términos del servicio">
        <p>Estas condiciones regulan el uso de Tu Oráculo y de su lectura de Tarot.</p>
        <p className="text-white/45 text-[13px] mt-2">Última actualización: {LEGAL_ACTUALIZADO}</p>
      </EncabezadoInstitucional>

      <IndiceLegal titulos={SECTIONS.map(s => s.title)} />
      <div className="space-y-3 mb-10">
        {SECTIONS.map(section => (
          <PanelInstitucional key={section.title} id={anclaSeccion(section.title)} titulo={section.title}>
            <p>{section.content}</p>
          </PanelInstitucional>
        ))}
      </div>

      <div className="rounded-2xl px-6 py-5 text-center" style={PANEL_INSTITUCIONAL}>
        <p className="text-white/70 text-[15px]">
          Consultas legales:{' '}
          <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2" style={{ color: GOLD }}>
            hola@tuoraculo.uy
          </a>
        </p>
          <p className="text-white/50 text-[13px] mt-3">
            ¿Buscás la{' '}
            <Link href="/politica-de-privacidad" className="underline underline-offset-2" style={{ color: GOLD }}>
              Política de privacidad
            </Link>
            ?
          </p>
      </div>
    </PaginaInstitucional>
  );
}
