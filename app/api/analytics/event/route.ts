import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analizarUserAgent, clasificarFuente, hostReferrer } from '@/lib/visitantes/clasificar';

// Endpoint de eventos del navegador (2026-10-22: endurecido + sesiones).
//
// Recibe lotes { sesion, eventos[] } enviados con sendBeacon (el visitante
// nunca espera esta respuesta). Protecciones, en orden y baratas primero:
//  1. Tamaño máximo del cuerpo (8 KB) y del lote (20 eventos).
//  2. Origen: Origin/Referer tiene que ser este mismo sitio.
//  3. Bots y clientes automáticos: se descartan.
//  4. Límite de frecuencia por cliente (en memoria de la instancia).
//  5. Lista de eventos permitidos y validación/recorte de cada campo.
//  6. Tope de 500 eventos por sesión (en la base, funnel_registrar_lote).
// Lo inválido se descarta en silencio con 204 (sin pistas para abusar).
// Enriquecimiento en el servidor: ubicación aproximada de las cabeceras de
// Vercel (sin guardar IP), tipo de dispositivo/SO/navegador (sin guardar el
// user agent completo), fuente clasificada y marca de tráfico interno.

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024;
const MAX_LOTE = 20;
const EVENTOS_PERMITIDOS = new Set(['page_view', 'landing_viewed', 'product_viewed', 'checkout_started']);
const PRODUCTOS_PERMITIDOS = new Set(['tarot_one_shot', 'horoscopo_diario']);
const ID_VALIDO = /^[a-z0-9-]{8,64}$/i;
const RANGOS_PANTALLA = new Set(['<360', '360-413', '414-767', '768-1023', '1024-1439', '1440+']);

const vacio = () => new NextResponse(null, { status: 204 });

