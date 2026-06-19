interface MetricaCardProps {
  valor: string | number;
  label: string;
  sub?: string;
  subAlerta?: boolean;
  esqueleto?: boolean;
}

export function MetricaCard({ valor, label, sub, subAlerta, esqueleto }: MetricaCardProps) {
  if (esqueleto) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-4 animate-pulse">
        <div className="h-7 w-16 bg-gray-800 rounded mb-2" />
        <div className="h-3 w-24 bg-gray-800 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-4">
      <p className="text-2xl font-bold text-gray-100 tabular-nums">{valor}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && (
        <p className={`text-xs mt-1.5 ${subAlerta ? "text-red-400" : "text-gray-600"}`}>{sub}</p>
      )}
    </div>
  );
}
