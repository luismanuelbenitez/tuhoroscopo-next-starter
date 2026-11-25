import type { Rest } from "@/lib/asistenteParte";

// Seguimiento de las recomendaciones del Analista (2026-11-01; movido acá el
// 2026-11-25 para que lo usen la pantalla del Analista y la bandeja única de
// Inteligencia comercial sin duplicar la lógica). Al marcar una "hecha" se
// anota en la bitácora (así el próximo informe sabe desde cuándo comparar);
// si después cambia de estado, esa entrada se borra.

export const ESTADOS_REC = new Set(["pendiente", "en_curso", "hecha", "descartada"]);
const CATEGORIA_POR_DONDE: Record<string, string> = {
  meta: "publicidad", pagina_tarot: "web", checkout: "web", medicion: "web", oferta: "precio", postcompra: "producto",
};

export async function cambiarEstadoRecAnalista(rest: Rest, id: string, estado: string, notaCruda?: unknown): Promise<{ ok: true } | { ok: false; motivo: "invalido" | "no_existe" }> {
  if (!ESTADOS_REC.has(estado)) return { ok: false, motivo: "invalido" };
  const [rec] = await rest(`tarot_analista_recomendaciones?id=eq.${encodeURIComponent(id)}&select=id,accion,donde,estado,bitacora_id`);
  if (!rec) return { ok: false, motivo: "no_existe" };
  const nota = typeof notaCruda === "string" ? notaCruda.trim().slice(0, 500) || null : null;
  let bitacoraId: string | null = rec.bitacora_id;
  if (estado === "hecha" && !bitacoraId) {
    const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const [fila] = await rest("tarot_analista_bitacora", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ fecha: hoy, categoria: CATEGORIA_POR_DONDE[rec.donde] ?? "otro", descripcion: `Recomendación aplicada: ${rec.accion}${nota ? ` (${nota})` : ""}`.slice(0, 500) }),
    });
    bitacoraId = fila?.id ?? null;
  } else if (estado !== "hecha" && bitacoraId) {
    await rest(`tarot_analista_bitacora?id=eq.${bitacoraId}`, { method: "DELETE" });
    bitacoraId = null;
  }
  await rest(`tarot_analista_recomendaciones?id=eq.${rec.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado, nota, estado_at: new Date().toISOString(), bitacora_id: bitacoraId }),
  });
  return { ok: true };
}
