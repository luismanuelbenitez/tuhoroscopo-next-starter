import { PaginaInstitucional, EncabezadoInstitucional, PanelInstitucional, PANEL_INSTITUCIONAL, IndiceLegal, anclaSeccion } from '@/components/marca/PaginaInstitucional';
import { GOLD } from '@/components/home/theme';
import { metadataPagina } from '@/lib/seo/metadataPagina';
import { SECCIONES_PRIVACIDAD, LEGAL_ACTUALIZADO } from '@/lib/textosLegales';

// Metadata propia (Paquete SEO 1, 2026-10-21): título, descripción, canonical y OG.
export const metadata = metadataPagina(
  '/politica-de-privacidad',
  'Política de privacidad | Tu Oráculo',
  'Qué datos recopila Tu Oráculo, para qué los usamos, con qué proveedores y en qué países se procesan, cómo usamos la inteligencia artificial y cómo ejercer tus derechos.',
);


// Textos en lib/textosLegales.ts (los comparte la hoja del checkout).
const SECTIONS = SECCIONES_PRIVACIDAD;

export default function PoliticaPrivacidad() {
  return (
    <PaginaInstitucional>
      <EncabezadoInstitucional eyebrow="Legal" titulo="Política de privacidad">
        <p>En Tu Oráculo valoramos tu confianza. Esta política explica qué datos recopilamos y cómo los usamos.</p>
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
          Consultas sobre privacidad:{' '}
          <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-2" style={{ color: GOLD }}>
            hola@tuoraculo.uy
          </a>
        </p>
      </div>
    </PaginaInstitucional>
  );
}
