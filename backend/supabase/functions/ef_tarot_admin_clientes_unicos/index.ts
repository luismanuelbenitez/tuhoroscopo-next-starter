// ============================================================================
// 🧑‍🤝‍🧑 EDGE FUNCTION: ef_tarot_admin_clientes_unicos
// ============================================================================
//
// MÓDULO:
//   Tarot THC — Administración — Clientes (identidad consolidada)
//
// OBJETIVO:
//   Consolidar REGISTROS de tarot_clientes (filas crudas, tal como entraron
//   al sistema — ver /admin/tarot/clientes, ahora "Registros") en PERSONAS
//   únicas, y exponer métricas/listado/detalle sobre esa identidad
//   consolidada. Ver docs/product/DECISIONS.md 2026-08-22 (sprint "Módulo
//   Clientes V1") para la decisión de arquitectura completa.
//
// REGLA DE IDENTIDAD (no negociable, ver DECISIONS.md):
//   El nombre NUNCA identifica un cliente — es descriptivo, no identidad.
//   Dos registros son la MISMA persona si comparten teléfono normalizado
//   Y/O email normalizado (unión transitiva: A-B por teléfono, B-C por
//   email → A, B, C son una sola persona). Ver _shared/tarot-identidad.ts.
//
// PERSISTENCIA:
//   NINGUNA tabla nueva. La agrupación se calcula en cada request a partir
//   de tarot_clientes + tarot_ordenes + tarot_codigos_descuento_usos ya
//   existentes (capa de agregación administrativa, no un modelo de datos
//   paralelo). Aceptable mientras el volumen sea bajo (hoy: decenas de
//   registros). Si el volumen crece a miles, evaluar una vista materializada
//   — no implementado en V1 deliberadamente (Fase 11 del sprint).
//
// QUÉ NO HACE:
//   - NO modifica ni fusiona filas de tarot_clientes.
//   - NO borra ni altera histórico.
//   - NO calcula LTV predictivo — solo ingreso acumulado histórico observado.
//
// INPUT (POST body):
//   {
//     "vista": "resumen" | "lista" | "detalle",
//     // resumen / lista — período:
//     "periodo": 7,              // 1 | 7 | 30 | 90 (default 30)
//     "desde": "2026-08-01",     // personalizado, anula "periodo"
//     "hasta": "2026-08-20",     // opcional junto con desde
//     // lista:
//     "buscar": "nico",
//     "filtro": "todos" | "nuevos" | "recurrentes" | "sin_compra",
//     "limit": 50, "offset": 0,
//     // detalle:
//     "cliente_id": "uuid-de-cualquier-registro-de-la-persona",
//     "log": false
//   }
//
// SEGURIDAD: x-internal-key, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { normalizarTelefono, normalizarEmailIdentidad } from "../_shared/tarot-identidad.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAROT_INTERNAL_KEY = Deno.env.get("TAROT_INTERNAL_KEY") ?? "";
const FN = "ef_tarot_admin_clientes_unicos";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mismo set que /api/admin/tarot/metricas y /api/admin/tarot/adquisicion —
// una orden "pagada" es la que llegó al menos a pago_confirmado.
const ESTADOS_PAGADO = [
  "pago_confirmado", "generando_lectura", "lectura_lista",
  "generando_pdf", "pdf_listo", "enviando_whatsapp", "entregado", "entregado_simulado",
];

