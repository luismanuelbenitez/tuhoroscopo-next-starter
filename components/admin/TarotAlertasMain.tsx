"use client";
import { useState } from "react";
import { TarotAlertasEventos } from "@/components/admin/TarotAlertasEventos";
import { TarotAlertasConfig }  from "@/components/admin/TarotAlertasConfig";

type Tab = "eventos" | "configuracion";

const TABS: { key: Tab; label: string }[] = [
  { key: "eventos",       label: "Eventos"       },
  { key: "configuracion", label: "Configuración" },
];

export function TarotAlertasMain() {
  const [tab, setTab] = useState<Tab>("eventos");

  return (
    <main className="px-6 py-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-100">Centro de Alertas Operativas</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Eventos del backend en tiempo real. La campana muestra eventos no leídos.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0 mb-6 border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "text-amber-400 border-amber-500"
                : "text-gray-500 border-transparent hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "eventos"       && <TarotAlertasEventos />}
      {tab === "configuracion" && <TarotAlertasConfig  />}
    </main>
  );
}
