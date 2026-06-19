import { LogoIcon } from "@/components/logo-icon";

export const metadata = {
  title: "Tu Oráculo",
  robots: "noindex,nofollow",
};

export default function MantenimientoPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;background:#07051a;font-family:'Inter',sans-serif;color:#e8e0f0;overflow:hidden}
        header,footer{display:none!important}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes pulse-glow{0%,100%{filter:drop-shadow(0 0 10px rgba(139,92,246,.3))}50%{filter:drop-shadow(0 0 24px rgba(139,92,246,.6))}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes twinkle{0%,100%{opacity:.12}50%{opacity:.55}}
        .star{position:absolute;border-radius:50%;background:#fff;animation:twinkle var(--d,3s) var(--delay,0s) infinite ease-in-out}
      `}</style>

      <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>

        {/* Stars */}
        {[
          { w:2,h:2,top:"8%",left:"12%",d:"4s",delay:"0s" },
          { w:1,h:1,top:"15%",left:"75%",d:"3s",delay:"1s" },
          { w:2,h:2,top:"22%",left:"45%",d:"5s",delay:"0.5s" },
          { w:1,h:1,top:"35%",left:"88%",d:"3.5s",delay:"2s" },
          { w:2,h:2,top:"65%",left:"8%",d:"4.5s",delay:"0.8s" },
          { w:1,h:1,top:"72%",left:"60%",d:"3s",delay:"1.5s" },
          { w:2,h:2,top:"80%",left:"30%",d:"4s",delay:"0.3s" },
          { w:1,h:1,top:"88%",left:"82%",d:"5s",delay:"1.2s" },
          { w:2,h:2,top:"50%",left:"93%",d:"3.5s",delay:"2.5s" },
          { w:1,h:1,top:"42%",left:"3%",d:"4s",delay:"0.7s" },
          { w:1,h:1,top:"28%",left:"20%",d:"3.2s",delay:"1.8s" },
          { w:1,h:1,top:"58%",left:"52%",d:"4.2s",delay:"0.9s" },
        ].map((s, i) => (
          <div
            key={i}
            className="star"
            style={{ width: s.w, height: s.h, top: s.top, left: s.left, "--d": s.d, "--delay": s.delay } as React.CSSProperties}
          />
        ))}

        {/* Ambient glow — da profundidad sin recargar */}
        <div style={{
          position: "absolute",
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 65%)",
          pointerEvents: "none",
        }} />

        {/* Contenido central */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "2rem", maxWidth: 480, textAlign: "center", animation: "fadeUp .65s ease both" }}>

          {/* Isotipo */}
          <div style={{ animation: "float 4.5s ease-in-out infinite, pulse-glow 4.5s ease-in-out infinite" }}>
            <LogoIcon size={92} />
          </div>

          {/* Marca + títulos */}
          <div style={{ animation: "fadeUp .65s .1s ease both" }}>
            <p style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(196,181,253,0.45)", marginBottom: 16 }}>
              Tu Oráculo
            </p>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "clamp(2rem,6vw,2.8rem)",
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.15,
              marginBottom: 16,
              letterSpacing: "0.01em",
            }}>
              Estamos preparando<br />algo nuevo
            </h1>
            <p style={{ fontSize: "0.92rem", color: "rgba(196,181,253,0.55)", lineHeight: 1.7 }}>
              Volvemos en breve con una experiencia renovada.
            </p>
          </div>

          {/* Separador */}
          <div style={{
            width: 56,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.45), transparent)",
            animation: "fadeUp .65s .2s ease both",
          }} />

          {/* Contacto */}
          <p style={{ fontSize: "0.82rem", color: "rgba(196,181,253,0.45)", animation: "fadeUp .65s .3s ease both", letterSpacing: "0.02em" }}>
            Consultas:{" "}
            <a
              href="mailto:hola@tuoraculo.uy"
              style={{ color: "rgba(196,181,253,0.85)", textDecoration: "none", borderBottom: "1px solid rgba(196,181,253,0.2)" }}
            >
              hola@tuoraculo.uy
            </a>
          </p>

        </div>
      </div>
    </>
  );
}
