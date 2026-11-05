import Link from "next/link";
import { Zap, MessageCircle, Volume2, FileText, Eye } from "lucide-react";
import { GOLD } from "@/components/home/theme";
import { CtaButton } from "@/components/home/CtaButton";
import { fijo } from "@/lib/imagen";
import { VideoDemoTarot } from "@/components/tarot/VideoDemoTarot";

const CREMA = "#F5EFE0";
const TEXT_SHADOW = "0 2px 14px rgba(0,0,0,0.65)";
const MP_LOGO = "/img/tarot/generales/MP_RGB_HANDSHAKE_pluma_horizontal.png";

const BENEFICIOS = [
  { Icon: Zap, label: "Entrega en minutos" },
  { Icon: MessageCircle, label: "Por WhatsApp y/o mail" },
  { Icon: Volume2, label: "Resumen en audio" },
  { Icon: FileText, label: "PDF para guardar" },
];

// Portada v2 (2026-11-03, auditoría móvil de Google Ads: 5 de 6 visitas se
// iban sin pasar de acá). Antes era un párrafo de 5 líneas y lo que muestra
// el producto quedaba 3 pantallas más abajo. Ahora: promesa corta + video de
// 14 s con lo que se recibe + ejemplo de lectura, todo en la primera
// pantalla del celular. El precio pasa a la línea de abajo del botón.
export function HeroTarot({ precioUYU }: { precioUYU: number | null }) {
  const precioTexto = precioUYU !== null ? `$U ${precioUYU}` : null;

  const ejemplo = (
    <Link href="/tarot/ejemplo" className="inline-flex items-center gap-1.5 py-2.5 -my-2.5 text-[14px] font-semibold underline underline-offset-4 decoration-1" style={{ color: GOLD, textShadow: TEXT_SHADOW }}>
      <Eye size={14} className="shrink-0" /> Ver una lectura de ejemplo
    </Link>
  );

  return (
    <div className="relative px-5 md:px-12" style={{ paddingTop: "6%", paddingBottom: "5%" }}>
      {/* Mobile: velo oscuro detrás del texto, que cae sobre el libro y las
          velas de la escena (auditoría UX 2026-10-30, T3). */}
      <div aria-hidden="true" className="md:hidden absolute inset-x-0 top-[2%] bottom-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 90% 65% at 40% 50%, rgba(8,4,18,0.70) 0%, rgba(8,4,18,0.40) 55%, transparent 88%)" }} />
      <div className="relative md:flex md:items-center md:gap-12">
        {/* Sin animación de entrada (2026-11-05): el bloque de arriba se ve
            desde el primer cuadro; la animación demoraba el LCP. */}
        <div className="md:flex-1 max-w-[520px]">
          {/* SEO (2026-10-21): el H1 es la intención principal de la página
              con el estilo del antetítulo. 2026-11-05: dice las búsquedas
              que compra Google Ads ("lectura de tarot online"), que es lo
              que mide la relevancia de la página de destino. */}
          <h1 className="text-[12px] md:text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: GOLD, textShadow: TEXT_SHADOW }}>
            Lectura de tarot online personalizada
          </h1>
          <p className="mb-2" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700, fontSize: "clamp(1.9rem, 5.4vw, 3.1rem)", lineHeight: 1.05, color: CREMA, textShadow: TEXT_SHADOW }}>
            Tu tirada de 5 cartas,{" "}
            <span style={{ color: GOLD }}>interpretada para tu pregunta.</span>
          </p>
          <p className="text-white/90 md:text-white/80 text-[14.5px] md:text-[16px] leading-snug mb-4 md:mb-6" style={{ textShadow: TEXT_SHADOW }}>
            En minutos te llega por WhatsApp, explicada carta por carta.
          </p>

          {/* Celular: video y beneficios lado a lado, así todo entra en la primera pantalla. */}
          <div className="flex md:hidden items-center gap-4 mb-5">
            <VideoDemoTarot movil className="w-[42%] max-w-[190px] shrink-0" />
            <div className="flex flex-col gap-3 min-w-0">
              {BENEFICIOS.map(({ Icon, label }) => (
                <div key={label} className="flex items-start gap-2">
                  <Icon size={15} style={{ color: GOLD, flexShrink: 0, marginTop: 2 }} />
                  <span className="text-[13.5px] leading-snug text-white/85" style={{ textShadow: TEXT_SHADOW }}>{label}</span>
                </div>
              ))}
              <div className="pt-1">{ejemplo}</div>
            </div>
          </div>

          <div className="hidden md:flex flex-wrap gap-x-5 gap-y-2.5 mb-7">
            {BENEFICIOS.map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon size={14} style={{ color: GOLD, flexShrink: 0 }} />
                <span className="text-[13px] text-white/75" style={{ textShadow: TEXT_SHADOW }}>{label}</span>
              </div>
            ))}
          </div>

          <div>
            <CtaButton href="/tarot/checkout" className="block md:inline-block w-full md:w-auto px-7 py-3.5 text-[16px]">
              Quiero mi lectura →
            </CtaButton>
            <div className="mt-2.5 flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <p className="text-[12.5px] text-white/65" style={{ textShadow: TEXT_SHADOW }}>
                {precioTexto ? <><span className="font-semibold text-white/90">{precioTexto}</span> · </> : null}Pago único con
              </p>
              {/* Paquete SEO 2: PNG 1049×426 → se pinta a 59×24 */}
              <img {...fijo(MP_LOGO, 60, 24)} alt="Mercado Pago" style={{ height: 24, width: "auto", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.5))" }} />
            </div>
            <div className="hidden md:block mt-5">{ejemplo}</div>
          </div>
        </div>

        <div className="hidden md:block shrink-0 w-[250px]">
          <VideoDemoTarot />
        </div>
      </div>
    </div>
  );
}
