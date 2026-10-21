// Base de la Graph API de Meta para WhatsApp Cloud API — un solo lugar.
//
// 2026-10-21: v18.0 → v26.0 (v18 ya estaba retirada; Meta atendía esas
// llamadas con la versión vigente más vieja). Revisado el changelog de Cloud
// API entre v18 y v26: sin cambios incompatibles para lo que usamos (envío de
// texto/plantillas, marcar leído, media, message_templates). Cuando Meta
// anuncie el retiro de v26, cambiar SOLO esta constante.
//
// WHATSAPP_GRAPH_BASE permite apuntar a un mock en QA local; en producción
// no se define.
export const GRAPH_VERSION = "v26.0";
export const GRAPH_BASE = Deno.env.get("WHATSAPP_GRAPH_BASE") || `https://graph.facebook.com/${GRAPH_VERSION}`;
