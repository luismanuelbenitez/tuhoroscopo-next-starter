type Status = "ok" | "warning" | "error" | "pending" | "lab";

const DOT: Record<Status, string> = {
  ok:      "bg-emerald-500",
  warning: "bg-amber-500",
  error:   "bg-red-500",
  pending: "bg-gray-600",
  lab:     "bg-violet-500",
};

const TEXT: Record<Status, string> = {
  ok:      "text-emerald-400",
  warning: "text-amber-400",
  error:   "text-red-400",
  pending: "text-gray-500",
  lab:     "text-violet-400",
};

export function StatusDot({
  status,
  label,
  className = "",
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[status]}`} />
      {label && <span className={`text-xs ${TEXT[status]}`}>{label}</span>}
    </span>
  );
}
