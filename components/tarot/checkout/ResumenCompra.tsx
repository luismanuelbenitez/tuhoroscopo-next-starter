"use client";

import { Layers, BookOpen, Volume2, FileText, MessageCircle, Mail, Tag } from "lucide-react";
import { GOLD, SERIF, CREMA } from "@/components/home/theme";

// Imagen provisoria (la misma de la card de producto en Home) hasta tener
// la ilustración definitiva. El pergamino es código, no imagen: así puede
// mostrar el nombre que el cliente va escribiendo en el formulario.
const IMAGEN = "/img/home/destacado/producto-destacado.png";
const CARD_BG = "#0c0718";

const INCLUYE = [
  { Icon: Layers, label: "5 cartas interpretadas para vos" },
  { Icon: BookOpen, label: "Lectura narrativa personalizada" },
  { Icon: Volume2, label: "Lectura online con resumen en audio" },
  { Icon: FileText, label: "PDF premium para guardar" },
  { Icon: MessageCircle, label: "Entrega por WhatsApp" },
  { Icon: Mail, label: "Disponible también por email" },
];

interface Props {
  nombre: string;
  precioBase: number | null;
  precioFinal: number | null;
  descuentoAplicado: number | null;
}

export function ResumenCompra({ nombre, precioBase, precioFinal, descuentoAplicado }: Props) {
  const primerNombre = nombre.trim().split(/\s+/)[0];
  const titulo = primerNombre ? `Lectura para ${primerNombre}` : "Tu lectura";

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.45)", boxShadow: "0 0 0 1px rgba(240,197,90,0.06), 0 18px 48px rgba(0,0,0,0.45), 0 0 32px rgba(240,197,90,0.08)" }}
    >
      <div className="relative" style={{ height: 220 }}>
        <img
          src={IMAGEN}
          alt="Cartas de tarot sobre una mesa con velas"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }}
        />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(12,7,24,0.15) 0%, transparent 35%, ${CARD_BG} 100%)` }} />

        {/* Pergamino con el nombre */}
        <div className="absolute left-1/2 -translate-x-1/2 top-4 max-w-[85%]">
          <div
            className="px-6 py-1.5 rounded-[4px] text-center truncate"
            style={{
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: 17,
              color: "#291408",
              background: "linear-gradient(180deg, #f6e8c6 0%, #e6cf9c 100%)",
              border: "1px solid #b8913e",
              boxShadow: "0 4px 14px rgba(0,0,0,0.45), inset 0 0 10px rgba(150,110,40,0.25)",
            }}
          >
            {titulo}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 -mt-2 relative">
        <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, lineHeight: 1.1, color: CREMA }}>
          Lectura de Tarot
        </h2>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] mt-1.5" style={{ color: GOLD }}>
          Una experiencia completa de autoconocimiento
        </p>
        <p className="text-[14px] text-white/70 leading-relaxed mt-4">
          Recibí una lectura profunda y personalizada con la sabiduría del tarot, creada especialmente para tu momento actual.
        </p>

        <ul className="mt-5 space-y-3">
          {INCLUYE.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-[13.5px] text-white/80">
              <Icon size={16} style={{ color: GOLD, flexShrink: 0 }} />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(240,197,90,0.22)" }}>
          <div className="flex items-end justify-between gap-3">
            <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 20, color: "rgba(245,239,224,0.85)" }}>Total</span>
            <div className="text-right">
              {precioFinal === null ? (
                <span className="text-sm font-semibold text-amber-300/80">No disponible</span>
              ) : (
                <>
                  {descuentoAplicado !== null && (
                    <span className="text-sm line-through text-white/40 mr-2">$U {precioBase}</span>
                  )}
                  <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 36, lineHeight: 1, color: GOLD }}>
                    $U {precioFinal}
                  </span>
                </>
              )}
            </div>
          </div>
          {descuentoAplicado !== null && (
            <div className="mt-3 rounded-lg px-3 py-1.5 text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 flex items-center gap-1.5">
              <Tag size={11} className="shrink-0" />
              Ahorrás $U {descuentoAplicado}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Versión compacta para mobile: arriba del formulario, así se ve qué se
// compra y cuánto cuesta antes de completar datos (la card completa queda
// solo en desktop, en la columna lateral).
export function ResumenCompacto({ nombre, precioBase, precioFinal, descuentoAplicado }: Props) {
  const primerNombre = nombre.trim().split(/\s+/)[0];
  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl p-3 pr-4"
      style={{ background: CARD_BG, border: "1px solid rgba(240,197,90,0.45)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}
    >
      <img
        src={IMAGEN}
        alt=""
        aria-hidden="true"
        className="shrink-0 rounded-xl"
        style={{ width: 64, height: 64, objectFit: "cover", objectPosition: "center 35%" }}
      />
      <div className="flex-1 min-w-0">
        <p className="line-clamp-2 break-words" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.12, color: CREMA }}>
          {primerNombre ? `Lectura para ${primerNombre}` : "Lectura de Tarot"}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-white/65">5 cartas · Lectura online · Audio · PDF</p>
      </div>
      <div className="shrink-0 text-right">
        {precioFinal === null ? (
          <span className="text-xs font-semibold text-amber-300/80">No disponible</span>
        ) : (
          <>
            {descuentoAplicado !== null && <span className="block text-[11px] line-through text-white/40">$U {precioBase}</span>}
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 24, lineHeight: 1, color: GOLD }}>$U {precioFinal}</span>
          </>
        )}
      </div>
    </div>
  );
}
