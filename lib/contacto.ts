// Número de WhatsApp de soporte (formato internacional, solo dígitos) para
// los links wa.me. Se lee en el servidor: acepta NEXT_PUBLIC_WA_NUMBER o
// WA_NUMBER (así quedó cargada en Vercel, 2026-10-30). Vacío = sin WhatsApp.
export function numeroWhatsApp(): string {
  return (process.env.NEXT_PUBLIC_WA_NUMBER || process.env.WA_NUMBER || "").replace(/\D/g, "");
}

export function linkWhatsApp(numero: string, texto?: string): string {
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
