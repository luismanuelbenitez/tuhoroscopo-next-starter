import { AdminHub } from "@/components/admin/AdminHub";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminPage() {
  return (
    <AdminShell>
      <AdminHub />
    </AdminShell>
  );
}
