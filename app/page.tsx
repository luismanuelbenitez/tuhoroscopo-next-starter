"use client";

const YEAR = new Date().getFullYear();

function FeatureItem({ color, text }: { color: string; text: string }) {
  return (
    <li className="flex items-center gap-2 text-xs text-white/40">
      <span style={{ color, fontSize: "9px" }}>✦</span>
      {text}
    </li>
  );
}

export default function HomePage() {
  return (
    <>
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

        .prod-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .prod-card:hover { transform: translateY(-4px); }
      `}</style>

      <div
        className="min-h-screen text-white flex flex-col"
        style={{ background: "linear-gradient(180deg, #100823 0%, #0d0820 55%, #0a0718 100%)" }}
      >
        {/* top radial glow */}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 h-80"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(88,28,180,0.18), transparent)", zIndex: 0 }}
        />

        <div className="relative flex-1 flex flex-col items-center" style={{ zIndex: 1 }}>

          {/* ── Brand mark ──────────────────────────────────────── */}
          <div className="fi1 text-center pt-14 pb-2 px-4">
            <div className="inline-flex items-center justify-center mb-5">
              <svg width="56" height="56" viewBox="0 0 52 52" fill="none">
                <polygon
                  points="26,4 32.4,15 45,15 38.7,26 45,37 32.4,37 26,48 19.6,37 7,37 13.3,26 7,15 19.6,15"
                  stroke="rgba(167,139,250,0.40)"
                  strokeWidth="1.2"
                />
                <path
                  d="M 21 7 A 5.5 5.5 0 0 1 31 7"
                  stroke="rgba(251,191,36,0.60)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <ellipse cx="26" cy="26" rx="9" ry="5.5" stroke="rgba(167,139,250,0.9)" strokeWidth="1.5" />
                <circle cx="26" cy="26" r="3" fill="rgba(167,139,250,0.85)" />
                <circle cx="25" cy="25" r="1" fill="white" opacity="0.55" />
              </svg>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white uppercase mb-2" style={{ letterSpacing: "0.22em" }}>
              Tu Oráculo
            </h1>
            <p className="text-violet-300/60 text-[10px] uppercase mb-5" style={{ letterSpacing: "0.28em" }}>
              Guía personalizada · WhatsApp
            </p>
            <p className="text-white/45 text-sm max-w-[260px] mx-auto leading-relaxed">
              Dos experiencias para conectar con tu guía interior.
            </p>
          </div>

          {/* divider */}
          <div className="w-10 h-px my-8" style={{ background: "rgba(167,139,250,0.2)" }} />

          {/* ── Product cards ────────────────────────────────────── */}
          <div className="fi2 w-full max-w-2xl px-5 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Horóscopo */}
              <a
                href="/horoscopo"
                className="prod-card rounded-2xl p-6 flex flex-col"
                style={{
                  background: "rgba(88,28,180,0.10)",
                  border: "1px solid rgba(139,92,246,0.22)",
                  boxShadow: "0 2px 32px rgba(88,28,180,0.12)",
                  textDecoration: "none",
                }}
              >
                <span className="text-4xl mb-3 block">✨</span>
                <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-1 block">
                  Suscripción mensual
                </span>
                <h2 className="text-lg font-extrabold text-white mb-2">Horóscopo diario</h2>
                <p className="text-white/50 text-sm leading-relaxed flex-1 mb-5">
                  Cada mañana tu guía personalizada: horóscopo por signo, foco del día, número y color de la suerte — directo a WhatsApp.
                </p>
                <ul className="space-y-1.5 mb-6">
                  <FeatureItem color="rgba(167,139,250,0.7)" text="Por signo astral" />
                  <FeatureItem color="rgba(167,139,250,0.7)" text="Lunes a viernes" />
                  <FeatureItem color="rgba(167,139,250,0.7)" text="Sin apps" />
                </ul>
                <span
                  className="block w-full text-center py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)", boxShadow: "0 4px 18px rgba(109,40,217,0.35)" }}
                >
                  Ver planes →
                </span>
              </a>

              {/* Tarot */}
              <a
                href="/tarot"
                className="prod-card rounded-2xl p-6 flex flex-col"
                style={{
                  background: "rgba(120,80,0,0.10)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  boxShadow: "0 2px 32px rgba(120,80,0,0.10)",
                  textDecoration: "none",
                }}
              >
                <span className="text-4xl mb-3 block">🃏</span>
                <span className="text-[10px] font-semibold text-amber-500/80 uppercase tracking-widest mb-1 block">
                  Pago único
                </span>
                <h2 className="text-lg font-extrabold text-white mb-2">Lectura de tarot</h2>
                <p className="text-white/50 text-sm leading-relaxed flex-1 mb-5">
                  Tirada de 5 cartas generada con IA para tu pregunta. Lectura narrativa completa enviada por WhatsApp en minutos.
                </p>
                <ul className="space-y-1.5 mb-6">
                  <FeatureItem color="rgba(251,191,36,0.6)" text="Para tu consulta específica" />
                  <FeatureItem color="rgba(251,191,36,0.6)" text="Entrega en menos de 15 min" />
                  <FeatureItem color="rgba(251,191,36,0.6)" text="Sin suscripción" />
                </ul>
                <span
                  className="block w-full text-center py-3 rounded-xl text-sm font-bold"
                  style={{
                    background: "rgba(120,80,0,0.45)",
                    border: "1px solid rgba(251,191,36,0.22)",
                    color: "rgba(251,191,36,0.95)",
                  }}
                >
                  Consultar →
                </span>
              </a>

            </div>
          </div>

          {/* ── Social proof strip ────────────────────────────────── */}
          <div className="fi3 w-full max-w-2xl px-5 pb-12">
            <div
              className="rounded-2xl px-5 py-4 flex flex-wrap items-center justify-center gap-6"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {[
                { emoji: "🌎", label: "Uruguay y LATAM" },
                { emoji: "⚡", label: "Entrega inmediata" },
                { emoji: "🔒", label: "Pago seguro vía MP" },
              ].map(({ emoji, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-white/40">
                  <span>{emoji}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Minimal footer ─────────────────────────────────────── */}
        <p className="text-center text-xs pb-6" style={{ color: "rgba(255,255,255,0.18)" }}>
          © {YEAR} Tu Oráculo · tuoraculo.uy
        </p>
      </div>
    </>
  );
}
