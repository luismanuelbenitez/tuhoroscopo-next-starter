// Ejecuciones del pipeline Tarot (2026-10-31): reconstruye, a partir de
// tarot_logs, qué pasos corrió cada compra, cuánto tardó cada uno y si salió
// bien. Solo lectura: no cambia nada del backend, usa los eventos que las EFs
// ya registran. Lo usan /api/admin/tarot/ejecuciones y su página.

export type LogEjecucion = {
  orden_id: string;
  evento: string;
  nivel: string | null;
  mensaje: string | null;
  duracion_ms: number | null;
  funcion_origen: string | null;
  created_at: string;
};

export type EstadoPaso = "ok" | "lento" | "reintento" | "error" | "en_curso" | "pendiente" | "omitido" | "bloqueado";

export type Paso = {
  clave: "lectura" | "pdf" | "whatsapp" | "email" | "audio";
  nombre: string;
  estado: EstadoPaso;
  inicio: string | null;
  fin: string | null;
  ms: number | null;
  nota: string | null;
};

export type Ejecucion = {
  inicio: string | null;          // pago confirmado / cortesía confirmada
  fin: string | null;             // última entrega (WhatsApp o email)
  total_ms: number | null;
  pago_espera_ms: number | null;  // de crear la orden a pagar (tiempo del cliente)
  pasos: Paso[];
  corridas: number;               // veces que se armó el PDF (1 = normal)
  avisos: string[];               // cosas raras pero controladas (duplicados, bloqueos)
  resultado: "ok" | "con_avisos" | "error" | "en_curso" | "sin_iniciar";
};

const NOMBRES: Record<Paso["clave"], string> = {
  lectura: "Lectura IA", pdf: "PDF", whatsapp: "WhatsApp", email: "Email", audio: "Audio",
};

// Tiempos de referencia (promedios reales al 2026-10-31). Un paso que tarda
// más de 1,8× su referencia se marca "lento".
export const REFERENCIA_MS: Record<Paso["clave"], number> = {
  lectura: 45_000, pdf: 7_500, whatsapp: 11_000, email: 12_000, audio: 25_000,
};
const FACTOR_LENTO = 1.8;
const TRABADO_MS = 30 * 60_000;

const ms = (a: string | null, b: string | null) =>
  a && b ? Math.max(0, new Date(b).getTime() - new Date(a).getTime()) : null;

