import Link from "next/link";

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-3 hover:opacity-85 transition-opacity ${className ?? ""}`}>
      <svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        {/* Diamond frame — cuatro direcciones, el oráculo que todo lo ve */}
        <polygon
          points="24,3 45,24 24,45 3,24"
          stroke="rgba(139,92,246,0.5)"
          strokeWidth="2"
          fill="none"
        />
        {/* Ojo — almendra cerrada con relleno sutil para legibilidad en tamaño chico */}
        <path
          d="M 10 24 C 16 15, 32 15, 38 24 C 32 33, 16 33, 10 24 Z"
          fill="rgba(139,92,246,0.07)"
          stroke="rgba(196,181,253,0.92)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Iris */}
        <circle cx="24" cy="24" r="5.5" stroke="rgba(167,139,250,0.6)" strokeWidth="1.5" fill="none" />
        {/* Pupila */}
        <circle cx="24" cy="24" r="3" fill="rgba(139,92,246,1)" />
        {/* Reflejo especular */}
        <circle cx="22.5" cy="22.5" r="1.1" fill="rgba(255,255,255,0.7)" />
        {/* Acento dorado — ápex superior */}
        <circle cx="24" cy="3" r="2.2" fill="rgba(212,175,55,0.9)" />
      </svg>

      <div className="leading-none">
        <span
          className="block font-extrabold text-white"
          style={{ fontSize: "1rem", letterSpacing: "0.22em" }}
        >
          TU ORÁCULO
        </span>
      </div>
    </Link>
  );
}
