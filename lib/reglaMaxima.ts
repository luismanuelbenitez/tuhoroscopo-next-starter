// ════════════════════════════════════════════════════════════════════════════
// REGLA MÁXIMA (Manuel, 2026-11-04)
//
//   Ningún código, IA ni automatización de este proyecto puede modificar
//   nada que genere un costo: campañas, presupuestos, pujas, públicos,
//   anuncios, facturación ni medios de pago, en Meta, Google ni ningún otro
//   proveedor. Esas decisiones las toma Manuel y las ejecuta él a mano.
//   La IA solo lee, analiza y propone.
//
// Esto no es solo una instrucción para la IA: está aplicado acá, en el código.
// Toda llamada a las APIs de anuncios pasa por asegurarSoloLectura(), que deja
// pasar únicamente consultas de lectura y corta todo lo demás con un error.
// No agregar excepciones ni "modos" para saltear este guardia: si algún día
// Manuel decide automatizar algo con costo, lo decide él, por escrito, y se
// hace en otro módulo revisado aparte.
// ════════════════════════════════════════════════════════════════════════════

export const REGLA_MAXIMA =
  "REGLA MÁXIMA: no podés modificar nada que genere un costo (campañas, presupuestos, pujas, públicos, anuncios, facturación ni medios de pago, en Meta, Google ni ningún otro proveedor). Esas decisiones las toma Manuel y las ejecuta él. Vos solo leés, analizás y proponés.";

export class ViolacionReglaMaxima extends Error {
  constructor(detalle: string) {
    super(`Bloqueado por la REGLA MÁXIMA (solo lectura): ${detalle}`);
    this.name = "ViolacionReglaMaxima";
  }
}

// Google Ads API: solo estas rutas de lectura. Todo lo que termina en
// :mutate, :upload, :apply, etc. queda afuera.
const GOOGLE_LECTURA = [
  /^\/v\d+(\.\d+)?\/customers\/\d+\/googleAds:search(Stream)?$/,
  /^\/v\d+(\.\d+)?\/customers:listAccessibleCustomers$/,
];
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";

/** Corta con error cualquier pedido a una API de anuncios que no sea de lectura. */
export function asegurarSoloLectura(plataforma: "meta" | "google", metodo: string, url: string): void {
  const m = metodo.toUpperCase();
  let u: URL;
  try { u = new URL(url); } catch { throw new ViolacionReglaMaxima(`URL inválida (${plataforma})`); }

  if (plataforma === "meta") {
    // Graph API: leer es GET; crear, editar, pausar o borrar es POST / DELETE.
    if (m !== "GET") throw new ViolacionReglaMaxima(`Meta ${m} ${u.pathname}`);
    if (u.hostname !== "graph.facebook.com" && process.env.VERCEL_ENV === "production") {
      throw new ViolacionReglaMaxima(`Meta: servidor no oficial ${u.hostname}`);
    }
    return;
  }

  // Google: renovar el acceso OAuth (no toca la cuenta de anuncios) o una consulta de lectura.
  if (m === "POST" && url.split("?")[0] === OAUTH_TOKEN) return;
  if (u.hostname !== "googleads.googleapis.com") throw new ViolacionReglaMaxima(`Google: servidor no permitido ${u.hostname}`);
  const ruta = u.pathname;
  const esLectura = GOOGLE_LECTURA.some((re) => re.test(ruta));
  if (!esLectura) throw new ViolacionReglaMaxima(`Google ${m} ${ruta}`);
  if (ruta.endsWith("listAccessibleCustomers") ? m !== "GET" : m !== "POST") throw new ViolacionReglaMaxima(`Google ${m} ${ruta}`);
}

/** Las consultas a Google son GAQL: solo SELECT. */
export function asegurarConsultaGaql(q: string): void {
  if (!/^\s*SELECT\s/i.test(q)) throw new ViolacionReglaMaxima("Google: la consulta no es un SELECT");
}