/** Arma la ejecución de UNA orden. `logs` deben venir ordenados por fecha. */
export function armarEjecucion(crudos: LogEjecucion[], ahora = Date.now()): Ejecucion {
  // Horas a ISO UTC: la base las devuelve con zona (-03:00) y acá se comparan como texto.
  const logs = crudos.map((l) => ({ ...l, created_at: new Date(l.created_at).toISOString() }));
  const primero = (ev: string, desde?: string | null) =>
    logs.find((l) => l.evento === ev && (!desde || l.created_at >= desde)) ?? null;
  const contar = (ev: string) => logs.filter((l) => l.evento === ev).length;

  const creada = primero("orden_creada");
  const pagoLog = primero("pago_confirmado") ?? primero("orden_cortesia_confirmada");
  const inicio = pagoLog?.created_at ?? null;
  const avisos: string[] = [];

  // Lectura: la primera que terminó; si no terminó ninguna, el último intento.
  const completada = primero("lectura_completada");
  const lecIni = primero("lectura_iniciada");
  const errLectura = logs.filter((l) => l.evento === "lectura_error");
  let lectura: Paso;
  if (completada) {
    const ini = logs.filter((l) => l.evento === "lectura_iniciada" && l.created_at <= completada.created_at).pop() ?? lecIni;
    const dur = completada.duracion_ms ?? ms(ini?.created_at ?? null, completada.created_at);
    const arranco = dur != null ? new Date(new Date(completada.created_at).getTime() - dur).toISOString() : ini?.created_at ?? null;
    // Solo cuentan los fallos que terminaron antes de que arrancara el intento
    // bueno; los que ocurrieron en paralelo son de una invocación duplicada.
    const previos = errLectura.filter((e) => arranco && e.created_at < arranco).length;
    lectura = {
      clave: "lectura", nombre: NOMBRES.lectura, inicio: arranco, fin: completada.created_at, ms: dur,
      estado: previos > 0 ? "reintento" : dur && dur > REFERENCIA_MS.lectura * FACTOR_LENTO ? "lento" : "ok",
      nota: previos > 0 ? `${previos} intento${previos > 1 ? "s" : ""} fallido${previos > 1 ? "s" : ""} antes` : null,
    };
  } else if (errLectura.length) {
    const e = errLectura[errLectura.length - 1];
    lectura = { clave: "lectura", nombre: NOMBRES.lectura, inicio: lecIni?.created_at ?? null, fin: e.created_at, ms: e.duracion_ms, estado: "error", nota: e.mensaje };
  } else {
    lectura = pasoAbierto("lectura", lecIni?.created_at ?? null, ahora);
  }
  if (contar("lectura_descartada_concurrencia")) avisos.push("Llegó un pedido duplicado de lectura: se descartó y no salió");
  if (contar("lectura_ya_existe")) avisos.push("Se pidió otra lectura pero ya existía: no se hizo nada");
  if (contar("lectura_cartas_normalizado")) avisos.push("La IA devolvió las cartas en otro formato y se corrigió solo");

  // PDF: el primero que terminó después de la lectura.
  const desdeLec = completada?.created_at ?? null;
  const pdfFin = desdeLec ? primero("pdf_generado", desdeLec) : null;
  const pdfIni = desdeLec ? primero("pdf_iniciado", desdeLec) : null;
  const pdfErr = desdeLec ? logs.find((l) => l.funcion_origen === "ef_tarot_generar_pdf" && l.nivel === "error" && l.created_at >= desdeLec) ?? null : null;
  const pdf: Paso = pdfFin
    ? cerrado("pdf", pdfIni?.created_at ?? null, pdfFin.created_at, pdfFin.duracion_ms)
    : pdfErr
      ? { clave: "pdf", nombre: NOMBRES.pdf, inicio: pdfIni?.created_at ?? null, fin: pdfErr.created_at, ms: null, estado: "error", nota: pdfErr.mensaje }
      : completada ? pasoAbierto("pdf", pdfIni?.created_at ?? null, ahora) : pendiente("pdf");
  const corridas = contar("pdf_iniciado");

  // Entregas: corren en paralelo después del PDF.
  const desdePdf = pdfFin?.created_at ?? null;
  const whatsapp = entrega("whatsapp", logs, desdePdf, "wa_iniciando", "wa_enviado", "ef_tarot_enviar_whatsapp", "wa_reenvio_bloqueado", ahora);
  const email = contar("entrega_email_omitida_por_config") && !primero("email_enviado")
    ? { ...pendiente("email"), estado: "omitido" as const, nota: "No pidió email" }
    : entrega("email", logs, desdePdf, "email_preparado", "email_enviado", "ef_tarot_enviar_email", "email_reenvio_bloqueado", ahora);
  if (contar("wa_reenvio_bloqueado") + contar("email_reenvio_bloqueado")) avisos.push("Se bloquearon reenvíos al cliente (protección: ya se le había entregado)");
  if (contar("wa_recuperacion_automatica")) avisos.push("El WhatsApp falló y se recuperó solo");
  if (contar("wa_recuperacion_manual")) avisos.push("El WhatsApp se colgó y se recuperó a mano");
  if (contar("email_cabezal_no_listo")) avisos.push("El email salió sin la imagen de cabecera (no estuvo lista a tiempo)");
  if (contar("entrega_acceso_web_reusado")) avisos.push("Se reutilizó el mismo link de la lectura (no cambió)");

  // Audio: arranca al terminar la lectura y corre en paralelo.
  const audioFin = desdeLec ? primero("audio_resumen_generado", desdeLec) : null;
  const audio: Paso = audioFin
    ? cerrado("audio", desdeLec, audioFin.created_at, null)
    : completada ? pasoAbierto("audio", desdeLec, ahora) : pendiente("audio");

  if (contar("pago_duplicado_ignorado") || contar("pago_confirmado") > 1) avisos.push("Mercado Pago avisó el pago más de una vez");
  if (corridas > 1) avisos.push(`El PDF se armó ${corridas} veces (regeneraciones manuales o reintentos)`);

  // Si el WhatsApp salió, un paso sin registro no es un error: falta el dato.
  const pasos = [lectura, pdf, whatsapp, email, audio].map((p) =>
    whatsapp.estado !== "pendiente" && whatsapp.estado !== "en_curso" && whatsapp.estado !== "error" && p.estado === "pendiente"
      ? { ...p, estado: "omitido" as const, nota: "Sin registro" }
      : p);
  const entregas = [whatsapp.fin, email.estado === "ok" || email.estado === "lento" ? email.fin : null].filter(Boolean) as string[];
  const fin = whatsapp.fin && (whatsapp.estado !== "error") ? entregas.sort().pop() ?? null : null;

  let resultado: Ejecucion["resultado"];
  if (!inicio) resultado = "sin_iniciar";
  else if (pasos.some((p) => p.estado === "error")) resultado = "error";
  else if (pasos.some((p) => p.estado === "en_curso" || p.estado === "pendiente")) {
    resultado = pasos.some((p) => p.estado === "en_curso") || (ahora - new Date(inicio).getTime() < TRABADO_MS) ? "en_curso" : "error";
  } else resultado = avisos.length || pasos.some((p) => p.estado === "reintento" || p.estado === "lento") ? "con_avisos" : "ok";

  return {
    inicio, fin, total_ms: ms(inicio, fin),
    pago_espera_ms: ms(creada?.created_at ?? null, inicio),
    pasos, corridas, avisos, resultado,
  };
}

