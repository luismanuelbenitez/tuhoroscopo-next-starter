import type { Rest } from "@/lib/asistenteParte";

// Recorridos de Google Ads (2026-11-15, piloto "Tarot del amor"). Cada
// recorrido es una intención de búsqueda con su camino completo:
//   búsquedas (grupo de anuncios) → anuncio → página → checkout → venta.
// Todos terminan en el mismo checkout; lo que cambia es la página y el tema
// que llega elegido. Solo lectura: junta la foto de la cuenta que guarda el
// sync (google_ads_datos) con lo que la web midió (rpc google_ads_recorridos).
//
// Para sumar un tema (trabajo y dinero, decisiones): agregarlo acá con su
// grupo de anuncios, su página y las palabras que lo identifican.

export type DefRecorrido = {
  clave: string;
  nombre: string;
  estado: "activo" | "piloto" | "en_armado";
  grupos: string[];            // grupos de anuncios de Google que alimentan este recorrido
  pagina: string;              // página de destino
  tema: string | null;         // tema que llega elegido en el checkout
  terminos: RegExp | null;     // qué búsquedas son de este recorrido (null = el general)
  terminosTexto?: string;      // las mismas palabras, para mostrar
};

const AMOR = /(^|[^a-z])(amor|amores|pareja|novio|novia|ex|relacion|relaciones|vinculo|vinculos|enamorad[oa]s?)([^a-z]|$)/;

export const RECORRIDOS: DefRecorrido[] = [
  {
    clave: "general", nombre: "Tarot general", estado: "activo",
    grupos: ["Tarot online", "Lectura de cartas"], pagina: "/tarot", tema: null, terminos: null,
  },
  {
    clave: "amor", nombre: "Tarot del amor", estado: "piloto",
    grupos: ["Tarot de amor"], pagina: "/tarot/amor", tema: "amor", terminos: AMOR,
    terminosTexto: "amor, pareja, novio/a, ex, relación, vínculo, enamorado/a",
  },
];

type Fila = Record<string, unknown>;
const sinTilde = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[^\x20-\x7e]/g, "").toLowerCase().trim();
const num = (v: unknown) => Number(v ?? 0) || 0;

export type Chequeo = { id: string; texto: string; estado: "ok" | "falta" | "aviso"; detalle?: string };

