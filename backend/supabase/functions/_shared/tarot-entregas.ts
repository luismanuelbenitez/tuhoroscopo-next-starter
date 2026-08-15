// ============================================================
// _shared/tarot-entregas.ts — Helper canónico de gobernanza de entregas TTC
//
// ARQUITECTURA:
//   Regenerar un artefacto (PDF) y entregarlo por un canal son
//   operaciones independientes. Este módulo es el ÚNICO punto
//   que decide si un envío por WhatsApp o Email puede ejecutarse.
//
//   Regla:
//     - Sin envío exitoso previo para esa orden+canal → permitido
//       (primera entrega o reintento normal de algo que nunca llegó).
//     - Con envío exitoso previo y SIN autorizacion_id válida →
//       bloqueado. No importa si el caller pasa force/forzar=true,
//       viene de un script, un cron o una llamada directa a la EF.
//     - Con autorizacion_id que referencia una solicitud 'autorizada'
//       para esa orden+canal → permitido una única vez (la solicitud
//       se consume atómicamente, no puede reutilizarse).
//
//   ef_tarot_enviar_whatsapp y ef_tarot_enviar_email DEBEN llamar
//   verificarPermisoEnvio() antes de enviar. Ninguna otra EF debe
//   reimplementar esta lógica.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

export type CanalEntrega = "whatsapp" | "email";

const TABLA_POR_CANAL: Record<CanalEntrega, string> = {
  whatsapp: "tarot_envios_whatsapp",
  email:    "tarot_envios_email",
};

// Estados que constituyen "evidencia de entrega exitosa" para un canal.
const ESTADOS_EXITOSOS: Record<CanalEntrega, string[]> = {
  whatsapp: ["enviado", "entregado", "leido"],
  email:    ["enviado"],
};

export type PermisoEnvio =
  | { permitido: true;  esReenvio: false; solicitudId: null }
  | { permitido: true;  esReenvio: true;  solicitudId: string }
  | { permitido: false; motivo: "ENVIO_PREVIO_EXITOSO_SIN_AUTORIZACION"; envioAnteriorId: string }
  | { permitido: false; motivo: "AUTORIZACION_INVALIDA_O_YA_USADA" };

/**
 * Único punto de decisión: ¿este envío puede ejecutarse?
 * No crea el registro de envío — eso sigue siendo responsabilidad
 * de cada EF de canal. Solo autoriza o bloquea.
 */
export async function verificarPermisoEnvio(
  supabase: SupabaseClient,
  params: { ordenId: string; canal: CanalEntrega; autorizacionId?: string | null },
): Promise<PermisoEnvio> {
  const { ordenId, canal, autorizacionId } = params;
  const tabla = TABLA_POR_CANAL[canal];

  const { data: envioExitoso } = await supabase
    .from(tabla)
    .select("id")
    .eq("orden_id", ordenId)
    .in("estado", ESTADOS_EXITOSOS[canal])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Sin entrega exitosa previa → primera entrega o reintento normal.
  if (!envioExitoso?.id) {
    return { permitido: true, esReenvio: false, solicitudId: null };
  }

  // Hay entrega exitosa previa: solo una autorización válida y no usada permite continuar.
  if (!autorizacionId) {
    return {
      permitido: false,
      motivo: "ENVIO_PREVIO_EXITOSO_SIN_AUTORIZACION",
      envioAnteriorId: envioExitoso.id,
    };
  }

  // Consumo atómico de un solo uso: solo transiciona si sigue 'autorizada'
  // para esta orden+canal exactos. Si ya fue consumida o no corresponde, 0 filas.
  const { data: consumida } = await supabase
    .from("tarot_solicitudes_reenvio")
    .update({ estado: "ejecutada", ejecutado_at: new Date().toISOString() })
    .eq("id", autorizacionId)
    .eq("orden_id", ordenId)
    .eq("canal", canal)
    .eq("estado", "autorizada")
    .select("id")
    .maybeSingle();

  if (!consumida?.id) {
    return { permitido: false, motivo: "AUTORIZACION_INVALIDA_O_YA_USADA" };
  }

  return { permitido: true, esReenvio: true, solicitudId: consumida.id };
}
