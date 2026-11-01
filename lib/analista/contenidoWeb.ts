// Contenido real de la web para el Analista de conversión (2026-11-01).
// Sin esto la IA solo ve números y recomienda cosas que la página ya tiene.
// Lee /tarot y /tarot/checkout EN VIVO (lo que ve hoy un visitante) y los
// pasa a texto: /tarot por sección, usando los marcadores data-seccion que
// también usa la medición. Una lectura del servidor no ejecuta JavaScript,
// así que no cuenta como visita.

const BASE = "https://tuoraculo.uy";
const MAX_SECCION = 1500;
const MAX_CHECKOUT = 3500;

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", middot: "·", hellip: "…" };
const decodificar = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });

/** HTML → texto legible: sin scripts/estilos/íconos; placeholders y alt como texto. */
function aTexto(html: string): string {
  return decodificar(
    html
      .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(input|textarea)[^>]*placeholder="([^"]*)"[^>]*>/gi, " [campo: $2] ")
      .replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, " [imagen: $1] ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/button|\/a|\/label|\/option|\/summary|\/section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function bajar(path: string): Promise<string> {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (analista-tuoraculo; lectura interna)" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}

/** /tarot por sección, en el orden en que aparecen. */
function seccionesTarot(html: string) {
  const marcas = Array.from(html.matchAll(/data-seccion="([a-z_]+)"/g));
  return marcas.map((m, i) => {
    const desde = m.index ?? 0;
    // Corta antes del "<div " que abre el marcador siguiente.
    // El último marcador termina en el pie global del sitio, que en /tarot está oculto.
    const pie = html.indexOf("<footer", desde);
    const hasta = i + 1 < marcas.length ? html.lastIndexOf("<", marcas[i + 1].index ?? html.length) : pie > 0 ? pie : html.indexOf("</body>");
    let texto = aTexto(`<div ${html.slice(desde, hasta)}`.replace(/^<div data-seccion="[a-z_]+"[^>]*>/, ""));
    if (texto.length > MAX_SECCION) texto = `${texto.slice(0, MAX_SECCION)}…`;
    if (!texto && m[1] === "sticky") {
      texto = "(Botón fijo abajo de la pantalla, solo en celular: aparece recién al bajar unos 520 px. Muestra el precio y \"Quiero mi lectura →\". Sus clics se miden como cta_click 'sticky'; su section_view no se registra porque no existe al cargar.)";
    }
    return { seccion: m[1], texto: texto || "(sección vacía: hoy no muestra nada a los visitantes)" };
  });
}

export async function leerContenidoWeb() {
  const [tarot, checkout] = await Promise.allSettled([bajar("/tarot"), bajar("/tarot/checkout")]);
  const out: Record<string, unknown> = {
    leido_el: new Date().toISOString(),
    nota: "Textos que ve hoy un visitante (diseño adaptable: en celular el orden es el mismo, en una sola columna). La sección 'sticky' es un botón fijo abajo de la pantalla en celular.",
  };
  if (tarot.status === "fulfilled") out.pagina_tarot = seccionesTarot(tarot.value);
  else out.pagina_tarot_error = String(tarot.reason).slice(0, 200);
  if (checkout.status === "fulfilled") {
    const html = checkout.value;
    const ini = html.indexOf("<h1");
    const fin = html.lastIndexOf("</aside>");
    let texto = aTexto(html.slice(ini >= 0 ? ini : 0, fin > ini ? fin : html.length));
    if (texto.length > MAX_CHECKOUT) texto = `${texto.slice(0, MAX_CHECKOUT)}…`;
    out.checkout = texto;
  } else out.checkout_error = String(checkout.reason).slice(0, 200);
  return out;
}
