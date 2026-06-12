"use client";

const NAV_ITEMS = [
  { href: "/admin/tarot",          label: "Dashboard", exact: true  },
  { href: "/admin/tarot/ordenes",  label: "Órdenes",   exact: false },
  { href: "/admin/tarot/clientes", label: "Clientes",  exact: false },
  { href: "/admin/tarot/lecturas", label: "Lecturas",  exact: false },
  { href: "/admin/tarot/pdfs",     label: "PDFs",      exact: false },
  { href: "/admin/tarot/pagos",    label: "Pagos",     exact: false },
  { href: "/admin/tarot/codigos",  label: "Cupones",   exact: false },
  { href: "/admin/tarot/logs",     label: "Logs",      exact: false },
  { href: "/admin/tarot/ingresos", label: "Ingresos",  exact: false },
  { href: "/admin/tarot/config",   label: "Config",    exact: false },
] as const;

export function TarotNav({ current }: { current: string }) {
  return (
    <>
      {NAV_ITEMS.map(({ href, label, exact }) => {
        const isActive = exact ? current === href : current.startsWith(href);
        return isActive ? (
          <span
            key={href}
            className="text-sm text-white border-b-2 border-amber-500 py-2.5 px-3 whitespace-nowrap"
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
        );
      })}
    </>
  );
}