function cerrado(clave: Paso["clave"], inicio: string | null, fin: string, dur: number | null): Paso {
  const d = dur ?? ms(inicio, fin);
  return { clave, nombre: NOMBRES[clave], inicio, fin, ms: d, estado: d && d > REFERENCIA_MS[clave] * FACTOR_LENTO ? "lento" : "ok", nota: null };
}
function pendiente(clave: Paso["clave"]): Paso {
  return { clave, nombre: NOMBRES[clave], inicio: null, fin: null, ms: null, estado: "pendiente", nota: null };
}
function pasoAbierto(clave: Paso["clave"], inicio: string | null, ahora: number): Paso {
  if (!inicio) return pendiente(clave);
  const trabado = ahora - new Date(inicio).getTime() > TRABADO_MS;
  return { clave, nombre: NOMBRES[clave], inicio, fin: null, ms: null, estado: trabado ? "error" : "en_curso", nota: trabado ? "Empezó y no terminó (trabado)" : null };
}
function entrega(
  clave: "whatsapp" | "email", logs: LogEjecucion[], desde: string | null,
  evIni: string, evFin: string, funcion: string, evBloqueo: string, ahora: number,
): Paso {
  if (!desde) return pendiente(clave);
  const ini = logs.find((l) => l.evento === evIni && l.created_at >= desde) ?? null;
  const fin = logs.find((l) => l.evento === evFin && l.created_at >= desde) ?? null;
  if (fin) {
    // Si hubo más de un intento (ej. se colgó y se reintentó), el tiempo real
    // es desde el primer intento hasta que salió.
    const intentos = logs.filter((l) => l.evento === evIni && l.created_at >= desde && l.created_at <= fin.created_at).length;
    if (intentos > 1) {
      return { clave, nombre: NOMBRES[clave], inicio: ini?.created_at ?? desde, fin: fin.created_at, ms: ms(ini?.created_at ?? desde, fin.created_at),
        estado: "reintento", nota: `Salió en el intento ${intentos}` };
    }
    return cerrado(clave, ini?.created_at ?? desde, fin.created_at, fin.duracion_ms);
  }
  const err = logs.find((l) => l.funcion_origen === funcion && l.nivel === "error" && l.created_at >= desde) ?? null;
  if (err) return { clave, nombre: NOMBRES[clave], inicio: ini?.created_at ?? null, fin: err.created_at, ms: null, estado: "error", nota: err.mensaje ?? err.evento };
  const bloq = logs.find((l) => l.evento === evBloqueo && l.created_at >= desde) ?? null;
  if (bloq) return { clave, nombre: NOMBRES[clave], inicio: bloq.created_at, fin: bloq.created_at, ms: 0, estado: "bloqueado", nota: "Reenvío bloqueado por seguridad" };
  return pasoAbierto(clave, ini?.created_at ?? desde, ahora);
}