// ── Límite de frecuencia (por instancia; con Fluid Compute las instancias se
// reutilizan, suficiente como freno sin infraestructura extra). Dos niveles:
//  - por sesión: 40 envíos/min (un visitante real hace unos pocos);
//  - por IP + user agent: 300/min. Holgado A PROPÓSITO: con datos móviles
//    (CGNAT) muchos usuarios comparten IP pública y el mismo modelo de
//    teléfono; un límite bajo acá descartaría visitas legítimas.
// Las claves son hashes efímeros que nunca se guardan.
const VENTANA_MS = 60_000;
const MAX_POR_SESION = 40;
const MAX_POR_CLIENTE = 300;
const contadores = new Map<string, { n: number; hasta: number }>();
async function hash(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf).slice(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function excede(clave: string, max: number): boolean {
  const ahora = Date.now();
  if (contadores.size > 20000) contadores.forEach((v, k) => { if (v.hasta < ahora) contadores.delete(k); });
  const c = contadores.get(clave);
  if (!c || c.hasta < ahora) { contadores.set(clave, { n: 1, hasta: ahora + VENTANA_MS }); return false; }
  c.n += 1;
  return c.n > max;
}

function mismoOrigen(req: Request): boolean {
  const host = req.headers.get('host');
  const origen = req.headers.get('origin') || req.headers.get('referer');
  if (!host || !origen) return false;
  try { return new URL(origen).host === host; } catch { return false; }
}

const txt = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

function decodificar(v: string | null): string | undefined {
  if (!v) return undefined;
  try { return decodeURIComponent(v).slice(0, 80); } catch { return v.slice(0, 80); }
}

export async function POST(req: Request) {
  try {
    const largo = Number(req.headers.get('content-length') ?? 0);
    if (largo > MAX_BYTES) return vacio();
    if (!mismoOrigen(req)) return vacio();

    const ua = req.headers.get('user-agent') ?? '';
    const tecnico = analizarUserAgent(ua);
    if (tecnico.es_bot || !ua) return vacio();

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    if (excede(`c:${await hash(`${ip}|${ua}`)}`, MAX_POR_CLIENTE)) return vacio();

    const crudo = await req.text();
    if (crudo.length > MAX_BYTES) return vacio();
    let body: Record<string, unknown>;
    try { body = JSON.parse(crudo); } catch { return vacio(); }

    // Formato anterior (un evento suelto) — compatibilidad durante el deploy.
    const sesionIn = (body.sesion && typeof body.sesion === 'object' ? body.sesion : { session_id: body.session_id }) as Record<string, unknown>;
    const eventosIn = Array.isArray(body.eventos) ? body.eventos : [body];

    const sessionId = txt(sesionIn.session_id, 64);
    if (!sessionId || !ID_VALIDO.test(sessionId)) return vacio();
    if (excede(`s:${sessionId}`, MAX_POR_SESION)) return vacio();
    const visitorId = txt(sesionIn.visitor_id, 64);

    const eventos = eventosIn.slice(0, MAX_LOTE).flatMap((e) => {
      if (!e || typeof e !== 'object') return [];
      const ev = e as Record<string, unknown>;
      const nombre = txt(ev.event_name, 40);
      if (!nombre || !EVENTOS_PERMITIDOS.has(nombre)) return [];
      const path = txt(ev.path, 200);
      const producto = txt(ev.product_id, 40);
      const valor = typeof ev.value === 'number' && Number.isFinite(ev.value) && ev.value >= 0 && ev.value <= 100000 ? ev.value : undefined;
      return [{
        event_name: nombre,
        path: path && path.startsWith('/') ? path : null,
        product_id: producto && PRODUCTOS_PERMITIDOS.has(producto) ? producto : null,
        product_name: producto && PRODUCTOS_PERMITIDOS.has(producto) ? txt(ev.product_name, 80) ?? null : null,
        value: valor ?? null,
        currency: ev.currency === 'UYU' || ev.currency === 'ARS' ? ev.currency : 'UYU',
      }];
    });
    if (!eventos.length) return vacio();

    const referrer = txt(sesionIn.referrer, 300);
    const referrerHost = hostReferrer(referrer);
    const utm = {
      utm_source: txt(sesionIn.utm_source, 120), utm_medium: txt(sesionIn.utm_medium, 120),
      utm_campaign: txt(sesionIn.utm_campaign, 120), utm_content: txt(sesionIn.utm_content, 120), utm_term: txt(sesionIn.utm_term, 120),
    };
    const fbclid = sesionIn.fbclid === true;
    const gclid = sesionIn.gclid === true;
    const landing = txt(sesionIn.landing_path, 200);
    const pantalla = txt(sesionIn.screen_bucket, 12);
    const esInterno = (req.headers.get('cookie') ?? '').split(/;\s*/).includes('tuo_interno=1');

    const sesion = {
      session_id: sessionId,
      visitor_id: visitorId && ID_VALIDO.test(visitorId) ? visitorId : null,
      landing_path: landing && landing.startsWith('/') ? landing : null,
      referrer: referrer ?? null,
      referrer_host: referrerHost,
      ...utm,
      fbclid, gclid,
      fuente: clasificarFuente({ ...utm, referrerHost, fbclid, gclid, in_app: tecnico.in_app }),
      device_type: tecnico.device_type,
      os: tecnico.os,
      browser: tecnico.browser,
      in_app: tecnico.in_app,
      screen_bucket: pantalla && RANGOS_PANTALLA.has(pantalla) ? pantalla : null,
      // Ubicación aproximada que agrega Vercel por cabeceras (la IP no se guarda).
      country: txt(req.headers.get('x-vercel-ip-country'), 2) ?? null,
      region: txt(req.headers.get('x-vercel-ip-country-region'), 10) ?? null,
      city: decodificar(req.headers.get('x-vercel-ip-city')) ?? null,
      es_interno: esInterno,
    };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    await supabase.rpc('funnel_registrar_lote', { p_sesion: sesion, p_eventos: eventos });
    return vacio();
  } catch {
    return vacio();
  }
}
