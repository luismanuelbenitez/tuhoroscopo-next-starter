// 2026-11-09: el panel se arma siempre en cada visita (como antes). Hasta
// ahora lo forzaba headers() en el layout raíz; al sacarlo para que las
// páginas de marketing queden pregeneradas, el panel lo declara acá.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
