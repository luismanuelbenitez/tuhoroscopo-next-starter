"use client";

import { LogoIcon } from "@/components/logo-icon";
import { usePrecioTarot } from "@/lib/usePrecioTarot";

function IconStar() {
  return (
    <svg width="30" height="30" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <polygon
        points="19,2 23.2,13.5 35.5,13.5 26,21.5 29.5,33 19,26 8.5,33 12,21.5 2.5,13.5 14.8,13.5"
        fill="rgba(212,175,55,0.92)"
      />
    </svg>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-white/60">
      <span style={{ color: "rgba(212,175,55,0.75)", fontSize: "8px" }}>✦</span>
      {text}
    </li>
  );
}

export default function HomePage() {
  const precioTarot = usePrecioTarot();

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&display=swap');

        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before { display: none !important; }
        header { display: none !important; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fi1 { animation: fadeUp 0.50s ease both; }
        .fi2 { animation: fadeUp 0.50s 0.12s ease both; }
        .fi3 { animation: fadeUp 0.50s 0.24s ease both; }

        .prod-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .prod-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(180,130,0,0.32) !important; }

        @media (prefers-reduced-motion: reduce) {
          .fi1, .fi2, .fi3 { animation: none; }
          .prod-card { transition: none; }
        }
      `}</style>

      <div
        className="text-white flex flex-col"
        style={{ background: "linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)" }}
      >
        {/* Glow dorado sup */}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-96"
          style={{ background: "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(212,175,55,0.13), transparent)", zIndex: 0 }}
        />

        <div className="relative flex-1 flex flex-col items-center" style={{ zIndex: 1 }}>

          {/* ── Hero: la empresa ─────────────────────────────────── */}
          <div className="fi1 text-center pt-10 pb-2 px-4">

            <div className="inline-flex items-center justify-center mb-3 relative">
              <div style={{
                position: "absolute", width: 160, height: 160, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 65%)",
                pointerEvents: "none",
              }} />
              <LogoIcon
                size={84}
                style={{ width: "clamp(64px, 10vw, 84px)", height: "clamp(64px, 10vw, 84px)" }}
              />
            </div>

            <h1
              className="text-white uppercase mb-3"
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 700,
                fontSize: "clamp(1.9rem, 5.5vw, 2.7rem)",
                letterSpacing: "0.24em",
                lineHeight: 1,
              }}
            >
              Tu Oráculo
            </h1>

            <p className="text-white font-medium text-base mb-1.5 max-w-sm mx-auto leading-snug">
              Experiencias de autoconocimiento, directo a tu WhatsApp.
            </p>
            <p className="text-white/60 text-sm max-w-xs mx-auto leading-relaxed">
              Hoy tenemos un producto disponible: Tu Tirada Tarot.{" "}
              <span className="text-white/40">Sin apps. Pago seguro por Mercado Pago.</span>
            </p>
          </div>

          {/* Separador */}
          <div
            className="my-8"
            style={{ width: 52, height: 1, background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.45), transparent)" }}
          />

          {/* ── Producto destacado: Tu Tirada ────────────────────── */}
          <div className="fi2 w-full max-w-md px-5 pb-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-center mb-3" style={{ color: "rgba(212,175,55,0.75)" }}>
              Nuestro primer producto · Disponible ahora
            </p>
            <a
              href="/tarot"
              className="prod-card rounded-2xl flex flex-col"
              style={{
                background: "linear-gradient(160deg, rgba(130,88,0,0.20) 0%, rgba(80,50,0,0.09) 100%)",
                border: "1px solid rgba(212,175,55,0.34)",
                boxShadow: "0 4px 36px rgba(120,80,0,0.20), inset 0 1px 0 rgba(212,175,55,0.14)",
                textDecoration: "none",
                padding: "1.75rem",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <IconStar />
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)", color: "rgba(212,175,55,0.85)" }}
                >
                  Pago único
                </span>
              </div>

              <h2 className="text-2xl font-extrabold text-white mb-1 leading-snug uppercase tracking-wide">
                Tu Tirada Tarot
              </h2>
              <p className="text-white/50 text-sm mb-3">
                Lectura de tarot personalizada con IA
              </p>

              <p className="text-base font-bold mb-4" style={{ color: "rgba(212,175,55,0.95)" }}>
                {precioTarot !== null ? `$U ${precioTarot}` : "Ver precio"}
                <span className="font-normal text-sm" style={{ color: "rgba(212,175,55,0.50)" }}> · pago único</span>
              </p>

              <p className="text-white/55 text-sm leading-relaxed mb-5">
                Se sortean tus 5 cartas y se leen para vos. En menos de 15 minutos te llegan por
                WhatsApp: una lectura online pensada para el celular y un PDF para guardar.
              </p>

              <ul className="space-y-2 mb-6">
                <FeatureItem text="Con o sin pregunta puntual" />
                <FeatureItem text="Te llega en menos de 15 minutos" />
                <FeatureItem text="Sin suscripción" />
              </ul>

              <span
                className="block w-full text-center py-3.5 rounded-xl text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg, #c8980e 0%, #FFCE4D 60%, #e8bc3a 100%)",
                  color: "#180e00",
                  boxShadow: "0 4px 18px rgba(180,140,0,0.35)",
                  letterSpacing: "0.015em",
                }}
              >
                Quiero mi tirada →
              </span>
            </a>
          </div>

          {/* ── Más experiencias, pronto ─────────────────────────── */}
          <div className="fi2 w-full max-w-md px-5 pb-6 text-center">
            <p className="text-white/35 text-xs leading-relaxed">
              Estamos construyendo más experiencias de autoconocimiento. Cuando estén listas, las
              vas a encontrar acá también.
            </p>
          </div>

          {/* ── Trust strip ───────────────────────────────────────── */}
          <div className="fi3 w-full max-w-2xl px-5 pb-10">
            <div
              className="rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-center gap-5"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              {[
                { icon: "🌎", label: "Uruguay" },
                { icon: "⚡", label: "Entrega en menos de 15 min" },
                { icon: "🔒", label: "Pago seguro vía MP" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-white/45">
                  <span style={{ fontSize: "12px" }}>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
