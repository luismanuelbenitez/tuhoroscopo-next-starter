import type { Rest } from "@/lib/asistenteParte";
import { BASE, googleAdsConfig, mensajeError, tokenDeAcceso } from "@/lib/googleAdsApi/api";
import { asegurarSoloLectura } from "@/lib/reglaMaxima";

// Palabras del mercado (2026-11-15). Cuánta gente busca cada frase por mes,
// en Uruguay (español) y en EE. UU. (inglés), para decidir grupos de
// anuncios, páginas y títulos con datos y no a ojo.
//
// Dos fuentes, misma tabla (google_ads_mercado):
//  · API: Planificador de palabras clave (generateKeywordIdeas). Solo lee
//    datos públicos de Google; no toca la cuenta. Necesita acceso "Basic"
//    al API de Google Ads: con "Explorer" Google responde
//    DEVELOPER_TOKEN_NOT_APPROVED y el panel lo explica.
//  · Archivo: el CSV que descarga el Planificador desde Google Ads (mientras
//    no haya acceso Basic, o para sumar ideas que se buscaron a mano).

export type Mercado = "uy" | "us";
export const MERCADOS: Record<Mercado, { nombre: string; idioma: string; geo: number; lang: number; semillas: string[] }> = {
  uy: {
    nombre: "Uruguay", idioma: "español", geo: 2858, lang: 1003,
    semillas: [
      "tarot", "tarot online", "tirada de tarot", "lectura de tarot", "tarot gratis", "cartas del tarot", "tirada de cartas", "lectura de cartas",
      "tarot uruguay", "tarot montevideo", "tarot personalizado", "tarot por whatsapp", "tarotista", "consulta de tarot", "tarot si o no",
      "tarot del amor", "tarot amor", "tarot de amor", "tarot de pareja", "tirada de cartas amor", "tarot amor gratis", "volvera mi ex tarot",
      "tarot si o no amor", "lectura de cartas amor", "que siente por mi tarot", "tarot trabajo", "tarot dinero",
    ],
  },
  us: {
    nombre: "Estados Unidos", idioma: "inglés", geo: 2840, lang: 1000,
    semillas: [
      "tarot", "tarot reading", "online tarot reading", "tarot card reading", "free tarot reading", "tarot spread", "personalized tarot reading",
      "accurate tarot reading", "tarot reading online", "psychic reading", "yes or no tarot", "tarot reader", "love tarot", "love tarot reading",
      "tarot love reading", "will he come back tarot", "relationship tarot", "love tarot spread", "yes or no love tarot", "soulmate tarot reading",
      "ex back tarot", "does he love me tarot", "twin flame tarot", "free love tarot reading", "career tarot reading", "money tarot reading",
    ],
  },
};

export const norm = (t: string) => t.normalize("NFD").replace(/[^\x20-\x7e]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type FilaMercado = {
  mercado: Mercado; texto: string; texto_norm: string; mensual: number | null; mensual_min: number | null; mensual_max: number | null;
  competencia: string | null; indice_competencia: number | null; cpc_bajo: number | null; cpc_alto: number | null;
  meses: { mes: string; busquedas: number }[]; fuente: "api" | "archivo"; actualizado_at: string;
};

async function guardar(rest: Rest, filas: FilaMercado[]) {
  // Una misma frase puede venir repetida (dos tandas de semillas): queda la última.
  const unicas = [...new Map(filas.map((f) => [`${f.mercado}|${f.texto_norm}`, f])).values()];
  for (let i = 0; i < unicas.length; i += 500) {
    await rest("google_ads_mercado?on_conflict=mercado,texto_norm", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(unicas.slice(i, i + 500)),
    });
  }
  return unicas.length;
}

