interface LogoIconProps {
  size?: number;
  maskId: string;
  color?: string;
}

export function LogoIcon({ size = 40, maskId, color = "#D4AF37" }: LogoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <defs>
        <mask id={maskId}>
          <rect width="200" height="200" fill="white" />
          {/* Círculo interior que "muerde" la luna y crea la forma creciente */}
          <circle cx="108" cy="100" r="62" fill="black" />
        </mask>
      </defs>

      {/* Luna creciente — forma sólida, apertura hacia la derecha */}
      <circle cx="78" cy="100" r="83" fill={color} mask={`url(#${maskId})`} />

      {/* Ojo — párpado superior (más curvo y grueso) */}
      <path
        d="M 50 88 C 70 65, 142 65, 162 88"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Ojo — párpado inferior (más suave) */}
      <path
        d="M 50 88 C 70 108, 142 108, 162 88"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Iris */}
      <circle cx="106" cy="88" r="13.5" stroke={color} strokeWidth="4.5" fill="none" />

      {/* Pupila */}
      <circle cx="106" cy="88" r="5.5" fill={color} />

      {/* Rayos sobre el ojo — de centro hacia afuera, decrecientes */}
      <line x1="106" y1="70" x2="106" y2="53" stroke={color} strokeWidth="4.5" strokeLinecap="round" />
      <line x1="91"  y1="72" x2="84"  y2="56" stroke={color} strokeWidth="4"   strokeLinecap="round" />
      <line x1="78"  y1="77" x2="68"  y2="64" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      <line x1="121" y1="72" x2="128" y2="56" stroke={color} strokeWidth="4"   strokeLinecap="round" />
      <line x1="134" y1="77" x2="144" y2="64" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
