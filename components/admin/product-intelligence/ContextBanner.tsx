import { AlertCircle, Info, AlertTriangle } from "lucide-react";

type Variant = "info" | "warning" | "critical" | "readonly";

const STYLES: Record<Variant, { wrapper: string; icon: string; Icon: typeof Info }> = {
  info:     { wrapper: "border-blue-800/50 bg-blue-950/30",   icon: "text-blue-400",   Icon: Info },
  warning:  { wrapper: "border-amber-800/50 bg-amber-950/20", icon: "text-amber-400",  Icon: AlertTriangle },
  critical: { wrapper: "border-red-800/50 bg-red-950/40",     icon: "text-red-400",    Icon: AlertCircle },
  readonly: { wrapper: "border-gray-800/40 bg-gray-900/30",   icon: "text-gray-500",   Icon: Info },
};

export function ContextBanner({
  variant = "info",
  children,
  className = "",
}: {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}) {
  const s = STYLES[variant];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${s.wrapper} ${className}`}>
      <s.Icon size={15} className={`mt-0.5 shrink-0 ${s.icon}`} />
      <div className="text-gray-300 leading-relaxed">{children}</div>
    </div>
  );
}