async function registrar(rest: Rest, mercado: Mercado, fuente: string, filas: number, ok: boolean, error: string | null) {
  await rest("google_ads_mercado_consultas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ mercado, fuente, filas, ok, error }) }).catch(() => null);
}

const MES_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/** Consulta el Planificador de Google (solo lectura) y guarda las ideas. */
export async function consultarMercado(rest: Rest, mercado: Mercado) {
  const cfg = googleAdsConfig();
  if (!cfg) return { ok: false as const, motivo: "sin_configurar" };
  const m = MERCADOS[mercado];
  const url = `${BASE}/customers/${cfg.cuenta}:generateKeywordIdeas`;
  asegurarSoloLectura("google", "POST", url);
  const filas: FilaMercado[] = [];
  const ahora = new Date().toISOString();
  try {
    // Google acepta hasta 20 semillas por pedido.
    for (let i = 0; i < m.semillas.length; i += 20) {
      let pageToken: string | undefined;
      for (let p = 0; p < 10; p++) {
        const headers: Record<string, string> = { Authorization: `Bearer ${await tokenDeAcceso(cfg)}`, "Content-Type": "application/json" };
        if (/^\d{10}$/.test(cfg.mcc)) headers["login-customer-id"] = cfg.mcc;
        const r = await fetch(url, {
          method: "POST", headers, cache: "no-store",
          body: JSON.stringify({
            language: `languageConstants/${m.lang}`, geoTargetConstants: [`geoTargetConstants/${m.geo}`], keywordPlanNetwork: "GOOGLE_SEARCH",
            includeAdultKeywords: false, keywordSeed: { keywords: m.semillas.slice(i, i + 20) }, pageSize: 1000, ...(pageToken ? { pageToken } : {}),
          }),
        });
        const cuerpo = await r.json().catch(() => null);
        if (!r.ok) throw new Error(mensajeError(cuerpo, r.status));
        for (const x of ((cuerpo as { results?: Record<string, unknown>[] })?.results ?? [])) {
          const k = (x.keywordIdeaMetrics ?? {}) as Record<string, unknown>;
          const texto = String(x.text ?? "").trim();
          if (!texto) continue;
          const mensual = k.avgMonthlySearches != null ? Number(k.avgMonthlySearches) : null;
          filas.push({
            mercado, texto, texto_norm: norm(texto), mensual, mensual_min: mensual, mensual_max: mensual,
            competencia: (k.competition as string) ?? null, indice_competencia: k.competitionIndex != null ? Number(k.competitionIndex) : null,
            cpc_bajo: k.lowTopOfPageBidMicros != null ? Number(k.lowTopOfPageBidMicros) / 1e6 : null,
            cpc_alto: k.highTopOfPageBidMicros != null ? Number(k.highTopOfPageBidMicros) / 1e6 : null,
            meses: ((k.monthlySearchVolumes as Record<string, unknown>[] | undefined) ?? []).map((v) => ({
              mes: `${v.year}-${String(MES_EN.indexOf(String(v.month)) + 1).padStart(2, "0")}`, busquedas: Number(v.monthlySearches ?? 0),
            })),
            fuente: "api", actualizado_at: ahora,
          });
        }
        pageToken = (cuerpo as { nextPageToken?: string })?.nextPageToken;
        if (!pageToken) break;
      }
    }
    const n = await guardar(rest, filas);
    await registrar(rest, mercado, "api", n, true, null);
    return { ok: true as const, filas: n };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    await registrar(rest, mercado, "api", 0, false, detalle.slice(0, 500));
    return { ok: false as const, motivo: /DEVELOPER_TOKEN_NOT_APPROVED|explorer access/i.test(detalle) ? "sin_acceso_basic" : "error", detalle };
  }
}

// ── Archivo del Planificador ─────────────────────────────────────────
// Google lo descarga en UTF-16 con tabulaciones ("CSV" de Google Ads) o en
// UTF-8 con comas (Google Sheets). Los encabezados vienen en el idioma de la
// cuenta (español o inglés). Si la cuenta gasta poco, el volumen viene en
// rangos ("100 – 1 mil", "1K – 10K").

const MESES: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

function decodificar(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  // UTF-16 sin marca: muchos ceros en posiciones impares.
  let ceros = 0; for (let i = 1; i < Math.min(b.length, 400); i += 2) if (b[i] === 0) ceros++;
  if (ceros > 100) return new TextDecoder("utf-16le").decode(b);
  return new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "");
}

