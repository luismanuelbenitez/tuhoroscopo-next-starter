import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { FUENTES, FUENTES_POR_DEFECTO, MEDICION_DESDE, type Fuente } from "@/lib/analista/datos";
import { ESFUERZOS, MODELOS, claveAnalista, costoEstimado, paqueteParaInforme, type Esfuerzo, type Modelo } from "@/lib/analista/informe";
import { leerCsvMeta } from "@/lib/analista/csv";

// Configuración del Analista de conversión (2026-11-01). GET: configuración,
// estado de cada fuente de datos (desde cuándo y cuántos registros),
// modelos con costo estimado, bitácora y CSVs de Meta; con ?vista_previa=<días>
// devuelve el paquete exacto que vería la IA. POST: guardar configuración,
// bitácora (agregar/borrar) y CSVs de Meta (subir/borrar).

const CATEGORIAS = new Set(["publicidad", "web", "precio", "producto", "otro"]);
const DESGLOSES = new Set(["general", "edad_sexo", "ubicacion", "region", "hora", "otro"]);
const MAX_CSV = 1_500_000;

// Conteo exacto sin traer filas (cabecera Content-Range de PostgREST).
async function contar(tabla: string, filtro: string): Promise<number | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const r = await fetch(`${url}/rest/v1/${tabla}?${filtro}&select=*`, {
    method: "HEAD", cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
  });
  const total = r.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  try {
    const [config] = await rest(`tarot_analista_config?id=eq.1&select=*`);
    const fuentes = { ...FUENTES_POR_DEFECTO, ...(config?.fuentes ?? {}) } as Record<Fuente, boolean>;

    const vista = req.nextUrl.searchParams.get("vista_previa");
    if (vista) {
      const dias = [7, 14, 30, 60, 90].includes(Number(vista)) ? Number(vista) : 7;
      const paquete = await paqueteParaInforme(rest, dias, fuentes, config?.contexto_negocio ?? "", Number(config?.minimo_visitas) || 100);
      const texto = JSON.stringify(paquete);
      return NextResponse.json({ ok: true, paquete, caracteres: texto.length, tokens_aprox: Math.round(texto.length / 3.2) });
    }

    const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const ev = (nombres: string) => `event_name=in.(${nombres})&created_at=gte.${hace30}`;
    const [bitacora, csvs, n] = await Promise.all([
      rest(`tarot_analista_bitacora?select=id,fecha,categoria,descripcion&order=fecha.desc,created_at.desc&limit=200`),
      rest(`tarot_analista_meta_csv?select=id,nombre_archivo,desglose,periodo_desde,periodo_hasta,columnas,notas,created_at,filas_total:filas&order=created_at.desc&limit=50`),
      Promise.all([
        contar("funnel_sessions", `es_interno=eq.false&started_at=gte.${hace30}`),
        contar("funnel_events", ev("scroll_depth,time_on_page")),
        contar("funnel_events", ev("checkout_started,payment_approved")),
        contar("funnel_events", ev("form_started,form_field_done,form_invalid,form_submit,form_error,coupon_result,mp_redirect")),
        contar("funnel_events", ev("section_view,cta_click,faq_open")),
        contar("tarot_pagos", `mp_status=eq.approved&created_at=gte.${hace30}`),
        contar("tarot_accesos_web", `created_at=gte.${hace30}`),
        contar("tarot_analista_aprendizajes", "activo=eq.true"),
      ]),
    ]);
    const desde: Record<Fuente, string> = {
      trafico: MEDICION_DESDE.sesiones_y_eventos, calidad: MEDICION_DESDE.scroll_y_tiempo, embudo: MEDICION_DESDE.sesiones_y_eventos,
      formulario: MEDICION_DESDE.formulario_y_secciones, secciones: MEDICION_DESDE.formulario_y_secciones,
      ventas: MEDICION_DESDE.sesiones_y_eventos, postcompra: MEDICION_DESDE.sesiones_y_eventos, meta_csv: "", bitacora: "", memoria: "",
    };
    const registros: Record<Fuente, number | null> = {
      trafico: n[0], calidad: n[1], embudo: n[2], formulario: n[3], secciones: n[4], ventas: n[5], postcompra: n[6],
      meta_csv: csvs.length, bitacora: bitacora.length, memoria: n[7],
    };
    const catalogo = (Object.keys(FUENTES) as Fuente[]).map((k) => ({
      clave: k, descripcion: FUENTES[k], activa: fuentes[k], desde: desde[k] || null, registros_30d: registros[k],
    }));
    const modelos = (Object.keys(MODELOS) as Modelo[]).map((m) => ({
      id: m, ...MODELOS[m],
      costo_estimado_usd: Object.fromEntries((Object.keys(ESFUERZOS) as Esfuerzo[]).map((e) => [e, Math.round(costoEstimado(m, e) * 100) / 100])),
    }));
    return NextResponse.json({
      ok: true, config, catalogo, modelos, esfuerzos: ESFUERZOS, bitacora,
      csvs: csvs.map((c: { filas_total: unknown[] } & Record<string, unknown>) => ({ ...c, filas_total: Array.isArray(c.filas_total) ? c.filas_total.length : 0 })),
      clave_configurada: !!claveAnalista(),
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "fetch_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const b = await req.json().catch(() => null);
  const mal = (detalle: string) => NextResponse.json({ ok: false, motivo: "invalido", detalle }, { status: 400 });
  try {
    switch (b?.accion) {
      case "guardar_config": {
        const c = b.config ?? {};
        if (!(c.modelo in MODELOS)) return mal("Modelo inválido.");
        if (!(c.esfuerzo in ESFUERZOS)) return mal("Profundidad inválida.");
        const fuentes = Object.fromEntries((Object.keys(FUENTES) as Fuente[]).map((k) => [k, c.fuentes?.[k] !== false]));
        const minimo = Math.round(Number(c.minimo_visitas));
        if (!(minimo >= 10 && minimo <= 10000)) return mal("El mínimo de visitas va de 10 a 10.000.");
        const tope = c.tope_mensual_usd === null || c.tope_mensual_usd === "" ? null : Number(c.tope_mensual_usd);
        if (tope !== null && !(tope >= 0 && tope <= 1000)) return mal("El tope mensual va de 0 a 1.000 USD.");
        await rest(`tarot_analista_config?id=eq.1`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            modelo: c.modelo, esfuerzo: c.esfuerzo, fuentes, minimo_visitas: minimo, tope_mensual_usd: tope,
            contexto_negocio: String(c.contexto_negocio ?? "").slice(0, 4000), updated_at: new Date().toISOString(),
          }),
        });
        return NextResponse.json({ ok: true });
      }
      case "agregar_bitacora": {
        const desc = String(b.descripcion ?? "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha))) return mal("Fecha inválida.");
        if (!CATEGORIAS.has(b.categoria)) return mal("Categoría inválida.");
        if (desc.length < 3 || desc.length > 500) return mal("La descripción va de 3 a 500 caracteres.");
        await rest("tarot_analista_bitacora", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ fecha: b.fecha, categoria: b.categoria, descripcion: desc }) });
        return NextResponse.json({ ok: true });
      }
      case "borrar_bitacora":
        if (typeof b.id !== "string") return mal("Falta id.");
        await rest(`tarot_analista_bitacora?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
        return NextResponse.json({ ok: true });
      case "subir_csv": {
        const texto = String(b.texto ?? "");
        if (!texto || texto.length > MAX_CSV) return mal("El archivo está vacío o es muy grande (máx. 1,5 MB).");
        if (!DESGLOSES.has(b.desglose)) return mal("Desglose inválido.");
        const leido = leerCsvMeta(texto);
        await rest("tarot_analista_meta_csv", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            nombre_archivo: String(b.nombre_archivo ?? "meta.csv").slice(0, 200), desglose: b.desglose,
            periodo_desde: leido.periodo_desde, periodo_hasta: leido.periodo_hasta,
            columnas: leido.columnas, filas: leido.filas, notas: String(b.notas ?? "").slice(0, 500) || null,
          }),
        });
        return NextResponse.json({ ok: true, filas: leido.filas.length, columnas: leido.columnas.length, periodo: [leido.periodo_desde, leido.periodo_hasta] });
      }
      case "borrar_csv":
        if (typeof b.id !== "string") return mal("Falta id.");
        await rest(`tarot_analista_meta_csv?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
        return NextResponse.json({ ok: true });
      default:
        return mal("Acción inválida.");
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
