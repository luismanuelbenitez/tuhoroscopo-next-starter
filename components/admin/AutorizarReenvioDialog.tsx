"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/product-intelligence/ConfirmDialog";

interface SolicitudMin {
  id: string;
  canal: "whatsapp" | "email";
  orden_id: string;
  motivo_detalle: string | null;
  tarot_ordenes?: { external_reference: string | null; tarot_clientes?: { nombre_completo: string | null } | null } | null;
}

export function AutorizarReenvioDialog({
  solicitud,
  motivoLabel,
  onClose,
  onAutorizado,
}: {
  solicitud: SolicitudMin;
  motivoLabel: string;
  onClose: () => void;
  onAutorizado: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function autorizar() {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/tarot/entregas/solicitudes/${solicitud.id}/autorizar`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErrorMsg(json.detalle ?? json.motivo ?? `Error ${res.status}`);
        return;
      }
      onAutorizado();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error de red");
    }
  }

  const cliente = solicitud.tarot_ordenes?.tarot_clientes?.nombre_completo ?? "—";
  const ordenRef = solicitud.tarot_ordenes?.external_reference ?? solicitud.orden_id.slice(0, 8);
  const canalLabel = solicitud.canal === "whatsapp" ? "WhatsApp" : "Email";

  return (
    <ConfirmDialog
      open
      title="Autorizar reenvío"
      description={
        `Esta orden ya fue entregada por ${canalLabel}. Autorizar generará un nuevo envío al cliente.\n\n` +
        `Cliente: ${cliente}\nOrden: #${ordenRef}\nMotivo: ${motivoLabel}` +
        (solicitud.motivo_detalle ? ` — ${solicitud.motivo_detalle}` : "")
      }
      confirmLabel="Autorizar y reenviar"
      confirmClassName="bg-amber-700 hover:bg-amber-600"
      onConfirm={autorizar}
      onCancel={onClose}
    >
      {errorMsg && <p className="text-xs text-red-400 mt-2">{errorMsg}</p>}
    </ConfirmDialog>
  );
}
