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
//
// 2026-11-14 — Manuel, por escrito: el módulo de gobernanza de Google Ads
// puede tener botones de "Aplicar", SALVO aumentar el presupuesto (y nada que
// suba el gasto: campañas nuevas, reactivar campañas, redes, pujas). Esa
// escritura vive SOLO en lib/googleAdsApi/escritura.ts, con su propio guardia
// (asegurarMutacionPermitida). Este guardia de solo lectura no cambia y sigue
// protegiendo el sync, el Estratega y Meta.
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
  // Planificador de palabras clave (2026-11-15): cuánta gente busca cada
  // frase. Lee datos públicos de Google; no crea ni cambia nada en la cuenta.
  /^\/v\d+(\.\d+)?\/customers\/\d+:generateKeyword(Ideas|HistoricalMetrics)$/,
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

// 2026-11-17 — Manuel: "cuando MP confirma el pago, si viene de Google, hay que
// avisarle". Avisar una venta no cambia campañas, pujas ni gasto: solo le dice
// a Google qué clic terminó en compra. Único destino permitido: events:ingest
// de la Data Manager API (lib/googleAdsApi/ventasServidor.ts). Ninguna otra
// ruta de ese servidor (listas de clientes, públicos, etc.) pasa.
const DATA_MANAGER_EVENTOS = "https://datamanager.googleapis.com/v1/events:ingest";

/** Corta con error todo lo que no sea avisar ventas a Google (Data Manager API). */
export function asegurarAvisoDeVentas(metodo: string, url: string, cuerpo: unknown): void {
  if (metodo.toUpperCase() !== "POST" || url.split("?")[0] !== DATA_MANAGER_EVENTOS) {
    throw new ViolacionReglaMaxima(`Data Manager: solo se avisan ventas (${metodo} ${url})`);
  }
  const c = cuerpo as { destinations?: { productDestinationId?: string }[]; events?: unknown[] } | null;
  if (!c || !Array.isArray(c.destinations) || !Array.isArray(c.events) || c.destinations.some((d) => !/^\d{1,20}$/.test(String(d.productDestinationId ?? "")))) {
    throw new ViolacionReglaMaxima("Data Manager: pedido que no es un aviso de ventas");
  }
}

/** Las consultas a Google son GAQL: solo SELECT. */
export function asegurarConsultaGaql(q: string): void {
  if (!/^\s*SELECT\s/i.test(q)) throw new ViolacionReglaMaxima("Google: la consulta no es un SELECT");
}
