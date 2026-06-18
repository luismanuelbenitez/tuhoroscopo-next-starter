export const metadata = {
  title: "En mantenimiento — Tu Oráculo",
  robots: "noindex,nofollow",
};

export default function MantenimientoPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;background:#07051a;font-family:'Inter',sans-serif;color:#e8e0f0;overflow:hidden}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes pulse-glow{0%,100%{filter:drop-shadow(0 0 8px rgba(139,92,246,.35))}50%{filter:drop-shadow(0 0 20px rgba(139,92,246,.65))}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes twinkle{0%,100%{opacity:.15}50%{opacity:.6}}
        .star{position:absolute;border-radius:50%;background:#fff;animation:twinkle var(--d,3s) var(--delay,0s) infinite ease-in-out}
      `}</style>

      <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>

        {/* Stars background */}
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
        ].map((s, i) => (
          <div
            key={i}
            className="star"
            style={{ width: s.w, height: s.h, top: s.top, left: s.left, "--d": s.d, "--delay": s.delay } as React.CSSProperties}
          />
        ))}

        {/* Logo + content */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2rem", maxWidth: 480, textAlign: "center", animation: "fadeUp .6s ease both" }}>

          {/* Hexagram SVG */}
          <div style={{ animation: "float 4s ease-in-out infinite, pulse-glow 4s ease-in-out infinite" }}>
            <svg width="72" height="72" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <polygon
                points="26,4 32.4,15 45,15 38.7,26 45,37 32.4,37 26,48 19.6,37 7,37 13.3,26 7,15 19.6,15"
                fill="none"
                stroke="rgba(139,92,246,0.55)"
                strokeWidth="1.4"
              />
              <path
                d="M23 18 A6 6 0 0 0 29 18 A5 5 0 0 1 23 18Z"
                fill="rgba(196,181,253,0.5)"
              />
              <ellipse cx="26" cy="27" rx="4.5" ry="3" fill="none" stroke="rgba(196,181,253,0.6)" strokeWidth="1.2" />
              <circle cx="26" cy="27" r="1.4" fill="rgba(196,181,253,0.8)" />
            </svg>
          </div>

          {/* Brand */}
          <div style={{ animation: "fadeUp .6s .1s ease both" }}>
            <p style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,.5)", marginBottom: 8 }}>
              Tu Oráculo
            </p>
            <h1 style={{ fontSize: "clamp(1.6rem,5vw,2.4rem)", fontWeight: 800, color: "#fff", lineHeight: 1.1, marginBottom: 12 }}>
              Estamos en<br />mantenimiento
            </h1>
            <p style={{ fontSize: "0.95rem", color: "rgba(232,224,240,.55)", lineHeight: 1.65 }}>
              Estamos configurando algo nuevo.<br />
              Volvemos en breve.
            </p>
          </div>

          {/* Divider */}
          <div style={{ width: 40, height: 1, background: "rgba(139,92,246,.3)", animation: "fadeUp .6s .2s ease both" }} />

          {/* Contact */}
          <p style={{ fontSize: "0.8rem", color: "rgba(232,224,240,.3)", animation: "fadeUp .6s .3s ease both" }}>
            Consultas:{" "}
            <a
              href="mailto:hola@tuoraculo.uy"
              style={{ color: "rgba(196,181,253,.55)", textDecoration: "none" }}
            >
              hola@tuoraculo.uy
            </a>
          </p>

        </div>
      </div>
    </>
  );
}
