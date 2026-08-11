export function KPICard({
  value,
  label,
  sub,
  valueClassName = "text-white",
  loading = false,
}: {
  value: string | number;
  label: string;
  sub?: string;
  valueClassName?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 flex flex-col gap-1">
      {loading ? (
        <div className="h-8 w-24 bg-gray-800 rounded animate-pulse" />
      ) : (
        <p className={`text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      )}
      <p className="text-xs text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}