function partirLinea(linea: string, sep: string): string[] {
  if (sep === "\t") return linea.split("\t").map((c) => c.replace(/^"|"$/g, "").trim());
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') { if (q && linea[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "1.000", "1,000", "1 mil", "10K", "1,5 M" → número. */
function cantidad(s: string): number | null {
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || t === "--" || t === "—") return null;
  const m = /([\d.,]+)\s*(k|mil|m|mill(?:ón|on|ones)?|b)?/.exec(t);
  if (!m) return null;
  let n = m[1];
  if (m[2]) n = n.replace(",", "."); // 1,5 M
  else n = n.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  let v = Number(n);
  if (!Number.isFinite(v)) return null;
  const u = m[2] ?? "";
  if (u === "k" || u === "mil") v *= 1_000; else if (u.startsWith("m")) v *= 1_000_000; else if (u === "b") v *= 1_000_000_000;
  return Math.round(v);
}

function volumen(s: string): { mid: number | null; min: number | null; max: number | null } {
  const partes = s.split(/\s*[–—-]\s*/).filter(Boolean);
  if (partes.length === 2) {
    const a = cantidad(partes[0]); const b = cantidad(partes[1]);
    if (a != null && b != null) return { min: a, max: b, mid: Math.round(Math.sqrt(Math.max(a, 1) * b)) };
  }
  const v = cantidad(s);
  return { mid: v, min: v, max: v };
}

