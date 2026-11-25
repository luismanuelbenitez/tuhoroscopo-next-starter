import type { Rest } from "@/lib/asistenteParte";

// Aceptar o descartar una propuesta del Estratega (2026-11-04; movido acá el
// 2026-11-25 para que lo usen la pantalla del Estratega y la bandeja única de
// Inteligencia comercial sin duplicar la lógica). Aceptada: pasa a Pendientes
// (de Manuel) y se anota en el documento "Decisiones tomadas".

const fechaCorta = () => new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Montevideo" });

export async function resolverPropuestaEstratega(rest: Rest, id: string, accion: "aceptar" | "descartar", origen = "el Estratega"): Promise<{ ok: true; pendiente_id?: string | null } | { ok: false; motivo: string }> {
  const ahora = new Date().toISOString();
  const rep = { Prefer: "return=representation" };
  const [prop] = await rest(`estratega_propuestas?id=eq.${encodeURIComponent(id)}&estado=eq.propuesta&select=*`);
  if (!prop) return { ok: false, motivo: "La propuesta ya no está abierta." };
  if (accion === "descartar") {
    await rest(`estratega_propuestas?id=eq.${prop.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "descartada", resuelta_at: ahora }) });
    return { ok: true };
  }
  const [pend] = await rest("admin_pendientes", {
    method: "POST", headers: rep,
    body: JSON.stringify({
      titulo: String(prop.titulo).slice(0, 160), detalle: prop.detalle, area: "anuncios", responsable: "manuel",
      prioridad: prop.prioridad, estado: "abierto", origen: "asistente", origen_ref: `estratega_${prop.id}`, enlace: "/admin/tarot/estratega",
    }),
  });
  const [dec] = await rest("estratega_documentos?clave=eq.decisiones&select=contenido");
  const linea = `- ${fechaCorta()}: ${prop.titulo} (aceptada desde ${origen}; en Pendientes).`;
  await rest("estratega_documentos?clave=eq.decisiones", {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ contenido: `${(dec?.contenido ?? "# Decisiones tomadas\n").trimEnd()}\n${linea}\n`, updated_at: ahora, updated_por: "manuel" }),
  });
  await rest(`estratega_propuestas?id=eq.${prop.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "aceptada", pendiente_id: pend?.id ?? null, resuelta_at: ahora }) });
  return { ok: true, pendiente_id: pend?.id ?? null };
}
