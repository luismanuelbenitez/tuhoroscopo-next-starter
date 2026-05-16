"use client";

const NAV_ITEMS = [
  { href: "/admin",                        label: "Dashboard" },
  { href: "/admin/suscriptores",           label: "Suscriptores" },
  { href: "/admin/mensajes-problematicos", label: "Mensajes" },
  { href: "/admin/contenido",              label: "Contenido" },
  { href: "/admin/suscripciones",          label: "Suscripciones" },
  { href: "/admin/cupones",                label: "Cupones" },
  { href: "/admin/logs",                   label: "Logs" },
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <>
      {NAV_ITEMS.map(({ href, label }) =>
        href === current ? (
          <span
            key={href}
            className="text-sm text-white border-b-2 border-violet-500 py-2.5 px-3 whitespace-nowrap"
          >
            {label}
          </span>
        ) : (
          <a
            key={href}
            href={href}
            className="text-sm text-gray-500 hover:text-gray-300 border-b-2 border-transparent py-2.5 px-3 transition-colors whitespace-nowrap"
          >
            {label}
          </a>
        )
      )}
    </>
  );
}
