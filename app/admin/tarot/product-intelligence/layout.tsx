import { PIASidebar } from "@/components/admin/product-intelligence/PIASidebar";

export default function ProductIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <PIASidebar />
      <div className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
