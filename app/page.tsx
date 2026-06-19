"use client";

import { LogoIcon } from "@/components/logo-icon";

const YEAR = new Date().getFullYear();

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
    <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(167,139,250,0.85)" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A8.942 8.942 0 0 0 12 3z" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg width="32" height="32" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <polygon
        points="19,2 23.2,13.5 35.5,13.5 26,21.5 29.5,33 19,26 8.5,33 12,21.5 2.5,13.5 14.8,13.5"
        fill="rgba(212,175,55,0.88)"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Cormorant Garamond solo para display */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&display=swap');`}</style>

      <style jsx global>{`
        body {
          background-image: none !important;
          background-color: #0a0718 !important;
        }
        body::before { display: none !important; }
        header { display: none !important; }
        footer  { display: none !important; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fi1 { animation: fadeUp 0.55s ease both; }
        .fi2 { animation: fadeUp 0.55s 0.14s ease both; }
        .fi3 { animation: fadeUp 0.55s 0.28s ease both; }

        .prod-card { transition: transform 0.22s ease, box-shadow 0.22s ease; }
        .prod-card:hover { transform: translateY(-5px); }
        .card-suscripcion:hover { box-shadow: 0 14px 44px rgba(88,28,180,0.30) !important; }
        .card-tarot:hover { box-shadow: 0 14px 44px rgba(180,130,0,0.26) !important; }
      `}</style>

      <div
        className="min-h-screen text-white flex flex-col"
        style={{ background: "linear-gradient(175deg, #110926 0%, #0d0820 50%, #0a0718 100%)" }}
      >
        {/* Radial glow superior */}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-96"
          style={{ background: "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(88,28,180,0.22), transparent)", zIndex: 0 }}
        />
        {/* Acento dorado inferior-derecho muy sutil */}
        <div
          className="pointer-events-none fixed bottom-0 right-0"
          style={{ width: 320, height: 320, background: "radial-gradient(circle at 100% 100%, rgba(120,80,0,0.07), transparent)", zIndex: 0 }}
        />

        <div className="relative flex-1 flex flex-col items-center" style={{ zIndex: 1 }}>

          {/* ── Marca ─────────────────────────────────────────────── */}
          <div className="fi1 text-center pt-14 pb-2 px-4">

            {/* Isotipo con halo ambiental */}
            <div className="inline-flex items-center justify-center mb-6 relative">
              <div style={{
                position: "absolute",
                width: 150,
                height: 150,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 65%)",
                pointerEvents: "none",
              }} />
              <LogoIcon maskId="hero-moon" size={80} />
            </div>

            <h1
              className="text-white uppercase mb-2"
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 700,
                fontSize: "clamp(2rem, 5.5vw, 2.8rem)",
                letterSpacing: "0.24em",
                lineHeight: 1,
              }}
            >
              Tu Oráculo
            </h1>
            <p className="text-violet-300/55 text-[10px] uppercase mb-6" style={{ letterSpacing: "0.28em" }}>
              Guía personalizada · WhatsApp
            </p>
            <p className="text-white/60 text-sm max-w-xs mx-auto leading-relaxed">
              Dos experiencias para conectar con tu guía interior.
            </p>
          </div>

          {/* Separador */}
          <div className="my-8" style={{ width: 60, height: 1, background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.35), transparent)" }} />

          {/* ── Cards de producto ─────────────────────────────────── */}
          <div className="fi2 w-full max-w-2xl px-5 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

              {/* Horóscopo */}
              <a
                href="/horoscopo"
                className="prod-card card-suscripcion rounded-2xl flex flex-col"
                style={{
                  background: "linear-gradient(160deg, rgba(88,28,180,0.14) 0%, rgba(55,20,120,0.07) 100%)",
                  border: "1px solid rgba(139,92,246,0.25)",
                  boxShadow: "0 4px 36px rgba(88,28,180,0.15), inset 0 1px 0 rgba(167,139,250,0.12)",
                  textDecoration: "none",
                  padding: "1.5rem",
                }}
              >
                <div className="mb-4"><IconMoon /></div>
                <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-2 block">
                  Suscripción mensual
                </span>
                <h2 className="text-xl font-extrabold text-white mb-3">Horóscopo diario</h2>
                <p className="text-white/55 text-sm leading-relaxed flex-1 mb-5">
                  Cada mañana tu guía personalizada: horóscopo por signo, foco del día, número y color de la suerte — directo a WhatsApp.
                </p>
                <ul className="space-y-2 mb-6">
                  <FeatureItem color="rgba(167,139,250,0.75)" text="Por signo astral" />
                  <FeatureItem color="rgba(167,139,250,0.75)" text="Lunes a viernes" />
                  <FeatureItem color="rgba(167,139,250,0.75)" text="Sin apps" />
                </ul>
                <span
                  className="block w-full text-center py-3.5 rounded-xl text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                    boxShadow: "0 4px 20px rgba(109,40,217,0.40)",
                    letterSpacing: "0.02em",
                  }}
                >
                  Ver planes →
                </span>
              </a>

              {/* Tarot */}
              <a
                href="/tarot"
                className="prod-card card-tarot rounded-2xl flex flex-col"
                style={{
                  background: "linear-gradient(160deg, rgba(120,80,0,0.13) 0%, rgba(80,50,0,0.06) 100%)",
                  border: "1px solid rgba(212,175,55,0.20)",
                  boxShadow: "0 4px 36px rgba(120,80,0,0.12), inset 0 1px 0 rgba(212,175,55,0.10)",
                  textDecoration: "none",
                  padding: "1.5rem",
                }}
              >
                <div className="mb-4"><IconStar /></div>
                <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-widest mb-2 block">
                  Pago único
                </span>
                <h2 className="text-xl font-extrabold text-white mb-3">Lectura de tarot</h2>
                <p className="text-white/55 text-sm leading-relaxed flex-1 mb-5">
                  Tirada de 5 cartas generada con IA para tu pregunta. Lectura narrativa completa enviada por WhatsApp en minutos.
                </p>
                <ul className="space-y-2 mb-6">
                  <FeatureItem color="rgba(212,175,55,0.70)" text="Para tu consulta específica" />
                  <FeatureItem color="rgba(212,175,55,0.70)" text="Entrega en menos de 15 min" />
                  <FeatureItem color="rgba(212,175,55,0.70)" text="Sin suscripción" />
                </ul>
                <span
                  className="block w-full text-center py-3.5 rounded-xl text-sm font-bold"
                  style={{
                    background: "linear-gradient(135deg, rgba(212,175,55,0.92), rgba(180,140,30,0.88))",
                    color: "#1a0f00",
                    boxShadow: "0 4px 20px rgba(180,140,0,0.30)",
                    letterSpacing: "0.02em",
                  }}
                >
                  Consultar →
                </span>
              </a>

            </div>
          </div>

          {/* ── Social proof ─────────────────────────────────────── */}
          <div className="fi3 w-full max-w-2xl px-5 pb-12">
            <div
              className="rounded-2xl px-5 py-4 flex flex-wrap items-center justify-center gap-6"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              {[
                { icon: "🌎", label: "Uruguay y LATAM" },
                { icon: "⚡", label: "Entrega inmediata" },
                { icon: "🔒", label: "Pago seguro vía MP" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-white/50">
                  <span style={{ fontSize: "13px" }}>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <p className="text-center text-xs pb-6" style={{ color: "rgba(255,255,255,0.18)" }}>
          © {YEAR} Tu Oráculo · tuoraculo.uy
        </p>
      </div>
    </>
  );
}
