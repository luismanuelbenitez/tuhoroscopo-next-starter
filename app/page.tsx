"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { LogoIcon } from "@/components/logo-icon";
import { usePrecioTarot } from "@/lib/usePrecioTarot";
import { CelularMock } from "@/components/tarot/Mockups";
import {
  Sparkles, ShieldCheck, Zap, Smartphone, MessageCircle, MapPin,
  ClipboardList, CreditCard,
} from "lucide-react";

const GOLD = "#F0C55A";
const CTA_GRADIENT = "linear-gradient(135deg, #c8980e 0%, #FFCE4D 60%, #e8bc3a 100%)";

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route<string>} className="text-[13px] text-white/65 hover:text-white transition-colors">
      {children}
    </Link>
  );
}

function CtaButton({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href as Route<string>}
      className={`inline-block rounded-xl text-center font-bold ${className}`}
      style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 4px 20px rgba(240,197,90,0.30)" }}
    >
      {children}
    </Link>
  );
}

export default function HomePage() {
  const precioTarot = usePrecioTarot();

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap');

        body { background-image: none !important; background-color: #0b0818 !important; }
        body::before { display: none !important; }
        header { display: none !important; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .fi1 { animation: fadeUp 0.5s ease both; }
        .fi2 { animation: fadeUp 0.5s 0.12s ease both; }
        .fi3 { animation: fadeUp 0.5s 0.24s ease both; }

        .home-carta { border-radius: 8px; box-shadow: 0 14px 32px rgba(0,0,0,0.55); }
        .home-carta-l { transform: rotate(-8deg); }
        .home-carta-r { transform: rotate(7deg); }

        .hero-visual {
          background-image: url(/img/home/hero-escena.webp);
          background-size: cover;
          background-position: 30% center;
        }
        @media (min-width: 768px) {
          .hero-visual { background-position: center; }
        }

        @media (prefers-reduced-motion: reduce) {
          .fi1, .fi2, .fi3 { animation: none; }
        }
      `}</style>

      <div
        className="min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)" }}
      >
        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-20 flex items-center justify-between px-4 md:px-10 py-3"
          style={{ background: "rgba(11,8,24,0.78)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <LogoIcon size={30} />
            <span
              className="hidden sm:inline text-[13px] font-bold tracking-[0.22em] uppercase"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              Tu Oráculo
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-7">
            <NavLink href="/">Inicio</NavLink>
            <NavLink href="/#como-funciona">Cómo funciona</NavLink>
            <NavLink href="/faq">Preguntas</NavLink>
            <NavLink href="/contacto">Contacto</NavLink>
          </div>
          <CtaButton href="/tarot" className="text-[12px] px-4 py-2 rounded-full">
            Ver Tu Tirada →
          </CtaButton>
        </nav>

        {/* ── Hero ────────────────────────────────────────────── */}
        <section className="px-5 md:px-10 pt-10 md:pt-16 pb-10 max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div className="fi1">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Experiencias digitales de autoconocimiento
            </p>
            <h1
              className="mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: "clamp(2rem, 5vw, 3.1rem)", lineHeight: 1.1 }}
            >
              Tu espacio de guía,<br />claridad y autoconocimiento
            </h1>
            <p className="text-white/65 text-[15px] leading-relaxed mb-6 max-w-md">
              En Tu Oráculo creamos experiencias digitales de autoconocimiento. Hoy podés vivir{" "}
              <strong className="text-white/90">Tu Tirada Tarot</strong>: una lectura personalizada que
              te llega directo a tu WhatsApp, en menos de 15 minutos, estés donde estés en Uruguay.
            </p>
            <CtaButton href="/tarot" className="px-7 py-3.5 text-sm mb-8">
              Quiero mi tirada →
            </CtaButton>
            <div className="grid grid-cols-3 gap-4 max-w-sm">
              {[
                { Icon: Sparkles, label: "Más claridad", sub: "para tus decisiones" },
                { Icon: Zap, label: "Respuesta", sub: "en minutos" },
                { Icon: ShieldCheck, label: "100% privado", sub: "" },
              ].map(({ Icon, label, sub }) => (
                <div key={label} className="text-center">
                  <Icon size={18} style={{ color: GOLD, margin: "0 auto 6px" }} />
                  <p className="text-[11px] text-white/70 font-semibold leading-tight">{label}</p>
                  {sub && <p className="text-[10px] text-white/40">{sub}</p>}
                </div>
              ))}
            </div>
          </div>

          <div
            className="fi2 hero-visual relative rounded-3xl overflow-hidden"
            style={{ aspectRatio: "4 / 5" }}
          >
            <img
              src="/img/home/carta-la-estrella.webp"
              alt=""
              aria-hidden="true"
              className="home-carta home-carta-l hidden md:block"
              style={{ position: "absolute", left: "4%", bottom: "6%", width: "22%" }}
            />
            <img
              src="/img/home/carta-la-luna.webp"
              alt=""
              aria-hidden="true"
              className="home-carta home-carta-r hidden md:block"
              style={{ position: "absolute", left: "15%", bottom: "3%", width: "22%" }}
            />
            <CelularMock
              pantalla="whatsapp"
              alt="Mensaje de WhatsApp con tu tirada de tarot"
              style={{ position: "absolute", right: "10%", top: "12%", width: "34%" }}
              priority
            />
          </div>
        </section>

        {/* ── Producto destacado ──────────────────────────────── */}
        <section className="px-5 md:px-10 py-10 max-w-6xl mx-auto">
          <div
            className="fi3 rounded-3xl p-6 md:p-10 grid md:grid-cols-[200px,1fr] gap-8 items-center"
            style={{ background: "linear-gradient(160deg, rgba(130,88,0,0.16) 0%, rgba(80,50,0,0.06) 100%)", border: "1px solid rgba(240,197,90,0.28)" }}
          >
            <div className="relative mx-auto md:mx-0" style={{ width: 150, height: 180 }}>
              <img
                src="/img/home/carta-el-loco.webp"
                alt=""
                aria-hidden="true"
                className="home-carta home-carta-l"
                style={{ position: "absolute", left: 0, top: 10, width: 115 }}
              />
              <img
                src="/img/home/carta-la-estrella.webp"
                alt=""
                aria-hidden="true"
                className="home-carta home-carta-r"
                style={{ position: "absolute", left: 38, top: 0, width: 115 }}
              />
            </div>

            <div>
              <p
                className="inline-block text-[10px] font-bold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
                style={{ color: GOLD, background: "rgba(240,197,90,0.10)", border: "1px solid rgba(240,197,90,0.25)" }}
              >
                Producto destacado
              </p>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                <h2 className="text-2xl md:text-3xl font-extrabold">Tu Tirada Tarot</h2>
                <p className="text-xl font-bold" style={{ color: GOLD }}>
                  {precioTarot !== null ? `$U ${precioTarot}` : "Ver precio"}
                  <span className="font-normal text-xs text-white/40"> · pago único</span>
                </p>
              </div>
              <p className="text-[12px] uppercase tracking-wide text-white/40 mb-4">
                Una guía personalizada para tu momento actual
              </p>
              <p className="text-white/70 text-[15px] leading-relaxed mb-5 max-w-lg">
                Recibí una lectura de tarot clara, profunda y práctica, directo a tu WhatsApp, en menos
                de 15 minutos: una lectura online pensada para el celular y un PDF de 3 páginas para
                guardar.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
                {[
                  "Lectura personalizada",
                  "Interpretación clara y práctica",
                  "PDF de 3 páginas para guardar",
                  "Entrega por WhatsApp",
                  "Desde cualquier lugar de Uruguay",
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-white/65">
                    <span style={{ color: GOLD, fontSize: 9 }}>✦</span>{f}
                  </li>
                ))}
              </ul>
              <CtaButton href="/tarot" className="px-6 py-3 text-sm">
                Quiero mi tirada →
              </CtaButton>
            </div>
          </div>

          <p className="text-center text-white/35 text-xs mt-6">
            Estamos construyendo más experiencias de autoconocimiento. Cuando estén listas, las vas a
            encontrar acá también.
          </p>
        </section>

        {/* ── Cómo funciona ───────────────────────────────────── */}
        <section id="como-funciona" className="px-5 md:px-10 py-14 max-w-5xl mx-auto text-center scroll-mt-16">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
            Simple, rápido y desde tu celular
          </p>
          <h2 className="text-2xl md:text-3xl font-extrabold mb-10">¿Cómo funciona?</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { n: "1", Icon: ClipboardList, t: "Elegís tu tema", d: "Amor, trabajo, dinero, salud, o una consulta general." },
              { n: "2", Icon: CreditCard, t: "Pagás con Mercado Pago", d: "De forma segura, en minutos." },
              { n: "3", Icon: MessageCircle, t: "Recibís tu tirada", d: "Directo a tu WhatsApp." },
              { n: "4", Icon: Smartphone, t: "Vivís la experiencia", d: "Leelo a tu ritmo, cuando quieras." },
            ].map(({ n, Icon, t, d }) => (
              <div key={n}>
                <div
                  className="mx-auto mb-3 flex items-center justify-center rounded-full"
                  style={{ width: 52, height: 52, border: "1px solid rgba(240,197,90,0.35)" }}
                >
                  <Icon size={20} style={{ color: GOLD }} />
                </div>
                <p className="text-[11px] font-bold mb-1" style={{ color: GOLD }}>{n}</p>
                <p className="text-sm font-semibold mb-1">{t}</p>
                <p className="text-[12px] text-white/45 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Barra de confianza ──────────────────────────────── */}
        <section className="px-5 pb-14 max-w-3xl mx-auto">
          <div
            className="rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-center gap-5"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {[
              { Icon: MapPin, label: "Disponible en Uruguay" },
              { Icon: ShieldCheck, label: "Pago seguro" },
              { Icon: Zap, label: "Entrega rápida" },
              { Icon: Smartphone, label: "Pensado para el celular" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-white/45">
                <Icon size={13} style={{ color: GOLD }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