// Texto humano de cada evento, para la línea de tiempo del detalle.
// `menor` = paso técnico intermedio (se muestra atenuado).
export const EVENTOS: Record<string, { texto: string; menor?: boolean }> = {
  orden_creada: { texto: "Se creó la orden" },
  cliente_creado: { texto: "Cliente nuevo registrado", menor: true },
  cliente_recuperado: { texto: "Cliente que ya existía", menor: true },
  cliente_datos_completados: { texto: "Se completaron datos del cliente", menor: true },
  mp_preference_creada: { texto: "Se generó el link de pago de Mercado Pago" },
  mp_webhook_recibido: { texto: "Mercado Pago avisó", menor: true },
  pago_confirmado: { texto: "Pago confirmado por Mercado Pago" },
  pago_duplicado_ignorado: { texto: "Mercado Pago avisó otra vez: se ignoró el duplicado" },
  orden_cortesia_confirmada: { texto: "Cortesía confirmada (sin pago)" },
  codigo_reservado_ok: { texto: "Código reservado", menor: true },
  codigo_aplicado_ok: { texto: "Código aplicado", menor: true },
  back_url_arrived: { texto: "El cliente llegó a la pantalla de espera", menor: true },
  lectura_iniciada: { texto: "La IA empezó a escribir la lectura" },
  lectura_completada: { texto: "Lectura lista" },
  lectura_error: { texto: "Falló un intento de la lectura" },
  lectura_descartada_concurrencia: { texto: "Generación duplicada descartada (no sale al cliente)" },
  lectura_ya_existe: { texto: "Pedido de lectura repetido: ya existía, no se hizo nada" },
  estado_invalido_para_lectura: { texto: "Pedido de lectura rechazado: la orden no estaba en un estado válido" },
  lectura_cartas_normalizado: { texto: "Cartas en otro formato: se corrigió automáticamente" },
  lectura_nueva_ronda: { texto: "Reintento manual de lectura (nueva ronda)" },
  lectura_nueva_ronda_rechazada: { texto: "Reintento manual rechazado: ya había lectura" },
  pdf_iniciado: { texto: "Se empezó a armar el PDF" },
  pdf_generado: { texto: "PDF listo" },
  entrega_config_leida: { texto: "Configuración de entrega leída", menor: true },
  entrega_whatsapp_despachada: { texto: "Se mandó a enviar el WhatsApp", menor: true },
  entrega_email_despachada: { texto: "Se mandó a enviar el email", menor: true },
  entrega_email_omitida_por_config: { texto: "Email omitido (no lo pidió)" },
  entrega_acceso_web_reusado: { texto: "Se reutilizó el link de la lectura" },
  email_preparado: { texto: "Email preparado", menor: true },
  email_intentando_envio: { texto: "Enviando email", menor: true },
  email_enviado: { texto: "Email enviado" },
  email_reenvio_bloqueado: { texto: "Reenvío de email bloqueado por seguridad" },
  email_cabezal_no_listo: { texto: "La imagen del email no estaba lista", menor: true },
  wa_iniciando: { texto: "Preparando el WhatsApp", menor: true },
  wa_imagen_whatsapp_memoria: { texto: "Imagen del WhatsApp lista", menor: true },
  wa_enviado: { texto: "WhatsApp enviado" },
  wa_reenvio_bloqueado: { texto: "Reenvío de WhatsApp bloqueado por seguridad" },
  wa_recuperacion_automatica: { texto: "WhatsApp recuperado automáticamente" },
  wa_recuperacion_manual: { texto: "WhatsApp recuperado a mano" },
  audio_resumen_generado: { texto: "Audio listo" },
  acceso_gracias_entregado: { texto: "La pantalla de gracias le dio acceso a la lectura", menor: true },
};

export function duracionHumana(v: number | null): string {
  if (v == null) return "—";
  if (v < 1000) return `${v} ms`;
  const s = Math.round(v / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
