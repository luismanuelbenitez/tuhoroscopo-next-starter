"use client";

import { ShieldCheck, Receipt, LockKeyhole } from "lucide-react";
import { GOLD, SERIF, CTA_GRADIENT } from "@/components/home/theme";

const PASOS = [
  { t: "Confirmás el pago", d: "Completás tu compra de forma segura en Mercado Pago." },
  { t: "La IA genera tu lectura", d: "Creamos una lectura única y personalizada para vos." },
  { t: "La recibís por WhatsApp", d: "En menos de 15 minutos la tenés en tu teléfono. También podés recibirla por email." },
];

const SELLOS = [
  { Icon: ShieldCheck, label: "Pago seguro con Mercado Pago" },
  { Icon: Receipt, label: "Pago único, sin suscripción" },
  { Icon: LockKeyhole, label: "Tus datos protegidos" },
];

export function QuePasaDespues() {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "rgba(12,7,24,0.80)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(6px)" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-5" style={{ color: GOLD }}>
        ¿Qué pasa después?
      </p>

      <ol>
        {PASOS.map((paso, i) => (
          <li key={paso.t} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Línea que une los pasos */}
            {i < PASOS.length - 1 && (
              <span aria-hidden="true" className="absolute left-[15px] top-9 bottom-1 w-px" style={{ background: "rgba(240,197,90,0.35)" }} />
            )}
            <span
              className="flex items-center justify-center rounded-full shrink-0 text-[14px] font-bold"
              style={{ width: 31, height: 31, background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 0 12px rgba(240,197,90,0.30)" }}
            >
              {i + 1}
            </span>
            <div>
              <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.2 }} className="text-white/95">
                {paso.t}
              </p>
              <p className="text-[13px] text-white/60 leading-snug mt-1">{paso.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 pt-5 grid grid-cols-3" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
        {SELLOS.map(({ Icon, label }, i) => (
          <div
            key={label}
            className="flex flex-col items-center text-center px-2"
            style={i > 0 ? { borderLeft: "1px solid rgba(255,255,255,0.08)" } : undefined}
          >
            <span
              className="flex items-center justify-center rounded-full mb-2"
              style={{ width: 44, height: 44, background: "rgba(240,197,90,0.08)", border: "1px solid rgba(240,197,90,0.45)" }}
            >
              <Icon size={19} style={{ color: GOLD }} />
            </span>
            <span className="text-[11.5px] text-white/70 leading-snug">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
