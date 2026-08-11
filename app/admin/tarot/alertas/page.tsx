import { TarotAdminShell } from "@/components/admin/TarotAdminShell";
import { TarotAlertasConfig } from "@/components/admin/TarotAlertasConfig";

export const metadata = { title: "Alertas operativas · Tarot Admin" };

export default function TarotAlertasPage() {
  return (
    <TarotAdminShell>
      <TarotAlertasConfig />
    </TarotAdminShell>
  );
}
