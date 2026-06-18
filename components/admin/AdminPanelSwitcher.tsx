"use client";
import { Home, MessageCircle, Wand2 } from "lucide-react";

interface Props {
  current: "hub" | "thc" | "ttc";
}

export function AdminPanelSwitcher({ current }: Props) {
  return (
    <div className="flex items-center gap-1">
      <a
        href="/admin"
        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
          current === "hub" ? "text-violet-300" : "text-gray-600 hover:text-gray-400"
        }`}
        title="Panel Global"
      >
        <Home size={16} className={current === "hub" ? "text-violet-400" : "text-gray-700"} />
      </a>
      <div className="w-px h-6 bg-gray-800 mx-0.5" />
      <a
        href="/admin/horoscopo"
        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors ${
          current === "thc" ? "text-white" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        <MessageCircle
          size={18}
          className={current === "thc" ? "text-violet-400" : "text-gray-600"}
        />
        <div>
          <p className="text-sm font-semibold leading-tight">Horóscopo</p>
          <p className="text-xs text-gray-500 leading-tight">Tu Oráculo · THC</p>
        </div>
      </a>
      <div className="w-px h-8 bg-gray-800 mx-1" />
      <a
        href="/admin/tarot"
        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors ${
          current === "ttc" ? "text-white" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        <Wand2
          size={18}
          className={current === "ttc" ? "text-amber-400" : "text-gray-600"}
        />
        <div>
          <p className="text-sm font-semibold leading-tight">Tarot</p>
          <p className="text-xs text-gray-500 leading-tight">Tu Oráculo · TTC</p>
        </div>
      </a>
    </div>
  );
}
