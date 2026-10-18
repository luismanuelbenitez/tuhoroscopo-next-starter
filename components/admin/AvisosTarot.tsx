"use client";
import { useCallback, useState } from "react";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { usePollingRefresh } from "@/lib/usePollingRefresh";

// Avisos importantes arriba del panel de Tarot (modo de cobro, destinos y
// tope diario de WhatsApp). Datos de /api/admin/tarot/avisos.
interface Aviso { nivel: "info" | "atencion" | "critico"; titulo: string; detalle: string }

const ESTILO = {
  info: { cls: "border-gray-800 bg-gray-900/50 text-gray-300", Icon: Info, icono: "text-sky-400" },
  atencion: { cls: "border-amber-800/60 bg-amber-950/30 text-amber-200", Icon: AlertTriangle, icono: "text-amber-400" },
  critico: { cls: "border-red-800/60 bg-red-950/40 text-red-200", Icon: OctagonAlert, icono: "text-red-400" },
} as const;

export function AvisosTarot() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/tarot/avisos", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setAvisos(j.avisos);
    } catch { /* silencioso: es informativo */ }
  }, []);
  usePollingRefresh(cargar);

  if (avisos.length === 0) return null;
  return (
    <section aria-label="Avisos importantes" className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Avisos importantes</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {avisos.map((a) => {
          const e = ESTILO[a.nivel];
          return (
            <div key={a.titulo} className={`flex gap-2.5 rounded-lg border px-3.5 py-3 ${e.cls}`}>
              <e.Icon size={16} className={`shrink-0 mt-0.5 ${e.icono}`} />
              <div>
                <p className="text-sm font-semibold">{a.titulo}</p>
                <p className="text-xs opacity-80 mt-0.5 leading-snug">{a.detalle}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
