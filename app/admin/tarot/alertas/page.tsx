import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotAlertasMain } from "@/components/admin/TarotAlertasMain";

export const metadata = { title: "Alertas operativas · Tarot Admin" };

export default function TarotAlertasPage() {
  return (
    <TarotAdminShell>
      <TarotAlertasMain />
    </TarotAdminShell>
  );
}
