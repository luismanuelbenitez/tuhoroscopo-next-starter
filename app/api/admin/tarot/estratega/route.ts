import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdminSession } from "@/lib/adminSession";
import { restSupabase } from "@/lib/asistenteParte";
import { claveAnalista } from "@/lib/analista/informe";
import { HERRAMIENTAS, correrHerramienta } from "@/lib/estratega/herramientas";
import { MODELO_ESTRATEGA, generarInformeSemanal, lunesDeLaSemana, responderChat } from "@/lib/estratega/motor";

// Estratega de anuncios (2026-11-04). GET: todo lo de la página (documentos,
// conversaciones, informes, propuestas y la lista de consultas); con
// ?conversacion=, ?mensaje= o ?informe= trae uno puntual (la pantalla los
// consulta mientras se generan); con ?vista_previa=<consulta> corre esa
// consulta de ejemplo. POST: preguntar, generar el informe, editar un
// documento, aceptar / descartar una propuesta y borrar una conversación.
// Nada de esto toca Meta, Google ni clientes.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f-]{36}$/i;
const fechaCorta = () => new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Montevideo" });

export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
  const rest = restSupabase();
  if (!rest) return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  const p = req.nextUrl.searchParams;
  try {
    const conversacion = p.get("conversacion");
    if (conversacion) {
      if (!UUID.test(conversacion)) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });
      const mensajes = await rest(`estratega_mensajes?conversacion_id=eq.${conversacion}&select=*&order=created_at.asc`);
      const ids = (mensajes as { id: string }[]).map((m) => m.id);
      const propuestas = ids.length ? await rest(`estratega_propuestas?mensaje_id=in.(${ids.join(",")})&select=*&order=created_at.asc`) : [];
      return NextResponse.json({ ok: true, mensajes, propuestas });
    }
    const mensaje = p.get("mensaje");
    if (mensaje) {
      if (!UUID.test(mensaje)) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });
      const [fila] = await rest(`estratega_mensajes?id=eq.${mensaje}&select=*`);
      const propuestas = await rest(`estratega_propuestas?mensaje_id=eq.${mensaje}&select=*&order=created_at.asc`);
      return NextResponse.json({ ok: !!fila, mensaje: fila ?? null, propuestas });
    }
    const informe = p.get("informe");
    if (informe) {
      if (!UUID.test(informe)) return NextResponse.json({ ok: false, motivo: "id_invalido" }, { status: 400 });
      const [fila] = await rest(`estratega_informes?id=eq.${informe}&select=*`);
      const propuestas = await rest(`estratega_propuestas?informe_id=eq.${informe}&select=*&order=created_at.asc`);
      return NextResponse.json({ ok: !!fila, informe: fila ?? null, propuestas });
    }
    const vista = p.get("vista_previa");
    if (vista) {
      const h = HERRAMIENTAS.find((x) => x.name === vista);
      if (!h || !h.ejemplo) return NextResponse.json({ ok: false, motivo: "sin_vista_previa" }, { status: 400 });
      const r = await correrHerramienta(rest, h.name, h.ejemplo, {});
      return NextResponse.json({ ok: !r.error, entrada: h.ejemplo, resultado: r.texto });
    }
    const [documentos, conversaciones, informes, propuestas] = await Promise.all([
      rest("estratega_documentos?select=*&order=orden.asc"),
      rest("estratega_conversaciones?select=id,titulo,created_at,updated_at&order=updated_at.desc&limit=30"),
      rest("estratega_informes?select=id,semana,origen,estado,costo_usd,error,created_at&order=created_at.desc&limit=12"),
      rest("estratega_propuestas?estado=eq.propuesta&select=*&order=created_at.desc&limit=30"),
    ]);
    return NextResponse.json({
      ok: true, configurado: !!claveAnalista(), modelo: MODELO_ESTRATEGA,
      documentos, conversaciones, informes, propuestas,
      herramientas: HERRAMIENTAS.map(({ name, titulo, description, ejemplo }) => ({ name, titulo, description, vista_previa: !!ejemplo })),
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
  const ahora = new Date().toISOString();
  const rep = { Prefer: "return=representation" };
  try {
    switch (b?.accion) {
      case "preguntar": {
        const texto = String(b.texto ?? "").trim();
        if (texto.length < 2 || texto.length > 4000) return mal("La pregunta va de 2 a 4.000 caracteres.");
        if (!claveAnalista()) return mal("Falta la clave de Anthropic del panel en Vercel.");
        let conversacionId = typeof b.conversacion_id === "string" && UUID.test(b.conversacion_id) ? b.conversacion_id : null;
        if (conversacionId) {
          await rest(`estratega_conversaciones?id=eq.${conversacionId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: ahora }) });
        } else {
          const [c] = await rest("estratega_conversaciones", { method: "POST", headers: rep, body: JSON.stringify({ titulo: texto.slice(0, 80) }) });
          conversacionId = c.id;
        }
        const [pregunta] = await rest("estratega_mensajes", { method: "POST", headers: rep, body: JSON.stringify({ conversacion_id: conversacionId, rol: "user", texto }) });
        const [respuesta] = await rest("estratega_mensajes", { method: "POST", headers: rep, body: JSON.stringify({ conversacion_id: conversacionId, rol: "assistant", estado: "generando" }) });
        waitUntil(responderChat(rest, conversacionId!, respuesta.id));
        return NextResponse.json({ ok: true, conversacion_id: conversacionId, pregunta, respuesta });
      }
      case "generar_informe": {
        if (!claveAnalista()) return mal("Falta la clave de Anthropic del panel en Vercel.");
        const enCurso = await rest(`estratega_informes?estado=eq.generando&created_at=gte.${new Date(Date.now() - 10 * 60_000).toISOString()}&select=id`);
        if ((enCurso as unknown[]).length) return mal("Ya hay un informe generándose.");
        const [fila] = await rest("estratega_informes", { method: "POST", headers: rep, body: JSON.stringify({ semana: lunesDeLaSemana(), origen: "manual" }) });
        waitUntil(generarInformeSemanal(rest, fila.id));
        return NextResponse.json({ ok: true, informe: fila });
      }
      case "guardar_documento": {
        const clave = String(b.clave ?? "");
        const contenido = String(b.contenido ?? "");
        if (!/^[a-z_]{2,40}$/.test(clave)) return mal("Documento inválido.");
        if (contenido.length > 30_000) return mal("El documento no puede pasar de 30.000 caracteres.");
        await rest(`estratega_documentos?clave=eq.${clave}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ contenido, updated_at: ahora, updated_por: "manuel" }) });
        return NextResponse.json({ ok: true });
      }
      case "aceptar_propuesta":
      case "descartar_propuesta": {
        const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : null;
        if (!id) return mal("Falta id.");
        const [prop] = await rest(`estratega_propuestas?id=eq.${id}&estado=eq.propuesta&select=*`);
        if (!prop) return mal("La propuesta ya no está abierta.");
        if (b.accion === "descartar_propuesta") {
          await rest(`estratega_propuestas?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "descartada", resuelta_at: ahora }) });
          return NextResponse.json({ ok: true });
        }
        // Aceptada: pasa a Pendientes (de Manuel) y se anota en "Decisiones tomadas".
        const [pend] = await rest("admin_pendientes", {
          method: "POST", headers: rep,
          body: JSON.stringify({
            titulo: String(prop.titulo).slice(0, 160), detalle: prop.detalle, area: "anuncios", responsable: "manuel",
            prioridad: prop.prioridad, estado: "abierto", origen: "asistente", origen_ref: `estratega_${id}`, enlace: "/admin/tarot/estratega",
          }),
        });
        const [dec] = await rest("estratega_documentos?clave=eq.decisiones&select=contenido");
        const linea = `- ${fechaCorta()}: ${prop.titulo} (aceptada desde el Estratega; en Pendientes).`;
        await rest("estratega_documentos?clave=eq.decisiones", {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ contenido: `${(dec?.contenido ?? "# Decisiones tomadas\n").trimEnd()}\n${linea}\n`, updated_at: ahora, updated_por: "manuel" }),
        });
        await rest(`estratega_propuestas?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "aceptada", pendiente_id: pend?.id ?? null, resuelta_at: ahora }) });
        return NextResponse.json({ ok: true, pendiente_id: pend?.id ?? null });
      }
      case "borrar_conversacion": {
        const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : null;
        if (!id) return mal("Falta id.");
        await rest(`estratega_conversaciones?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ ok: false, motivo: "accion_desconocida" }, { status: 400 });
    }
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
