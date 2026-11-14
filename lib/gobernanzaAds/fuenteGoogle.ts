import type { Rest } from "@/lib/asistenteParte";
import { leerPanelGoogleAds } from "@/lib/googleAdsApi/panel";
import { armarConfig } from "./config";
import { diagnosticar, alertasPrincipales } from "./reglas";
import { armarPropuestas } from "./propuestas";
import type { EntradaGobernanza } from "./tipos";

// Adaptador de ESTA cuenta al motor genérico (2026-11-14): lee lo que ya
// guardan el sync de Google Ads y la web (solo lectura) y lo traduce a
// EntradaGobernanza. Para otro negocio se cambia este archivo, no el motor.

type Comp = string | null;
interface PalabraR { id: string; grupo: string; grupo_estado: string; palabra: string; concordancia: string; estado: string; nivel: number | null; ctr: Comp; anuncio: Comp; pagina: Comp; aprobacion: string | null; impresiones: number; clics: number; cpc_medio: number | null }
interface RankingR {
  campanas: { id: string; inicio: string | null; fin: string | null; perdida_ranking: number | null; perdida_presupuesto: number | null; cuota: number | null }[];
  palabras: PalabraR[];
  anuncios: { grupo: string; grupo_estado: string; estado: string; url: string | null; fuerza: string | null; aprobacion: string | null }[];
  negativas: { texto: string; concordancia: string }[];
  gasto_dias: { campana_id: string; costo: number }[];
}
interface CampanaC { id: string; nombre: string; estado_principal: string; presupuesto_total: number | null; presupuesto_diario: number | null }
interface DiaC { fecha: string; impresiones: number; clics: number; costo: number; conversiones: number }
interface FilaWeb { visitas: number; checkout: number; ventas: number }

