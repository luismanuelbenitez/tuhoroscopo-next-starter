import { HoroscopoAdminShell } from "@/components/admin/HoroscopoAdminShell";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata = { title: "Dashboard · Horóscopo Admin" };

export default function AdminHoroscopoPage() {
  return (
    <HoroscopoAdminShell>
      <AdminDashboard />
    </HoroscopoAdminShell>
  );
}
