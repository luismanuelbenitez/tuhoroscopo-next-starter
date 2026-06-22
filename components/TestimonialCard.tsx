interface TestimonialCardProps {
  name: string;
  city: string;
  quote: string;
}

function AvatarInitial({ name }: { name: string }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="24" fill="rgba(255,255,255,0.05)" />
      <circle cx="24" cy="24" r="23.5" fill="none" stroke="rgba(255,255,255,0.12)" />
      <text
        x="24" y="30"
        textAnchor="middle"
        fontSize="19"
        fontWeight="600"
        fill="rgba(255,255,255,0.65)"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {name.charAt(0).toUpperCase()}
      </text>
    </svg>
  );
}

export default function TestimonialCard({ name, city, quote }: TestimonialCardProps) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Estrellas */}
      <div className="flex gap-0.5" aria-label="5 estrellas">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ color: "rgba(251,191,36,0.60)", fontSize: 10 }}>✦</span>
        ))}
      </div>

      {/* Quote */}
      <p className="text-white/70 text-sm leading-relaxed italic flex-1">
        &ldquo;{quote}&rdquo;
      </p>

      {/* Author */}
      <div
        className="flex items-center gap-3 pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <AvatarInitial name={name} />
        <div>
          <p className="text-white/90 text-xs font-semibold leading-snug">{name}</p>
          <p className="text-white/40 text-xs">{city}</p>
        </div>
      </div>
    </div>
  );
}
