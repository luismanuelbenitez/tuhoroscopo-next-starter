"use client";

import { LogoIcon } from "@/components/logo-icon";
import { usePrecioSuscripcion } from "@/lib/usePrecioSuscripcion";
import { usePrecioTarot } from "@/lib/usePrecioTarot";

const YEAR = new Date().getFullYear();
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? "";

function FeatureItem({ color, text }: { color: string; text: string }) {
  return (
    <li className="flex items-center gap-2.5 text-xs text-white/50">
      <span style={{ color, fontSize: "7px" }}>✦</span>
      {text}
    </li>
  );
}

function IconMoon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(167,139,250,0.85)" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A8.942 8.942 0 0 0 12 3z" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg width="28" height="28" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <polygon
        points="19,2 23.2,13.5 35.5,13.5 26,21.5 29.5,33 19,26 8.5,33 12,21.5 2.5,13.5 14.8,13.5"
        fill="rgba(212,175,55,0.92)"
      />
    </svg>
  );
}

export default function HomePage() {
  const precioHoro   = usePrecioSuscripcion();
  const precioTarot  = usePrecioTarot();

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&display=swap');`}</style>

      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0e0b22 !important;
        }
        body::before { display: none !important; }
        header { display: none !important; }
        footer  { display: none !important; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fi1 { animation: fadeUp 0.50s ease both; }
        .fi2 { animation: fadeUp 0.50s 0.12s ease both; }
        .fi3 { animation: fadeUp 0.50s 0.24s ease both; }

        .prod-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .prod-card:hover { transform: translateY(-4px); }
        .card-tarot:hover       { box-shadow: 0 14px 40px rgba(180,130,0,0.30)   !important; }
        .card-suscripcion:hover { box-shadow: 0 14px 40px rgba(88,28,180,0.28)   !important; }

        @media (prefers-reduced-motion: reduce) {
          .fi1, .fi2, .fi3 { animation: none; }
          .prod-card { transition: none; }
        }
      `}</style>

      <div
        className="min-h-screen text-white flex flex-col"
        style={{ background: "linear-gradient(180deg, #110927 0%, #0d0820 55%, #0e0b22 100%)" }}
      >
        {/* Glow sup violeta */}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-96"
          style={{ background: "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(88,28,180,0.22), transparent)", zIndex: 0 }}
        />
        {/* Acento dorado inf-der */}
        <div
          className="pointer-events-none fixed bottom-0 right-0"
          style={{ width: 320, height: 320, background: "radial-gradient(circle at 100% 100%, rgba(120,80,0,0.08), transparent)", zIndex: 0 }}
        />

        <div className="relative flex-1 flex flex-col items-center" style={{ zIndex: 1 }}>

          {/* ── Hero ──────────────────────────────────────────────── */}
          <div className="fi1 text-center pt-12 pb-2 px-4">

            <div className="inline-flex items-center justify-center mb-5 relative">
              <div style={{
                position: "absolute", width: 140, height: 140, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 65%)",
                pointerEvents: "none",
              }} />
              <LogoIcon size={72} />
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

            {/* Propuesta de valor directa */}
            <p className="text-white font-medium text-base mb-1.5 max-w-sm mx-auto leading-snug">
              Astrología y tarot personalizados por WhatsApp.
            </p>
            <p className="text-white/60 text-sm max-w-xs mx-auto leading-relaxed">
              Elegí tu guía diaria o hacé una consulta puntual.{" "}
              <span className="text-white/40">Sin apps. Pago seguro por Mercado Pago.</span>
            </p>
          </div>

          {/* Separador */}
          <div
            className="my-7"
            style={{ width: 52, height: 1, background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.35), transparent)" }}
          />

          {/* ── Cards ─────────────────────────────────────────────── */}
          {/*  Tarot primero: producto de pago único con mayor intención de compra  */}
          <div className="fi2 w-full max-w-2xl px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* ── Card Tarot (prioritaria) ── */}
              <a
                href="/tarot"
                className="prod-card card-tarot rounded-2xl flex flex-col"
                style={{
                  background: "linear-gradient(160deg, rgba(130,88,0,0.18) 0%, rgba(80,50,0,0.08) 100%)",
                  border: "1px solid rgba(212,175,55,0.32)",
                  boxShadow: "0 4px 36px rgba(120,80,0,0.18), inset 0 1px 0 rgba(212,175,55,0.14)",
                  textDecoration: "none",
                  padding: "1.375rem",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <IconStar />
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)", color: "rgba(212,175,55,0.85)" }}
                  >
                    Pago único
                  </span>
                </div>

                <h2 className="text-[1.05rem] font-extrabold text-white mb-1 leading-snug">
                  Lectura de tarot personalizada
                </h2>

                <p className="text-sm font-bold mb-3" style={{ color: "rgba(212,175,55,0.95)" }}>
                  $U {precioTarot}
                  <span className="font-normal text-xs" style={{ color: "rgba(212,175,55,0.50)" }}> · pago único</span>
                </p>

                <p className="text-white/55 text-sm leading-relaxed flex-1 mb-4">
                  Tirada de 5 cartas para tu pregunta real. Recibís un PDF premium por WhatsApp en menos de 15 minutos.
                </p>

                <ul className="space-y-1.5 mb-5">
                  <FeatureItem color="rgba(212,175,55,0.70)" text="Para tu consulta específica" />
                  <FeatureItem color="rgba(212,175,55,0.70)" text="Entrega en menos de 15 min" />
                  <FeatureItem color="rgba(212,175,55,0.70)" text="Sin suscripción" />
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
                  Consultar ahora →
                </span>
              </a>

              {/* ── Card Horóscopo ── */}
              <a
                href="/horoscopo"
                className="prod-card card-suscripcion rounded-2xl flex flex-col"
                style={{
                  background: "linear-gradient(160deg, rgba(88,28,180,0.14) 0%, rgba(55,20,120,0.07) 100%)",
                  border: "1px solid rgba(139,92,246,0.22)",
                  boxShadow: "0 4px 36px rgba(88,28,180,0.12), inset 0 1px 0 rgba(167,139,250,0.10)",
                  textDecoration: "none",
                  padding: "1.375rem",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <IconMoon />
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)", color: "rgba(167,139,250,0.80)" }}
                  >
                    Suscripción mensual
                  </span>
                </div>

                <h2 className="text-[1.05rem] font-extrabold text-white mb-1 leading-snug">
                  Horóscopo diario por WhatsApp
                </h2>

                <p className="text-sm font-bold text-violet-300 mb-3">
                  $U {precioHoro}
                  <span className="font-normal text-xs text-violet-300/50">/mes · IVA incluido</span>
                </p>

                <p className="text-white/55 text-sm leading-relaxed mb-1.5">
                  Cada mañana recibís tu signo, foco del día, número y color de la suerte.
                </p>

                {/* Timing — aclaración clave */}
                <p className="text-white/35 text-xs leading-relaxed flex-1 mb-4">
                  Al suscribirte recibís tu mensaje de bienvenida en minutos. Tu primera guía diaria llega a la mañana siguiente.
                </p>

                <ul className="space-y-1.5 mb-5">
                  <FeatureItem color="rgba(167,139,250,0.75)" text="Por signo astral" />
                  <FeatureItem color="rgba(167,139,250,0.75)" text="7 días a la semana" />
                  <FeatureItem color="rgba(167,139,250,0.75)" text="Sin apps" />
                </ul>

                <span
                  className="block w-full text-center py-3.5 rounded-xl text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                    boxShadow: "0 4px 18px rgba(109,40,217,0.38)",
                    letterSpacing: "0.015em",
                  }}
                >
                  Activar guía diaria →
                </span>
              </a>

            </div>
          </div>

          {/* ── Trust strip ───────────────────────────────────────── */}
          <div className="fi3 w-full max-w-2xl px-5 pb-5">
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
                { icon: "⚡", label: "Entrega inmediata" },
                { icon: "🔒", label: "Pago seguro vía MP" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-white/45">
                  <span style={{ fontSize: "12px" }}>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Lead magnet WhatsApp ──────────────────────────────── */}
          {WA_NUMBER && (
            <div className="w-full max-w-2xl px-5 pb-10">
              <div
                className="rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3"
                style={{
                  background: "rgba(255,255,255,0.018)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p className="text-white/55 text-sm text-center sm:text-left leading-relaxed">
                  ¿Querés probarlo primero?{" "}
                  <span className="text-white/80 font-medium">Recibí tu horóscopo de hoy gratis.</span>
                </p>
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=Quiero%20mi%20horoscopo%20gratis%20de%20hoy`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.13)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  Pedirlo por WhatsApp →
                </a>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <p className="text-center text-xs pb-5" style={{ color: "rgba(255,255,255,0.16)" }}>
          © {YEAR} Tu Oráculo · tuoraculo.uy
        </p>
      </div>
    </>
  );
}
