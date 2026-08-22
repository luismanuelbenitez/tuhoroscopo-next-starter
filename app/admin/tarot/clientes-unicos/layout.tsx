import { ClientesUnicosSidebar } from "@/components/admin/clientes-unicos/ClientesUnicosSidebar";

export default function ClientesUnicosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <ClientesUnicosSidebar />
      <div className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
