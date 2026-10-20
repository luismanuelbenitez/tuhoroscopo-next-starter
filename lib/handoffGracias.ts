// Handoff efímero /tarot/checkout → /tarot/gracias → /lectura (2026-10-20).
// Server-only (usa SESSION_SECRET).
//
// Al crear la orden, /api/tarot/crear-orden deja en el navegador de la compra
// una cookie SELLADA (iron-session: cifrada + firmada con SESSION_SECRET,
// httpOnly, Secure, SameSite=Lax) que contiene solo la referencia de esa
// orden y su vencimiento (6 h). Sin PII, no enumerable, no legible ni
// falsificable desde el frontend.
//
// /api/tarot/acceso-lectura solo pide el link de /lectura si la referencia
// de la URL coincide con la de esta cookie y no venció: la referencia
// TAROT-… por sí sola NUNCA alcanza para obtener la lectura.
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

const HORAS_VALIDEZ = 6;

export interface HandoffGracias {
  ref?: string;
  exp?: number; // epoch ms
}

const opciones: SessionOptions = {
  cookieName: "to_gracias",
  password: process.env.SESSION_SECRET as string,
  ttl: HORAS_VALIDEZ * 3600,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

/** Emite el handoff para la orden recién creada (pisa uno anterior). */
export async function emitirHandoffGracias(ref: string): Promise<void> {
  const s = await getIronSession<HandoffGracias>(cookies(), opciones);
  s.ref = ref;
  s.exp = Date.now() + HORAS_VALIDEZ * 3600 * 1000;
  await s.save();
}

/** true solo si este navegador tiene un handoff vigente para ESA referencia. */
export async function handoffValido(ref: string): Promise<boolean> {
  try {
    const s = await getIronSession<HandoffGracias>(cookies(), opciones);
    return typeof s.ref === "string" && s.ref === ref && typeof s.exp === "number" && s.exp > Date.now();
  } catch {
    return false;
  }
}
