const CARDS = [
  { id: 'III', label: 'Pasado',    x: 80,  y: 0,   highlight: false },
  { id: 'II',  label: 'Obstáculo', x: 0,   y: 120, highlight: false },
  { id: 'I',   label: 'Situación', x: 80,  y: 120, highlight: true  },
  { id: 'IV',  label: 'Futuro',    x: 160, y: 120, highlight: false },
  { id: 'V',   label: 'Consejo',   x: 80,  y: 240, highlight: false },
];

export default function CardCross() {
  return (
    <div className="relative mx-auto" style={{ width: 230, height: 350 }}>
      {CARDS.map((card) => (
        <div
          key={card.id}
          className="absolute rounded-xl flex flex-col items-center justify-center gap-1"
          style={{
            left: card.x,
            top: card.y,
            width: 70,
            height: 110,
            background: 'linear-gradient(160deg, #2d1b69, #1a0f45, #0f0820)',
            border: `1px solid ${card.highlight ? 'rgba(251,191,36,0.55)' : 'rgba(251,191,36,0.22)'}`,
            boxShadow: card.highlight
              ? '0 0 28px rgba(251,191,36,0.22), 0 0 8px rgba(251,191,36,0.12)'
              : '0 2px 12px rgba(0,0,0,0.45)',
          }}
        >
          <span
            className="text-[10px] font-bold tracking-widest"
            style={{ color: card.highlight ? 'rgba(251,191,36,0.95)' : 'rgba(251,191,36,0.55)' }}
          >
            {card.id}
          </span>
          <span
            className="text-[11px] font-medium leading-none"
            style={{ color: card.highlight ? 'rgba(251,191,36,0.80)' : 'rgba(251,191,36,0.30)' }}
          >
            ✦
          </span>
          <span
            className="text-[9px] text-center leading-tight px-1"
            style={{ color: card.highlight ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)' }}
          >
            {card.label}
          </span>
        </div>
      ))}
    </div>
  );
}
