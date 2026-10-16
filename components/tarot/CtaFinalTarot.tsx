"use client";

import { CtaButton } from "@/components/home/CtaButton";

const PIE = "/img/tarot/contenedores/pie";

// Íconos de Manuel (520×520, aro dorado, fondo transparente). `aro`: diámetro
// visible del aro dentro del lienzo, medido por píxeles — no es el mismo en
// todos (el del celular ocupa casi todo el lienzo, el del rayo ~60%), así que
// cada imagen se escala para que los aros se vean del mismo tamaño.
// "Música ambiental" va junto con el resumen en audio (mismo ícono de
// auriculares, mismo momento de la experiencia).
const BENEFICIOS = [
  { img: "entrega.webp", aro: 318, label: "Entrega en minutos" },
  { img: "pago-seguro.webp", aro: 338, label: "Pago seguro" },
  { img: "whatsapp.webp", aro: 349, label: "WhatsApp y/o mail" },
  { img: "pdf.webp", aro: 318, label: "PDF descargable" },
  { img: "resumen-voz.webp", aro: 374, label: "Resumen con voz IA y música" },
  { img: "lectura-online.webp", aro: 438, label: "Lectura online" },
];

const ARO_VISIBLE = 54; // px que mide el aro en pantalla, igual en los 6

function IconoBeneficio({ img, aro }: { img: string; aro: number }) {
  const lado = Math.round((ARO_VISIBLE * 520) / aro);
  return (
    <div className="flex items-center justify-center" style={{ width: ARO_VISIBLE, height: ARO_VISIBLE }}>
      <img src={`${PIE}/${img}`} alt="" aria-hidden="true" style={{ width: lado, height: lado, maxWidth: "none", flexShrink: 0 }} />
    </div>
  );
}

export function CtaFinalTarot({ precioUYU }: { precioUYU: number | null }) {
  const precioTexto = precioUYU !== null ? `$U ${precioUYU}` : null;

  return (
    <section className="relative px-5 md:px-8 py-16 md:py-20 max-w-[760px] mx-auto text-center">
      <h2
        className="mb-4"
        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: "clamp(1.7rem, 4vw, 2.5rem)", lineHeight: 1.2 }}
      >
        Tu momento puede verse distinto desde otra perspectiva.
      </h2>
      <p className="text-white/60 text-[14px] md:text-[15px] leading-relaxed mb-8 max-w-md mx-auto">
        Hacé tu consulta y descubrí qué tienen para mostrarte tus cinco cartas.
      </p>

      <CtaButton href="/tarot/checkout" className="px-7 py-3.5 text-[15px] mb-10">
        {precioTexto ? `Quiero mi Tarot por ${precioTexto} →` : "Quiero mi Tarot →"}
      </CtaButton>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-6 max-w-[700px] mx-auto">
        {BENEFICIOS.map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-2.5">
            <IconoBeneficio img={b.img} aro={b.aro} />
            <span className="text-[12.5px] text-white/75 leading-snug">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
