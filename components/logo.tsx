import Link from "next/link";

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 hover:opacity-85 transition-opacity ${className ?? ""}`}>
      <svg width="28" height="28" viewBox="0 0 52 52" fill="none" aria-hidden="true">
        <polygon
          points="26,4 32.4,15 45,15 38.7,26 45,37 32.4,37 26,48 19.6,37 7,37 13.3,26 7,15 19.6,15"
          stroke="rgba(167,139,250,0.55)"
          strokeWidth="1.5"
        />
        <path
          d="M 21 7 A 5.5 5.5 0 0 1 31 7"
          stroke="rgba(251,191,36,0.65)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <ellipse cx="26" cy="26" rx="9" ry="5.5" stroke="rgba(167,139,250,0.95)" strokeWidth="1.6" />
        <circle cx="26" cy="26" r="3" fill="rgba(167,139,250,0.9)" />
        <circle cx="25" cy="25" r="1" fill="white" opacity="0.55" />
      </svg>

      <div className="leading-tight">
        <span className="block text-base md:text-lg font-extrabold tracking-widest text-white" style={{ letterSpacing: "0.18em" }}>
          TU ORÁCULO
        </span>
      </div>
    </Link>
  );
}
