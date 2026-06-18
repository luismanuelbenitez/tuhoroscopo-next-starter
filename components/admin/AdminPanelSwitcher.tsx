"use client";
import { MessageCircle, Wand2 } from "lucide-react";

interface Props {
  current: "thc" | "ttc";
}

export function AdminPanelSwitcher({ current }: Props) {
  return (
    <div className="flex items-center gap-1">
      <a
        href="/admin"
        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors ${
          current === "thc" ? "text-white" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        <MessageCircle
          size={20}
          className={current === "thc" ? "text-violet-400" : "text-gray-600"}
        />
        <div>
          <p className="text-sm font-semibold leading-tight">Panel THC</p>
          <p className="text-xs text-gray-500 leading-tight">Tu Oráculo · Horóscopo</p>
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
          size={20}
          className={current === "ttc" ? "text-amber-400" : "text-gray-600"}
        />
        <div>
          <p className="text-sm font-semibold leading-tight">Panel TTC</p>
          <p className="text-xs text-gray-500 leading-tight">Tu Oráculo · Tarot</p>
        </div>
      </a>
    </div>
  );
}
