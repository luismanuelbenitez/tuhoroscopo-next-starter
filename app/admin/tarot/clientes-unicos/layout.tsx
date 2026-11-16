import { ClientesUnicosSidebar } from "@/components/admin/clientes-unicos/ClientesUnicosSidebar";
import { SolapasSeccion } from "@/components/admin/SolapasSeccion";

export default function ClientesUnicosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <ClientesUnicosSidebar />
      <div className="flex-1 min-w-0 overflow-x-hidden">
        {/* Solapas de la sección (menú del Admin, 2026-11-16). */}
        <SolapasSeccion />
        {children}
      </div>
    </div>
  );
}