export async function leerRecorridos(rest: Rest, dias: number) {
  const [web, datos] = await Promise.all([
    rest("rpc/google_ads_recorridos", { method: "POST", body: JSON.stringify({ p_dias: dias }) }) as Promise<{
      paginas: Fila[]; medicion: Record<string, number>; desde: string;
    }>,
    rest("google_ads_datos?clave=in.(ranking,palabras_30d)&select=clave,datos,synced_at") as Promise<{ clave: string; datos: Fila; synced_at: string }[]>,
  ]);
  const foto = Object.fromEntries(datos.map((d) => [d.clave, d.datos]));
  const ranking = (foto.ranking ?? {}) as { palabras?: Fila[]; anuncios?: Fila[]; negativas?: Fila[]; negativas_grupo?: Fila[]; desde?: string; hasta?: string };
  const palabras30 = ((foto.palabras_30d as { filas?: Fila[] } | undefined)?.filas ?? []) as Fila[];
  const lectura = datos.find((d) => d.clave === "ranking")?.synced_at ?? null;

  // Estado de cada grupo (lo informa la estructura y los anuncios).
  const estadoGrupo = new Map<string, string>();
  for (const x of [...(ranking.palabras ?? []), ...(ranking.anuncios ?? [])]) if (x.grupo && x.grupo_estado) estadoGrupo.set(String(x.grupo), String(x.grupo_estado));

  // Palabras con su costo de 30 días y su nota de calidad.
  const calidad = new Map((ranking.palabras ?? []).map((p) => [`${p.grupo}|${sinTilde(p.palabra)}|${p.concordancia}`, p]));
  const palabras = (palabras30.length ? palabras30 : (ranking.palabras ?? [])).filter((p) => !p.negativa).map((p) => {
    const q = calidad.get(`${p.grupo}|${sinTilde(p.palabra)}|${p.concordancia}`) ?? {};
    return {
      grupo: String(p.grupo ?? ""), palabra: String(p.palabra ?? ""), concordancia: String(p.concordancia ?? ""), estado: String(p.estado ?? ""),
      impresiones: num(p.impresiones), clics: num(p.clics), costo: p.costo != null ? num(p.costo) : num(q.cpc_medio) * num(p.clics),
      nivel: (q.nivel as number | null) ?? null, ctr: (q.ctr as string | null) ?? null, anuncio: (q.anuncio as string | null) ?? null, pagina: (q.pagina as string | null) ?? null,
    };
  });
  const activa = (p: { estado: string; grupo: string }) => p.estado === "ENABLED" && estadoGrupo.get(p.grupo) === "ENABLED";
  const negCampana = (ranking.negativas ?? []).map((n) => sinTilde(n.texto));
  const negGrupo = (ranking.negativas_grupo ?? null) as Fila[] | null; // null: el sync todavía no las leyó

  const recorridos = RECORRIDOS.map((r) => {
    const mias = palabras.filter((p) => r.grupos.includes(p.grupo));
    const anuncios = (ranking.anuncios ?? []).filter((a) => r.grupos.includes(String(a.grupo)) && a.estado !== "REMOVED").map((a) => ({
      grupo: String(a.grupo), estado: String(a.estado ?? ""), grupo_estado: String(a.grupo_estado ?? ""), url: (a.url as string | null) ?? null, fuerza: (a.fuerza as string | null) ?? null,
      titulos: ((a.titulos as Fila[] | undefined) ?? []).map((t) => String(t.texto ?? "")).filter(Boolean),
    }));
    const pagWeb = (web.paginas ?? []).find((p) => p.pagina === r.pagina) ?? null;
    const gruposEstado = r.grupos.map((g) => ({ nombre: g, estado: estadoGrupo.get(g) ?? "NO_EXISTE" }));
    const conNota = mias.filter((p) => p.nivel != null && p.impresiones > 0);
    const nivel = conNota.length ? Math.round((conNota.reduce((s, p) => s + (p.nivel as number) * p.impresiones, 0) / conNota.reduce((s, p) => s + p.impresiones, 0)) * 10) / 10 : null;

    // Chequeos de punta a punta.
    const chequeos: Chequeo[] = [];
    chequeos.push(r.tema
      ? { id: "checkout", texto: `La página lleva al checkout con el tema «${r.tema}» elegido`, estado: "ok" }
      : { id: "checkout", texto: "La página lleva al checkout (la persona elige el tema)", estado: "ok" });
    const medidos = num(web.medicion?.[r.pagina]);
    chequeos.push(medidos > 0
      ? { id: "medicion", texto: "La página mide qué bloques se ven y desde dónde tocan el botón", estado: "ok", detalle: `${medidos} eventos en el período` }
      : { id: "medicion", texto: "La página mide qué bloques se ven y desde dónde tocan el botón", estado: "falta", detalle: "Todavía sin eventos: se activa al publicar y empieza a contar con la primera visita." });
    const algunoActivo = gruposEstado.some((g) => g.estado === "ENABLED");
    chequeos.push(algunoActivo
      ? { id: "grupo", texto: "Grupo de anuncios activo en Google", estado: "ok", detalle: gruposEstado.map((g) => `${g.nombre}: ${g.estado === "ENABLED" ? "activo" : g.estado === "PAUSED" ? "pausado" : "no existe"}`).join(" · ") }
      : { id: "grupo", texto: "Grupo de anuncios activo en Google", estado: "falta", detalle: gruposEstado.map((g) => `${g.nombre}: ${g.estado === "PAUSED" ? "pausado" : "no existe"}`).join(" · ") + ". Se prende al enganchar con Google Ads." });
    const urlsMal = anuncios.filter((a) => a.estado === "ENABLED" && !(a.url ?? "").replace(/\/$/, "").endsWith(r.pagina));
    chequeos.push(!anuncios.length
      ? { id: "anuncio", texto: `El anuncio lleva a ${r.pagina}`, estado: "falta", detalle: "No hay anuncio en el grupo." }
      : urlsMal.length
        ? { id: "anuncio", texto: `El anuncio lleva a ${r.pagina}`, estado: "falta", detalle: urlsMal.map((a) => `${a.grupo} → ${a.url}`).join(" · ") }
        : { id: "anuncio", texto: `El anuncio lleva a ${r.pagina}`, estado: "ok" });

    // Competencia entre grupos: búsquedas de este tema que están (activas) en otros grupos.
    let compiten: typeof palabras = [];
    if (r.terminos) {
      const re = r.terminos;
      compiten = palabras.filter((p) => !r.grupos.includes(p.grupo) && p.estado === "ENABLED" && re.test(sinTilde(p.palabra)));
      chequeos.push(compiten.length
        ? { id: "compiten", texto: "Ninguna palabra de otro grupo compite con este", estado: "falta", detalle: `${compiten.length} palabra(s) de ${r.nombre.toLowerCase()} están en ${[...new Set(compiten.map((p) => p.grupo))].join(", ")}` }
        : { id: "compiten", texto: "Ninguna palabra de otro grupo compite con este", estado: "ok" });
      const otros = RECORRIDOS.find((x) => x.clave === "general")?.grupos ?? [];
      if (negGrupo === null) {
        chequeos.push({ id: "negativas", texto: `El grupo general frena las búsquedas de ${r.nombre.toLowerCase()} (negativas)`, estado: "aviso", detalle: "Se ve en la próxima lectura de la cuenta (cada hora)." });
      } else {
        const faltan = otros.filter((g) => !negGrupo.some((n) => n.grupo === g && re.test(sinTilde(n.texto))));
        chequeos.push(faltan.length
          ? { id: "negativas", texto: `El grupo general frena las búsquedas de ${r.nombre.toLowerCase()} (negativas)`, estado: "falta", detalle: `Sin negativas de este tema en: ${faltan.join(", ")}` }
          : { id: "negativas", texto: `El grupo general frena las búsquedas de ${r.nombre.toLowerCase()} (negativas)`, estado: "ok" });
      }
      const bloquea = negCampana.filter((n) => re.test(n));
      if (bloquea.length) chequeos.push({ id: "bloqueo", texto: "Ninguna negativa de toda la campaña frena a este grupo", estado: "falta", detalle: `Negativas de campaña: ${bloquea.join(", ")}` });
    }

    return {
      clave: r.clave, nombre: r.nombre, estado: r.estado, pagina: r.pagina, tema: r.tema, terminos: r.terminosTexto ?? null,
      grupos: gruposEstado,
      google: {
        impresiones: mias.reduce((s, p) => s + p.impresiones, 0), clics: mias.reduce((s, p) => s + p.clics, 0),
        costo: Math.round(mias.reduce((s, p) => s + p.costo, 0) * 100) / 100, nivel,
        palabras: mias.sort((a, b) => b.impresiones - a.impresiones || a.palabra.localeCompare(b.palabra)),
        anuncios,
      },
      web: {
        visitas: num(pagWeb?.visitas), tocaron_boton: num(pagWeb?.tocaron_boton), checkout: num(pagWeb?.checkout),
        empezaron_form: num(pagWeb?.empezaron_form), fueron_a_pagar: num(pagWeb?.fueron_a_pagar), ventas: num(pagWeb?.ventas),
        ingresos: num(pagWeb?.ingresos), temas_venta: (pagWeb?.temas_venta ?? {}) as Record<string, number>,
      },
      compiten,
      chequeos,
      listo: chequeos.every((c) => c.estado === "ok"),
    };
  });

  // Visitas de Google que entraron por otras páginas (fuera de los recorridos).
  const conocidas = new Set(RECORRIDOS.map((r) => r.pagina));
  const otras = (web.paginas ?? []).filter((p) => !conocidas.has(String(p.pagina))).map((p) => ({ pagina: String(p.pagina), visitas: num(p.visitas), ventas: num(p.ventas) }));

  return { ok: true as const, dias, desde_google: ranking.desde ?? null, hasta_google: ranking.hasta ?? null, lectura, recorridos, otras };
}