function plata(s: string): number | null {
  const t = s.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const n = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function mesDeEncabezado(h: string): string | null {
  const m = /(?:searches|b[uú]squedas)\s*:\s*([a-záéíóú]+)\.?\s*(?:de\s*)?(\d{4})/i.exec(h);
  if (!m) return null;
  const n = MESES[norm(m[1]).slice(0, 4).replace(/\.$/, "")] ?? MESES[norm(m[1]).slice(0, 3)];
  return n ? `${m[2]}-${String(n).padStart(2, "0")}` : null;
}

const competenciaDe = (s: string) => {
  const n = norm(s);
  return /^(baja|low)$/.test(n) ? "LOW" : /^(media|medium)$/.test(n) ? "MEDIUM" : /^(alta|high)$/.test(n) ? "HIGH" : s.trim() || null;
};

export async function importarArchivo(rest: Rest, mercado: Mercado, buf: ArrayBuffer) {
  const texto = decodificar(buf);
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const iCab = lineas.findIndex((l) => /(^|[\t,"])\s*(keyword|palabra clave)\s*("?)([\t,]|$)/i.test(l));
  if (iCab < 0) return { ok: false as const, motivo: "formato", detalle: "No encontré la columna «Palabra clave» / «Keyword». ¿Es el archivo que descarga el Planificador?" };
  const sep = lineas[iCab].includes("\t") ? "\t" : ",";
  const cab = partirLinea(lineas[iCab], sep);
  const col = (re: RegExp) => cab.findIndex((h) => re.test(h));
  const cKw = col(/^(keyword|palabra clave)$/i);
  const cAvg = col(/avg\.? monthly searches|promedio de b[uú]squedas mensuales/i);
  const cComp = col(/^(competition|competencia)$/i);
  const cIdx = col(/indexed value|valor indexado/i);
  const cBajo = col(/low range|rango bajo/i);
  const cAlto = col(/high range|rango alto/i);
  const cMeses = cab.map((h, i) => ({ i, mes: mesDeEncabezado(h) })).filter((x) => x.mes) as { i: number; mes: string }[];
  if (cAvg < 0) return { ok: false as const, motivo: "formato", detalle: "Falta la columna de búsquedas mensuales." };
  const ahora = new Date().toISOString();
  const filas: FilaMercado[] = [];
  for (const l of lineas.slice(iCab + 1)) {
    const c = partirLinea(l, sep);
    const kw = (c[cKw] ?? "").trim();
    if (!kw) continue;
    const v = volumen(c[cAvg] ?? "");
    filas.push({
      mercado, texto: kw, texto_norm: norm(kw), mensual: v.mid, mensual_min: v.min, mensual_max: v.max,
      competencia: cComp >= 0 ? competenciaDe(c[cComp] ?? "") : null, indice_competencia: cIdx >= 0 ? cantidad(c[cIdx] ?? "") : null,
      cpc_bajo: cBajo >= 0 ? plata(c[cBajo] ?? "") : null, cpc_alto: cAlto >= 0 ? plata(c[cAlto] ?? "") : null,
      meses: cMeses.map((x) => ({ mes: x.mes, busquedas: cantidad(c[x.i] ?? "") ?? 0 })).sort((a, b) => a.mes.localeCompare(b.mes)),
      fuente: "archivo", actualizado_at: ahora,
    });
  }
  if (!filas.length) return { ok: false as const, motivo: "vacio", detalle: "El archivo no tiene filas con palabras." };
  const n = await guardar(rest, filas);
  await registrar(rest, mercado, "archivo", n, true, null);
  return { ok: true as const, filas: n };
}

// ── Clasificación ────────────────────────────────────────────────────
// Qué busca la persona (¿nos puede comprar?) y a qué recorrido iría.

export type Intencion = "compra" | "gratis" | "aprender" | "otro_servicio" | "fuera";
export type Tema = "general" | "amor" | "decisiones" | "trabajo";

const RELEVANTE = /(tarot|carta|cartas|tirada|lectura|reading|psychic|card|oraculo|oracle|vidente|tarotista|reader)/;
const GRATIS = /(^|\s)(gratis|gratuit[oa]s?|free|sin costo|sin pagar)(\s|$)/;
const ARCANOS = /(enamorados|lovers|emperador|emperor|emperatriz|empress|sacerdotisa|priestess|hierofante|sumo sacerdote|hierophant|ermitano|hermit|rueda de la fortuna|wheel of fortune|colgado|hanged man|templanza|temperance|diablo|devil|la torre|the tower|la estrella|the star|la luna|the moon|el sol|the sun|el juicio|judgement|el mundo|the world|el loco|the fool|el mago|magician|el carro|chariot|la fuerza|strength|la justicia|justice|la muerte|death card)/;
const NAIPE = /(^|\s)(as|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|sota|paje|caballero|reina|rey|ace|two|three|four|five|six|seven|eight|nine|ten|page|knight|queen|king) (de|of) (copas|espadas|bastos|oros|pentaculos|cups|swords|wands|pentacles)/;
const APRENDER = /(significad|significa|meaning|means|que es|como (leer|tirar|aprender|se lee|se tira|interpretar)|how to|learn|curso|course|libro|book|(^|\s)app(\s|$)|aplicacion|mazo|deck|baraja|imprimir|printable|interpretacion de|arcano|arcana|reversed|invertid|spread ideas|tatuaje|tattoo)/;
const OTRO = /(horoscop|numerolog|astrolog|carta astral|carta natal|birth chart|zodiac|signo|lenormand|runa|rune|angel|angeles|espanola|gitan|marsella|near me|cerca de mi|telefon|phone|0900|whatsapp gratis|chat gratis|hechizo|spell|amarre|limpia|ritual|velas|i ching|palm|mano|manos)/;

export function intencion(t: string): Intencion {
  const n = norm(t);
  if (!RELEVANTE.test(n)) return "fuera";
  if (GRATIS.test(n)) return "gratis";
  if (OTRO.test(n)) return "otro_servicio";
  if (APRENDER.test(n) || ARCANOS.test(n) || NAIPE.test(n)) return "aprender";
  return "compra";
}

const T_AMOR = /(amor|pareja|novio|novia|(^|\s)ex(\s|$)|relaci|vinculo|enamorad|me ama|me quiere|siente por mi|volvera|vuelve|alma gemela|love|relationship|soulmate|twin flame|boyfriend|girlfriend|crush|marriage|come back|feel about me|does he|does she|will he|will she)/;
const T_DECIDE = /(si o no|yes or no|decision|decidir|should i)/;
const T_TRABAJO = /(trabajo|dinero|laboral|empleo|negocio|plata|career|job|money|work|finance|business)/;

export function tema(t: string): Tema {
  const n = norm(t);
  if (T_AMOR.test(n)) return "amor";
  if (T_DECIDE.test(n)) return "decisiones";
  if (T_TRABAJO.test(n)) return "trabajo";
  return "general";
}

// ── Lectura para el panel ────────────────────────────────────────────

export async function leerMercado(rest: Rest, mercado: Mercado) {
  const [filas, consultas, datos] = await Promise.all([
    rest(`google_ads_mercado?mercado=eq.${mercado}&select=texto,texto_norm,mensual,mensual_min,mensual_max,competencia,indice_competencia,cpc_bajo,cpc_alto,meses,fuente,actualizado_at&order=mensual.desc.nullslast&limit=3000`) as Promise<FilaMercado[]>,
    rest(`google_ads_mercado_consultas?mercado=eq.${mercado}&select=fuente,filas,ok,error,created_at&order=created_at.desc&limit=5`) as Promise<{ fuente: string; filas: number; ok: boolean; error: string | null; created_at: string }[]>,
    mercado === "uy" ? (rest("google_ads_datos?clave=in.(palabras_30d,terminos_30d)&select=clave,datos") as Promise<{ clave: string; datos: { filas?: Record<string, unknown>[] } }[]>) : Promise.resolve([]),
  ]);
  // Lo que ya tenemos en la campaña (solo Uruguay: hoy no hay campaña en EE. UU.).
  const palabras = new Set<string>(); const terminos = new Set<string>();
  for (const d of datos) for (const f of d.datos?.filas ?? []) {
    if (d.clave === "palabras_30d" && !f.negativa && f.estado === "ENABLED") palabras.add(norm(String(f.palabra ?? "")));
    if (d.clave === "terminos_30d") terminos.add(norm(String(f.termino ?? "")));
  }
  const tendencia = (meses: { mes: string; busquedas: number }[]) => {
    const v = [...meses].sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => x.busquedas);
    if (v.length < 6) return null;
    const ult = v.slice(-3).reduce((s, x) => s + x, 0); const ant = v.slice(-6, -3).reduce((s, x) => s + x, 0);
    return ant > 0 ? Math.round(((ult - ant) / ant) * 100) : null;
  };
  const lista = filas.map((f) => ({
    texto: f.texto, mensual: f.mensual ?? 0, rango: f.mensual_min != null && f.mensual_max != null && f.mensual_min !== f.mensual_max ? [f.mensual_min, f.mensual_max] as [number, number] : null,
    competencia: f.competencia, cpc_bajo: f.cpc_bajo, cpc_alto: f.cpc_alto, tendencia: tendencia(f.meses ?? []), meses: f.meses ?? [],
    intencion: intencion(f.texto), tema: tema(f.texto),
    en_campana: palabras.has(f.texto_norm), ya_aparecio: terminos.has(f.texto_norm), fuente: f.fuente,
  }));
  const temas: Tema[] = ["general", "amor", "decisiones", "trabajo"];
  const resumen = temas.map((t) => {
    const del = lista.filter((x) => x.tema === t && x.intencion !== "fuera");
    const compra = del.filter((x) => x.intencion === "compra");
    const conCpc = compra.filter((x) => x.cpc_bajo != null && x.cpc_alto != null && x.mensual > 0);
    const pesos = conCpc.reduce((s, x) => s + x.mensual, 0);
    return {
      tema: t,
      total: del.reduce((s, x) => s + x.mensual, 0),
      compra: compra.reduce((s, x) => s + x.mensual, 0),
      gratis: del.filter((x) => x.intencion === "gratis").reduce((s, x) => s + x.mensual, 0),
      aprender: del.filter((x) => x.intencion === "aprender").reduce((s, x) => s + x.mensual, 0),
      cpc_medio: pesos ? Math.round((conCpc.reduce((s, x) => s + ((x.cpc_bajo! + x.cpc_alto!) / 2) * x.mensual, 0) / pesos) * 100) / 100 : null,
      principal: compra[0]?.texto ?? null,
      top: compra.slice(0, 6).map((x) => ({ texto: x.texto, mensual: x.mensual, en_campana: x.en_campana })),
      oportunidades: compra.filter((x) => !x.en_campana).slice(0, 8).map((x) => ({ texto: x.texto, mensual: x.mensual })),
    };
  });
  const ultimaApi = consultas.find((c) => c.fuente === "api") ?? null;
  return {
    ok: true as const, mercado, nombre: MERCADOS[mercado].nombre, idioma: MERCADOS[mercado].idioma, semillas: MERCADOS[mercado].semillas,
    acceso: ultimaApi ? (ultimaApi.ok ? "ok" : /DEVELOPER_TOKEN_NOT_APPROVED|explorer access/i.test(ultimaApi.error ?? "") ? "sin_basic" : "error") : "sin_probar",
    consultas, filas: lista, resumen, hay_rangos: lista.some((x) => x.rango),
  };
}