// ============================================================================
// Helpers básicos
// ============================================================================
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBodySafe(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

async function registrarLog(
  evento: string,
  payload: Record<string, unknown> = {},
  nivel: "debug" | "info" | "warning" | "error" | "critical" = "info",
) {
  try {
    await supabase.from("tarot_logs").insert([{
      evento, nivel, funcion_origen: FN, payload, mensaje: evento,
    }]);
  } catch (e) {
    console.error(`[${FN}] Error registrando log`, e);
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function diasEntre(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60 * 24);
}

// ============================================================================
// Tipos de datos crudos
// ============================================================================
interface RegistroCliente {
  id: string;
  nombre_completo: string;
  telefono: string;
  email: string | null;
  fecha_nacimiento: string | null;
  created_at: string;
}

interface OrdenCruda {
  id: string;
  cliente_id: string;
  estado: string;
  precio_cobrado: number;
  moneda: string;
  created_at: string;
  tema: string;
  pregunta_usuario: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
}

// ============================================================================
// Union-Find — agrupación de registros en personas
// ============================================================================
class UnionFind {
  private padre = new Map<string, string>();
  find(x: string): string {
    if (!this.padre.has(x)) this.padre.set(x, x);
    let raiz = x;
    while (this.padre.get(raiz) !== raiz) raiz = this.padre.get(raiz)!;
    // Compresión de camino
    let cur = x;
    while (this.padre.get(cur) !== raiz) {
      const next = this.padre.get(cur)!;
      this.padre.set(cur, raiz);
      cur = next;
    }
    return raiz;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.padre.set(ra, rb);
  }
}

interface Persona {
  persona_id: string;
  registro_ids: string[];
  nombre: string;
  telefono_principal: string | null;
  email_principal: string | null;
  telefonos_observados: string[];
  emails_observados: string[];
  fecha_nacimiento: string | null;
  primer_registro: string;
  ultimo_registro: string;
  compras: number;
  gastado_por_moneda: Record<string, number>;
  primera_compra: string | null;
  ultima_compra: string | null;
  dias_promedio_entre_compras: number | null;
  estado: "sin_compra" | "nuevo" | "recurrente";
}

/**
 * Agrupa registros de tarot_clientes en personas únicas por teléfono y/o
 * email normalizados (unión transitiva vía Union-Find), y consolida sus
 * órdenes pagadas. Sin persistencia — recalculado en cada request.
 */
function construirPersonas(registros: RegistroCliente[], ordenes: OrdenCruda[]): Persona[] {
  const uf = new UnionFind();
  const porTelefono = new Map<string, string>(); // telefono normalizado → primer registro_id visto
  const porEmail = new Map<string, string>();     // email normalizado → primer registro_id visto

  for (const r of registros) {
    uf.find(r.id); // asegura que exista como nodo aunque no se una a nadie
    const tel = normalizarTelefono(r.telefono);
    if (tel) {
      const existente = porTelefono.get(tel);
      if (existente) uf.union(r.id, existente);
      else porTelefono.set(tel, r.id);
    }
    const mail = normalizarEmailIdentidad(r.email);
    if (mail) {
      const existente = porEmail.get(mail);
      if (existente) uf.union(r.id, existente);
      else porEmail.set(mail, r.id);
    }
  }

  // Agrupar registros por raíz de Union-Find
  const gruposPorRaiz = new Map<string, RegistroCliente[]>();
  for (const r of registros) {
    const raiz = uf.find(r.id);
    const lista = gruposPorRaiz.get(raiz) ?? [];
    lista.push(r);
    gruposPorRaiz.set(raiz, lista);
  }

  // Órdenes pagadas indexadas por cliente_id (registro_id)
  const ordenesPorRegistro = new Map<string, OrdenCruda[]>();
  for (const o of ordenes) {
    if (!ESTADOS_PAGADO.includes(o.estado)) continue;
    const lista = ordenesPorRegistro.get(o.cliente_id) ?? [];
    lista.push(o);
    ordenesPorRegistro.set(o.cliente_id, lista);
  }

  const personas: Persona[] = [];

  for (const grupo of gruposPorRaiz.values()) {
    const ordenado = [...grupo].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const masReciente = ordenado[ordenado.length - 1];
    const masAntiguo = ordenado[0];

    // persona_id estable: el registro MÁS ANTIGUO del grupo — no cambia
    // aunque lleguen nuevos registros que se unan a esta persona más tarde.
    const personaId = masAntiguo.id;

    const telefonosObservados = Array.from(
      new Set(ordenado.map((r) => normalizarTelefono(r.telefono)).filter((t): t is string => !!t)),
    );
    const emailsObservados = Array.from(
      new Set(ordenado.map((r) => r.email).filter((e): e is string => !!e && e.trim() !== "")),
    );

    const telefonoPrincipal = [...ordenado].reverse()
      .map((r) => normalizarTelefono(r.telefono)).find((t) => !!t) ?? null;
    const emailPrincipal = [...ordenado].reverse()
      .map((r) => r.email).find((e) => !!e && e.trim() !== "") ?? null;
    const fechaNacimiento = [...ordenado].reverse()
      .map((r) => r.fecha_nacimiento).find((f) => !!f) ?? null;

    const ordenesPersona = ordenado.flatMap((r) => ordenesPorRegistro.get(r.id) ?? []);
    const ordenesOrdenadas = [...ordenesPersona].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const gastadoPorMoneda: Record<string, number> = {};
    for (const o of ordenesOrdenadas) {
      gastadoPorMoneda[o.moneda] = (gastadoPorMoneda[o.moneda] ?? 0) + num(o.precio_cobrado);
    }

    let diasPromedio: number | null = null;
    if (ordenesOrdenadas.length >= 2) {
      let sumaDias = 0;
      for (let i = 1; i < ordenesOrdenadas.length; i++) {
        sumaDias += diasEntre(ordenesOrdenadas[i - 1].created_at, ordenesOrdenadas[i].created_at);
      }
      diasPromedio = sumaDias / (ordenesOrdenadas.length - 1);
    }

    const compras = ordenesOrdenadas.length;
    const estado: Persona["estado"] = compras === 0 ? "sin_compra" : compras === 1 ? "nuevo" : "recurrente";

    personas.push({
      persona_id: personaId,
      registro_ids: ordenado.map((r) => r.id),
      nombre: masReciente.nombre_completo,
      telefono_principal: telefonoPrincipal,
      email_principal: emailPrincipal,
      telefonos_observados: telefonosObservados,
      emails_observados: emailsObservados,
      fecha_nacimiento: fechaNacimiento,
      primer_registro: masAntiguo.created_at,
      ultimo_registro: masReciente.created_at,
      compras,
      gastado_por_moneda: gastadoPorMoneda,
      primera_compra: ordenesOrdenadas[0]?.created_at ?? null,
      ultima_compra: ordenesOrdenadas[ordenesOrdenadas.length - 1]?.created_at ?? null,
      dias_promedio_entre_compras: diasPromedio,
      estado,
    });
  }

  return personas;
}

// ============================================================================
// Carga de datos crudos (compartida por las 3 vistas)
// ============================================================================
async function cargarCrudos(): Promise<{ registros: RegistroCliente[]; ordenes: OrdenCruda[] } | { error: string }> {
  const { data: registros, error: errReg } = await supabase
    .from("tarot_clientes")
    .select("id, nombre_completo, telefono, email, fecha_nacimiento, created_at")
    .is("deleted_at", null);
  if (errReg) return { error: errReg.message };

  const { data: ordenes, error: errOrd } = await supabase
    .from("tarot_ordenes")
    .select("id, cliente_id, estado, precio_cobrado, moneda, created_at, tema, pregunta_usuario, utm_source, utm_campaign");
  if (errOrd) return { error: errOrd.message };

  return {
    registros: (registros ?? []) as RegistroCliente[],
    ordenes: (ordenes ?? []) as OrdenCruda[],
  };
}

// ============================================================================
// Fechas de período
// ============================================================================
const PERIODOS_VALIDOS = new Set([1, 7, 30, 90]);

function calcularPeriodo(body: Record<string, unknown>): { desde: string; hasta: string | null } {
  const desdeParam = typeof body.desde === "string" ? body.desde : null;
  const hastaParam = typeof body.hasta === "string" ? body.hasta : null;
  if (desdeParam) {
    return {
      desde: new Date(desdeParam).toISOString(),
      hasta: hastaParam ? new Date(hastaParam).toISOString() : null,
    };
  }
  const periodoRaw = Number(body.periodo);
  const periodoDias = PERIODOS_VALIDOS.has(periodoRaw) ? periodoRaw : 30;
  return { desde: new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000).toISOString(), hasta: null };
}

function enPeriodo(fechaIso: string, desde: string, hasta: string | null): boolean {
  const t = new Date(fechaIso).getTime();
  if (t < new Date(desde).getTime()) return false;
  if (hasta && t > new Date(hasta).getTime()) return false;
  return true;
}

// ============================================================================
// Vista: resumen (Fase 6 — visión general)
// ============================================================================
function resumenPeriodo(personas: Persona[], ordenes: OrdenCruda[], desde: string, hasta: string | null) {
  const ordenesPagadas = ordenes.filter((o) => ESTADOS_PAGADO.includes(o.estado));
  const ordenesPeriodo = ordenesPagadas.filter((o) => enPeriodo(o.created_at, desde, hasta));

  // Mapear cada orden del período a su persona (vía registro_ids)
  const registroAPersona = new Map<string, Persona>();
  for (const p of personas) for (const rid of p.registro_ids) registroAPersona.set(rid, p);

  const personaIdsEnPeriodo = new Set<string>();
  const comprasPorPersonaPeriodo = new Map<string, OrdenCruda[]>();
  for (const o of ordenesPeriodo) {
    const persona = registroAPersona.get(o.cliente_id);
    if (!persona) continue;
    personaIdsEnPeriodo.add(persona.persona_id);
    const lista = comprasPorPersonaPeriodo.get(persona.persona_id) ?? [];
    lista.push(o);
    comprasPorPersonaPeriodo.set(persona.persona_id, lista);
  }

  const compradoresPeriodo = personaIdsEnPeriodo.size;

  // Nuevos en período: su PRIMERA compra pagada histórica (persona.primera_compra) cae en el período.
  let nuevosPeriodo = 0;
  let recurrentesPeriodo = 0;
  for (const personaId of personaIdsEnPeriodo) {
    const persona = personas.find((p) => p.persona_id === personaId)!;
    if (persona.primera_compra && enPeriodo(persona.primera_compra, desde, hasta)) {
      nuevosPeriodo++;
    } else {
      recurrentesPeriodo++;
    }
  }

  const clientesConCompraTotal = personas.filter((p) => p.compras > 0).length;
  const clientesRecurrentesTotal = personas.filter((p) => p.compras >= 2).length;
  const pctRecurrenciaHistorico = clientesConCompraTotal > 0
    ? clientesRecurrentesTotal / clientesConCompraTotal
    : null;

  const comprasPeriodo = ordenesPeriodo.length;
  const comprasPorClientePeriodo = compradoresPeriodo > 0 ? comprasPeriodo / compradoresPeriodo : null;

  const ingresoTotalPeriodo: Record<string, number> = {};
  for (const o of ordenesPeriodo) {
    ingresoTotalPeriodo[o.moneda] = (ingresoTotalPeriodo[o.moneda] ?? 0) + num(o.precio_cobrado);
  }

  const ingresoPromedioPorCliente: Record<string, number> | null = compradoresPeriodo > 0
    ? Object.fromEntries(Object.entries(ingresoTotalPeriodo).map(([m, v]) => [m, v / compradoresPeriodo]))
    : null;

  const ticketPromedio: Record<string, number> | null = comprasPeriodo > 0
    ? Object.fromEntries(
        Object.entries(ingresoTotalPeriodo).map(([m, v]) => {
          const nOrdenesMoneda = ordenesPeriodo.filter((o) => o.moneda === m).length;
          return [m, nOrdenesMoneda > 0 ? v / nOrdenesMoneda : 0];
        }),
      )
    : null;

  return {
    clientes_unicos_total: clientesConCompraTotal,
    clientes_recurrentes_historico: clientesRecurrentesTotal,
    compradores_periodo: compradoresPeriodo,
    nuevos_periodo: nuevosPeriodo,
    recurrentes_periodo: recurrentesPeriodo,
    pct_recurrencia_historico: pctRecurrenciaHistorico,
    compras_periodo: comprasPeriodo,
    compras_por_cliente_periodo: comprasPorClientePeriodo,
    ingreso_total_periodo_por_moneda: ingresoTotalPeriodo,
    ingreso_promedio_por_cliente_periodo_por_moneda: ingresoPromedioPorCliente,
    ticket_promedio_periodo_por_moneda: ticketPromedio,
  };
}

// ============================================================================
// 🚀 HANDLER
// ============================================================================
serve(async (req) => {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== TAROT_INTERNAL_KEY) {
    return json({ ok: false, motivo: "unauthorized" }, 401);
  }
  if (req.method !== "POST") {
    return json({ ok: false, motivo: "metodo_no_permitido", mensaje: "Usar POST." }, 405);
  }

  const body = await readBodySafe(req);
  const vista = typeof body.vista === "string" ? body.vista : "resumen";
  const shouldLog = body.log === true;

  const crudos = await cargarCrudos();
  if ("error" in crudos) {
    await registrarLog("clientes_unicos_error", { error: crudos.error }, "error");
    return json({ ok: false, motivo: "clientes_unicos_error", error: crudos.error }, 500);
  }

  const personas = construirPersonas(crudos.registros, crudos.ordenes);

  if (vista === "resumen") {
    const { desde, hasta } = calcularPeriodo(body);
    const resumen = resumenPeriodo(personas, crudos.ordenes, desde, hasta);
    return json({
      ok: true,
      funcion: FN,
      vista: "resumen",
      desde,
      hasta,
      registros_totales: crudos.registros.length,
      personas_totales: personas.length,
      resumen,
    });
  }

  if (vista === "lista") {
    const buscar = typeof body.buscar === "string" ? body.buscar.trim().toLowerCase() : "";
    const filtro = typeof body.filtro === "string" ? body.filtro : "todos";
    const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
    const offset = Math.max(0, Number(body.offset) || 0);

    let filtradas = personas;
    if (buscar) {
      filtradas = filtradas.filter((p) =>
        p.nombre.toLowerCase().includes(buscar) ||
        p.telefonos_observados.some((t) => t.toLowerCase().includes(buscar)) ||
        p.emails_observados.some((e) => e.toLowerCase().includes(buscar)),
      );
    }
    if (filtro === "nuevos") filtradas = filtradas.filter((p) => p.estado === "nuevo");
    else if (filtro === "recurrentes") filtradas = filtradas.filter((p) => p.estado === "recurrente");
    else if (filtro === "sin_compra") filtradas = filtradas.filter((p) => p.estado === "sin_compra");

    // Orden: por actividad más reciente (última compra, si no última registro)
    filtradas = [...filtradas].sort((a, b) => {
      const fa = a.ultima_compra ?? a.ultimo_registro;
      const fb = b.ultima_compra ?? b.ultimo_registro;
      return new Date(fb).getTime() - new Date(fa).getTime();
    });

    const total = filtradas.length;
    const pagina = filtradas.slice(offset, offset + limit);

    if (shouldLog) {
      await registrarLog("clientes_unicos_listado", { buscar, filtro, total, limit, offset });
    }

    return json({
      ok: true,
      funcion: FN,
      vista: "lista",
      paginacion: { total, limit, offset, next_offset: total > offset + limit ? offset + limit : null },
      personas: pagina,
    });
  }

  if (vista === "detalle") {
    const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : null;
    if (!clienteId) {
      return json({ ok: false, motivo: "cliente_id_requerido" }, 400);
    }
    const persona = personas.find((p) => p.registro_ids.includes(clienteId));
    if (!persona) {
      return json({ ok: false, motivo: "persona_no_encontrada" }, 404);
    }

    // Historial de órdenes (todas, no solo pagadas) de todos los registros de la persona
    const ordenesPersona = crudos.ordenes
      .filter((o) => persona.registro_ids.includes(o.cliente_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const ordenIds = ordenesPersona.map((o) => o.id);
    let descuentosPorOrden: Record<string, { descuento_aplicado: number; codigo_id: string }> = {};
    if (ordenIds.length > 0) {
      const { data: usos } = await supabase
        .from("tarot_codigos_descuento_usos")
        .select("orden_id, descuento_aplicado, codigo_id, estado_uso")
        .in("orden_id", ordenIds)
        .eq("estado_uso", "aplicado");
      descuentosPorOrden = Object.fromEntries(
        (usos ?? []).map((u) => [u.orden_id as string, {
          descuento_aplicado: num(u.descuento_aplicado),
          codigo_id: u.codigo_id as string,
        }]),
      );
    }

    // Registros individuales (para mostrar "nombres observados" con su fecha)
    const registrosPersona = crudos.registros
      .filter((r) => persona.registro_ids.includes(r.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (shouldLog) {
      await registrarLog("clientes_unicos_detalle", { persona_id: persona.persona_id, cliente_id: clienteId });
    }

    return json({
      ok: true,
      funcion: FN,
      vista: "detalle",
      persona,
      registros: registrosPersona.map((r) => ({
        id: r.id, nombre_completo: r.nombre_completo, telefono: r.telefono,
        email: r.email, created_at: r.created_at,
      })),
      ordenes: ordenesPersona.map((o) => ({
        id: o.id, estado: o.estado, tema: o.tema, pregunta_usuario: o.pregunta_usuario,
        precio_cobrado: o.precio_cobrado, moneda: o.moneda, created_at: o.created_at,
        utm_source: o.utm_source, utm_campaign: o.utm_campaign,
        descuento_aplicado: descuentosPorOrden[o.id]?.descuento_aplicado ?? null,
      })),
    });
  }

  return json({ ok: false, motivo: "vista_invalida", mensaje: "vista debe ser resumen | lista | detalle" }, 400);
});