export async function gobernanzaGoogle(rest: Rest, dias: number) {
  const [panel, panel30, conf, rend30, ultimo] = await Promise.all([
    leerPanelGoogleAds(rest, dias),
    dias === 30 ? null : rest("rpc/google_ads_panel", { method: "POST", body: JSON.stringify({ p_dias: 30 }) }),
    rest("tarot_configuracion?clave=in.(gobernanza_google_ads,precio_base_uyu)&select=clave,valor"),
    rest(`google_ads_rendimiento?fecha=gte.${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}&select=conversiones`),
    rest("ads_config_historial?plataforma=eq.google&vigente_hasta=is.null&select=version,vigente_desde&order=vigente_desde.desc&limit=1").catch(() => []),
  ]);
  const confMap = Object.fromEntries((conf as { clave: string; valor: string }[]).map((x) => [x.clave, x.valor]));
  let guardada: unknown = null;
  try { guardada = confMap.gobernanza_google_ads ? JSON.parse(confMap.gobernanza_google_ads) : null; } catch { guardada = null; }
  const cfg = armarConfig(Number(confMap.precio_base_uyu) || 0, guardada);

  const p = panel as unknown as {
    cuenta: { conectada: boolean; tipo_cambio?: number; campanas?: CampanaC[]; por_dia?: DiaC[]; terminos?: { filas: { termino: string; impresiones: number; clics: number; costo: number }[] } | null; destino?: { velocidad?: { movil?: { lcp_ms?: number | null } } | null }; ranking?: RankingR | null };
    medicion: { compra: boolean };
    resumen: { visitas: number; checkout: number; empezaron_form: number; fueron_a_pagar: number; ventas: number; ingresos: number };
    terminos: (FilaWeb & { termino: string })[];
  };
  const c = p.cuenta;
  if (!c?.conectada) return { ok: false as const, motivo: "cuenta_sin_leer" };
  const r = c.ranking ?? null;
  const dia = (c.por_dia ?? []).reduce((a, x) => ({ costo: a.costo + Number(x.costo), clics: a.clics + x.clics, impresiones: a.impresiones + x.impresiones, conversiones: a.conversiones + Number(x.conversiones ?? 0) }), { costo: 0, clics: 0, impresiones: 0, conversiones: 0 });
  const web30 = ((panel30 as { terminos?: (FilaWeb & { termino: string })[] } | null)?.terminos ?? p.terminos) ?? [];

  const ult = (ultimo as { version: number; vigente_desde: string }[])[0] ?? null;
  let impDesdeCambio = 0;
  if (ult) {
    const desde = new Date(new Date(ult.vigente_desde).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const filas = (await rest(`google_ads_rendimiento?fecha=gte.${desde}&select=impresiones`).catch(() => [])) as { impresiones: number }[];
    impDesdeCambio = filas.reduce((a, x) => a + x.impresiones, 0);
  }

  const entrada: EntradaGobernanza = {
    dias,
    moneda: { cuenta: "USD", venta: "UYU", tipo_cambio: c.tipo_cambio ?? 40 },
    medicion_compras: p.medicion.compra,
    campanas: (c.campanas ?? []).map((k) => {
      const rk = r?.campanas.find((x) => x.id === k.id);
      return {
        id: k.id, nombre: k.nombre, estado_principal: k.estado_principal,
        presupuesto_total: k.presupuesto_total, presupuesto_diario: k.presupuesto_diario,
        inicio: rk?.inicio ?? null, fin: rk?.fin ?? null,
        perdida_ranking: rk?.perdida_ranking ?? null, perdida_presupuesto: rk?.perdida_presupuesto ?? null, cuota: rk?.cuota ?? null,
        gastado_total: (r?.gasto_dias ?? []).filter((g) => g.campana_id === k.id).reduce((a, g) => a + Number(g.costo), 0),
      };
    }),
    periodo: dia,
    palabras: (r?.palabras ?? []).map((x) => ({
      id: x.id, palabra: x.palabra, concordancia: x.concordancia, grupo: x.grupo,
      activa: x.estado === "ENABLED" && x.grupo_estado === "ENABLED",
      nivel: x.nivel, ctr: x.ctr, anuncio: x.anuncio, pagina: x.pagina, aprobacion: x.aprobacion,
      impresiones: x.impresiones, clics: x.clics, costo: (x.cpc_medio ?? 0) * x.clics,
    })),
    terminos: (c.terminos?.filas ?? []).map((t) => ({ ...t, costo: Number(t.costo) })),
    negativas: r?.negativas ?? [],
    anuncios: (r?.anuncios ?? []).map((a) => ({ grupo: a.grupo, activo: a.estado === "ENABLED" && a.grupo_estado === "ENABLED", url: a.url, fuerza: a.fuerza, aprobacion: a.aprobacion })),
    web: { visitas: p.resumen.visitas, checkout: p.resumen.checkout, empezaron_form: p.resumen.empezaron_form, fueron_a_pagar: p.resumen.fueron_a_pagar, ventas: p.resumen.ventas, ingresos: Number(p.resumen.ingresos) },
    web_por_palabra: web30.map((t) => ({ palabra: t.termino, visitas: t.visitas, checkout: t.checkout, ventas: t.ventas })),
    velocidad: { lcp_movil_ms: c.destino?.velocidad?.movil?.lcp_ms ?? null },
    ultimo_cambio: ult ? { version: ult.version, desde: ult.vigente_desde } : null,
    impresiones_desde_cambio: impDesdeCambio,
    conversiones_30d: (rend30 as { conversiones: number }[]).reduce((a, x) => a + Number(x.conversiones ?? 0), 0),
  };

  const res = diagnosticar(entrada, cfg);
  const { propuestas, manuales } = armarPropuestas(entrada, cfg, res.hallazgos);
  return {
    propuestas, manuales,
    /** Campañas donde se cargan las negativas (las que no están pausadas ni terminadas). */
    campanas_activas: entrada.campanas.filter((k) => !["PAUSED", "REMOVED", "ENDED"].includes(k.estado_principal)).map((k) => k.id),
    ok: true as const,
    dias,
    moneda: entrada.moneda,
    config: { cpa_objetivo: cfg.cpa_objetivo, valor_venta: cfg.valor_venta, minimos: cfg.minimos },
    campanas: entrada.campanas.map((k) => ({ id: k.id, nombre: k.nombre, estado: k.estado_principal, presupuesto_total: k.presupuesto_total, presupuesto_diario: k.presupuesto_diario, gastado_total: k.gastado_total, fin: k.fin })),
    ...res,
    alertas: alertasPrincipales(res.hallazgos),
  };
}
