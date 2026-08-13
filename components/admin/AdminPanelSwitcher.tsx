"use client";
import { Home, MessageCircle, Wand2 } from "lucide-react";

interface Props {
  current: "hub" | "thc" | "ttc";
  collapsed?: boolean;
}

const ITEMS = [
  {
    key:         "hub" as const,
    href:        "/admin",
    icon:        Home,
    label:       "Panel global",
    badge:       null,
    activeColor: "text-gray-300",
  },
  {
    key:         "thc" as const,
    href:        "/admin/horoscopo",
    icon:        MessageCircle,
    label:       "Horóscopo",
    badge:       "THC",
    activeColor: "text-violet-400",
  },
  {
    key:         "ttc" as const,
    href:        "/admin/tarot",
    icon:        Wand2,
    label:       "Tarot",
    badge:       "TTC",
    activeColor: "text-amber-400",
  },
];

export function AdminPanelSwitcher({ current, collapsed = false }: Props) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5 py-0.5">
        {ITEMS.map(({ key, href, icon: Icon, label, activeColor }) => {
          const isActive = current === key;
          return (
            <a
              key={key}
              href={href}
              title={label}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                isActive
                  ? `bg-gray-800 ${activeColor}`
                  : "text-gray-600 hover:text-gray-400 hover:bg-gray-900"
              }`}
            >
              <Icon size={15} />
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {ITEMS.map(({ key, href, icon: Icon, label, badge, activeColor }) => {
        const isActive = current === key;
        return (
          <a
            key={key}
            href={href}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${
              isActive
                ? "bg-gray-800/70 text-white"
                : "text-gray-500 hover:text-gray-200 hover:bg-gray-900"
            }`}
          >
            <Icon
              size={14}
              className={`shrink-0 ${isActive ? activeColor : "text-gray-600"}`}
            />
            <span className="text-xs font-medium flex-1 min-w-0 truncate">{label}</span>
            {badge && (
              <span className="text-[10px] font-mono text-gray-600 shrink-0">{badge}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
