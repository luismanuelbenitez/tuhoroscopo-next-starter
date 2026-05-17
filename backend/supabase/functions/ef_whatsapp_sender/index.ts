// ============================================================================
// 🚀 EDGE FUNCTION: ef_whatsapp_sender
// VERSION: v2.0.0
// ----------------------------------------------------------------------------
// NOMBRE TÉCNICO:
//   ef_whatsapp_sender
//
// TIPO DE MÓDULO:
//   Worker / ejecutor de salida
//
// CAPA ARQUITECTÓNICA:
//   Infraestructura / transporte / entrega
//
// PATRÓN PRINCIPAL:
//   OUTBOX PATTERN
//
// PROPÓSITO GENERAL:
//   Esta función toma un mensaje ya encolado en `mensajes_enviados` y ejecuta
//   el envío real (o simulado, si está en sandbox) hacia WhatsApp Cloud API.
//
// FILOSOFÍA DEL MÓDULO:
//   Este sender NO piensa.
//   Este sender NO decide la lógica de negocio.
//   Este sender NO define qué mensaje corresponde enviar.
//   Este sender NO genera contenido.
//   Este sender NO calcula reglas funcionales del producto.
//
//   Este sender SOLAMENTE:
//   - toma un mensaje ya preparado por otras capas,
//   - verifica si puede procesarlo,
//   - lo reclama,
//   - intenta enviarlo,
//   - registra el resultado,
//   - y actualiza estados técnicos asociados al envío.
//
// IDEA CENTRAL:
//   "Lo que el negocio ya decidió, este módulo lo ejecuta."
//
// ============================================================================
// 🧱 RESPONSABILIDAD ÚNICA (MUY IMPORTANTE)
// ----------------------------------------------------------------------------
// La responsabilidad única de esta función es:
//
//   1) Leer un mensaje puntual de la OUTBOX (`mensajes_enviados`) mediante
//      `id_mensaje`
//
//   2) Verificar si el mensaje puede ser procesado en esta ejecución
//      según:
//        - su estado actual
//        - el modo de ejecución
//        - la ventana temporal programada
//
//   3) Reclamar el mensaje técnicamente para esta ejecución:
//        - incrementar intentos
//        - moverlo a `procesando`
//        - evitar carreras / doble toma
//
//   4) Resolver la plantilla final de WhatsApp que corresponde usar
//
//   5) Validar que todas las variables obligatorias del template estén presentes
//
//   6) Ejecutar el envío:
//        - real, si `APP_ENV=production`
//        - simulado, en cualquier otro entorno
//
//   7) Registrar el resultado del intento:
//        - enviado
//        - fallido
//        - fallo_definitivo por exceso de intentos
//
//   8) Si aplica, propagar efectos técnicos post-envío:
//        - guardar `wamid`
//        - actualizar `contenido_premium`
//        - confirmar envío real vía `ef_actualiza_envio_real_premium`
//
// IMPORTANTE:
//   Todo lo anterior es responsabilidad TÉCNICA de entrega.
//   No funcional / de negocio.
//
// ============================================================================
// ❌ COSAS QUE ESTA FUNCIÓN NO DEBE HACER NUNCA
// ----------------------------------------------------------------------------
// Para preservar una arquitectura sana, este sender NO debe:
//
//   - decidir qué usuario recibe contenido hoy
//   - elegir qué contenido se genera
//   - decidir si corresponde Premium, Gratis o Domingo
//   - construir reglas de calendario de negocio
//   - seleccionar lotes grandes de mensajes por sí misma
//   - encolar nuevos mensajes
//   - generar prompts
//   - invocar OpenAI para redactar contenido
//   - modificar reglas comerciales
//   - resolver suscripciones de Mercado Pago
//   - definir elegibilidad funcional del suscriptor
//
// ES DECIR:
//   Si una decisión requiere "pensar negocio",
//   no pertenece a este sender.
//
// ============================================================================
// 🧠 RELACIÓN CON EL RESTO DE LA ARQUITECTURA
// ----------------------------------------------------------------------------
// Este módulo vive aguas abajo dentro del pipeline.
//
// FLUJO CONCEPTUAL:
//
//   [CAPAS DE NEGOCIO / ORQUESTACIÓN / ENCOLADO]
//                    ↓
//         generan o encolan mensajes en OUTBOX
//                    ↓
//          `mensajes_enviados` queda como fuente
//                    ↓
//             ef_whatsapp_sender ejecuta
//                    ↓
//            WhatsApp Cloud API / simulador
//                    ↓
//      actualización de estados y trazabilidad técnica
//
// ROLES SEPARADOS:
//
//   A) CAPA DE NEGOCIO / ENCOLADORES
//      - deciden QUÉ se envía
//      - deciden CUÁNDO se encola
//      - definen destinatario, contenido, plantilla lógica, etc.
//
//   B) SENDER (esta función)
//      - decide únicamente si puede PROCESAR el mensaje técnicamente
//      - ejecuta el envío
//      - registra el resultado
//
// ESTA SEPARACIÓN ES CRÍTICA:
//   Si el sender empieza a asumir lógica del negocio,
//   el sistema se vuelve más frágil, más difícil de depurar
//   y mucho menos predecible.
//
// ============================================================================
// 📦 TABLAS / RECURSOS QUE TOCA
// ----------------------------------------------------------------------------
// 1) `mensajes_enviados`
//    - Es la OUTBOX operativa.
//    - Desde acá se lee el mensaje a procesar.
//    - Acá se actualizan estados técnicos de envío.
//
//    Campos relevantes que esta función usa o puede tocar:
//      - id
//      - estado
//      - intentos
//      - fecha_ultimo_intento
//      - fecha_enviado
//      - whatsapp_destino
//      - nombre_plantilla
//      - ultimo_error
//      - resultado_envio
//      - mensaje_id_whatsapp
//      - reintentar_despues
//      - metadata
//      - id_contenido
//
// 2) `plantillas`
//    - Se consulta cuando hace falta resolver el nombre REAL aprobado en Meta.
//
// 3) `contenido_premium`
//    - Se toca solo si el mensaje enviado está asociado a un contenido premium.
//    - Se usa para guardar correlación con `wamid` y estado de envío.
//
// 4) `log_funciones`
//    - Se utiliza para trazabilidad técnica / operativa.
//
// 5) `ef_actualiza_envio_real_premium`
//    - Se invoca solo cuando un envío premium fue efectivamente aceptado.
//
// 6) WhatsApp Cloud API
//    - Destino real del mensaje cuando el entorno es producción.
//
// ============================================================================
// 🔐 SEGURIDAD
// ----------------------------------------------------------------------------
// Esta función NO está pensada para exposición pública libre.
//
// MECANISMO DE PROTECCIÓN ACTUAL:
//   - exige header `x-internal-key`
//   - compara contra `WHATSAPP_INTERNAL_KEY`
//
// SI LA CLAVE NO COINCIDE:
//   - responde 401 Unauthorized
//   - no procesa nada
//
// ADEMÁS:
//   - usa `SUPABASE_SERVICE_ROLE_KEY`
//   - por lo tanto tiene permisos altos sobre la base
//
// CONSECUENCIA:
//   Esta función debe considerarse interna y sensible.
//
// ============================================================================
// 🧪 MODOS DE EJECUCIÓN
// ----------------------------------------------------------------------------
// 1) MODO DE ENTORNO (`APP_ENV`)
//
//   - `APP_ENV=production`
//       => envío REAL a WhatsApp Cloud API
//
//   - cualquier otro valor
//       => sandbox / simulación
//
// 2) MODO DE REINTENTO MANUAL (`forzar_reintento`)
//
//   - si `forzar_reintento=true`
//       => la función puede reprocesar mensajes en estado:
//            - `pendiente`
//            - `fallido`
//
//   - si no viene o viene false
//       => solo procesa mensajes en estado:
//            - `pendiente`
//
// IMPORTANTE:
//   `forzar_reintento` NO significa "enviar contenido futuro".
//   Solo habilita reprocesamiento técnico de mensajes fallidos.
//
// 3) MODO DE BYPASS TEMPORAL (`force_send`)
//
//   - si `force_send=true`
//       => se permite enviar aunque la fecha programada sea futura
//
//   - si no viene o viene false
//       => se respeta la validación normal de fecha
//
// IMPORTANTE:
//   `force_send` NO habilita reintento manual.
//   `force_send` y `forzar_reintento` son dos banderas distintas.
//   Cumplen objetivos distintos.
//
// ============================================================================
// 📥 INPUT ESPERADO (POST JSON)
// ----------------------------------------------------------------------------
// Esta función espera un body JSON similar a:
//
// {
//   "id_mensaje": 123,
//   "forzar_reintento": false,
//   "force_send": false
// }
//
// DETALLE DE CADA CAMPO:
//
// - `id_mensaje`
//     obligatorio
//     identifica la fila puntual de `mensajes_enviados` a procesar
//
// - `forzar_reintento`
//     opcional
//     boolean
//     si es true, permite reprocesar mensajes `fallido`
//
// - `force_send`
//     opcional
//     boolean
//     si es true, bypass temporal para contenido futuro
//
// NOTA:
//   Esta función NO hace barrido masivo por sí misma.
//   Procesa el mensaje que explícitamente se le pide.
//
// ============================================================================
// 📤 RESPUESTA GENERAL
// ----------------------------------------------------------------------------
// La función actualmente responde de forma simple, normalmente:
//
//   "OK"
//
// o errores básicos de entrada / seguridad, por ejemplo:
//   - 401 Unauthorized
//   - 400 Invalid JSON
//   - 400 id_mensaje requerido
//   - 404 Mensaje no encontrado
//
// IMPORTANTE:
//   La salida HTTP no intenta ser una API rica para frontend.
//   El valor real de observabilidad está en:
//
//   - `mensajes_enviados`
//   - `contenido_premium`
//   - `log_funciones`
//
// ============================================================================
// 🔄 FLUJO DETALLADO DE LA FUNCIÓN
// ----------------------------------------------------------------------------
// PASO 1) Validación de seguridad
//   - lee `x-internal-key`
//   - si no coincide, corta con 401
//
// PASO 2) Parse del body JSON
//   - si el body es inválido, responde 400
//
// PASO 3) Lectura del mensaje en OUTBOX
//   - busca por `id_mensaje`
//   - si no existe, responde 404
//
// PASO 4) Validación temporal previa
//   - inspecciona `metadata.fecha_envio_programada`
//   - si el contenido es futuro y NO viene `force_send=true`:
//       => NO toca la fila
//       => NO incrementa intentos
//       => NO la pasa a `procesando`
//       => deja log informativo
//       => termina en OK
//
// PASO 5) Claim / preparación del intento
//   - incrementa intentos
//   - mueve el mensaje a `procesando`
//   - usa filtro por estado para evitar carreras
//   - en modo manual:
//       - limpia `ultimo_error`
//       - limpia `reintentar_despues`
//
// PASO 6) Corte por máximo de intentos
//   - si el intento actual supera `MAX_INTENTOS`
//       => marca `fallo_definitivo`
//       => guarda error descriptivo
//       => termina
//
// PASO 7) Resolución de template
//   - si `nombre_plantilla` ya viene informado, lo usa
//   - si no, intenta resolverlo desde:
//       - metadata.tipo_contenido
//       - o fallback a `contenido_premium.tipo`
//       - luego consulta tabla `plantillas`
//
// PASO 8) Validación local del template
//   - verifica que exista mapping local
//   - verifica variables obligatorias no vacías
//   - si falta algo:
//       => marca mensaje como `fallido`
//       => registra detalle
//       => no llama a Meta
//
// PASO 9) Persistencia de template final en OUTBOX
//   - guarda el nombre real del template resuelto
//   - si falla, deja log pero no bloquea el envío
//
// PASO 10) Envío
//   - si sandbox:
//       => simula respuesta tipo Meta
//   - si producción:
//       => POST real a WhatsApp Cloud API
//
// PASO 11) Manejo del resultado
//
//   A) Si envío OK:
//      - extrae `wamid`
//      - marca `mensajes_enviados.estado = enviado`
//      - guarda `fecha_enviado`
//      - limpia `ultimo_error`
//      - guarda `mensaje_id_whatsapp` si vino
//
//      Si existe `id_contenido`:
//        - actualiza `contenido_premium` con `wamid`
//        - confirma envío real vía `ef_actualiza_envio_real_premium`
//
//      Finalmente:
//        - registra log de éxito
//
//   B) Si envío ERROR:
//      - marca `mensajes_enviados.estado = fallido`
//      - guarda `ultimo_error` con la respuesta
//      - registra log de fallo
//
// ============================================================================
// 🧠 MANEJO DE ESTADOS EN `mensajes_enviados`
// ----------------------------------------------------------------------------
// Estados relevantes en este sender:
//
// - `pendiente`
//     mensaje listo para ser tomado por el sender
//
// - `procesando`
//     mensaje ya reclamado por una ejecución en curso
//
// - `enviado`
//     envío aceptado correctamente
//
// - `fallido`
//     intento falló, pero podría reprocesarse
//
// - `fallo_definitivo`
//     el mensaje excedió el máximo permitido de intentos
//
// REGLA GENERAL:
//   Este sender solo debe producir transiciones controladas y esperables.
//
// EJEMPLO NORMAL:
//   pendiente -> procesando -> enviado
//
// EJEMPLO DE FALLO RECUPERABLE:
//   pendiente -> procesando -> fallido
//
// EJEMPLO DE EXCESO DE INTENTOS:
//   pendiente/fallido -> procesando -> fallo_definitivo
//
// ============================================================================
// 🔁 ESTRATEGIA DE REINTENTOS
// ----------------------------------------------------------------------------
// Este sender usa contador incremental por mensaje.
//
// LÓGICA ACTUAL:
//   - cada intento real incrementa `intentos`
//   - si un mensaje supera `MAX_INTENTOS`, pasa a `fallo_definitivo`
//
// DETALLE IMPORTANTE:
//   El corte está implementado de modo que el intento número 5
//   siga siendo válido cuando `MAX_INTENTOS = 5`.
//
// Es decir:
//   intento 1 -> permitido
//   intento 2 -> permitido
//   intento 3 -> permitido
//   intento 4 -> permitido
//   intento 5 -> permitido
//   intento 6 -> corta como definitivo
//
// REINTENTO MANUAL:
//   - `forzar_reintento=true` permite reabrir mensajes `fallido`
//   - no reabre `fallo_definitivo`
//
// ============================================================================
// 🧷 IDEMPOTENCIA / CONCURRENCIA / SEGURIDAD OPERATIVA
// ----------------------------------------------------------------------------
// Este sender intenta ser seguro frente a doble ejecución concurrente.
//
// MECANISMO PRINCIPAL:
//   - al reclamar el mensaje, hace UPDATE filtrando por:
//       - `id`
//       - estado permitido
//
// Eso implica que:
//   - si otra ejecución ya tomó la fila
//   - o ya cambió el estado
//   - esta ejecución no reclama nada
//   - y devuelve un NO-OP
//
// ADEMÁS:
//   las actualizaciones de éxito y fallo se protegen con:
//     .eq("estado", ESTADO_PROCESANDO)
//
// Esto reduce el riesgo de pisar estados ya avanzados.
//
// NOTA:
//   La idempotencia acá es "operativa" / "práctica".
//   Busca evitar doble claim y doble actualización dentro del flujo esperado.
//
// ============================================================================
// 🧩 TEMPLATE RESOLUTION / VARIABLES
// ----------------------------------------------------------------------------
// La función soporta dos capas de resolución:
//
// 1) Nombre del template
//    - usa `msg.nombre_plantilla` si ya existe
//    - si no, lo resuelve desde tabla `plantillas`
//
// 2) Variables del body
//    - se resuelven desde:
//        a) `msg.metadata.variables[key]`
//        b) `msg.metadata.contenido[key]`
//        c) compatibilidad legacy para `cuerpo`
//
// Esto permite compatibilidad hacia atrás con mensajes viejos
// y adaptación a templates nuevos más estructurados.
//
// ============================================================================
// 🪵 LOGGING / OBSERVABILIDAD
// ----------------------------------------------------------------------------
// La función registra eventos relevantes en `log_funciones`.
//
// TIPOS DE SITUACIONES LOGUEADAS:
//   - mensaje no encontrado
//   - contenido futuro ignorado
//   - error al reclamar / bump de intentos
//   - reintento manual iniciado
//   - plantilla no resuelta
//   - template inválido
//   - error al persistir template final
//   - simulación sandbox
//   - envío OK
//   - envío fallido
//   - error al actualizar outbox
//   - confirmación de envío real premium OK / error
//
// FILOSOFÍA:
//   no spamear por rutina innecesaria,
//   pero sí dejar huella cuando hubo acción relevante.
//
// ============================================================================
// ⚠️ DECISIONES IMPORTANTES DE DISEÑO QUE ESTE ARCHIVO ASUME
// ----------------------------------------------------------------------------
// 1) La tabla `mensajes_enviados` es la OUTBOX canónica.
//
// 2) El sender trabaja por `id_mensaje` puntual,
//    no por barrido autónomo completo.
//
// 3) `forzar_reintento` y `force_send` son banderas distintas.
//
// 4) El sender puede operar en sandbox sin tocar Meta.
//
// 5) El envío real premium se confirma aparte en otra función.
//
// 6) Los errores de template se cortan localmente antes de llamar a Meta.
//
// 7) Un fallo al guardar `nombre_plantilla` NO bloquea el envío.
//
// ============================================================================
// ✅ RESUMEN EJECUTIVO
// ----------------------------------------------------------------------------
// Si tuvieras que explicar esta función en una frase:
//
//   "Es el worker técnico que toma un mensaje ya encolado,
//    valida si puede salir, intenta enviarlo por WhatsApp,
//    y deja trazabilidad completa del resultado."
//
// O en forma aún más simple:
//
//   "No decide. Ejecuta."
//
// ============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ============================================================================
// 🔐 ENV & CONFIGURACIÓN GLOBAL
// ============================================================================
// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
// ---------------------------------------------------------------------------
// Seguridad interna entre Edge Functions
// ---------------------------------------------------------------------------
const WHATSAPP_INTERNAL_KEY = Deno.env.get("WHATSAPP_INTERNAL_KEY") ?? "";
// ---------------------------------------------------------------------------
// Entorno de ejecución
// ---------------------------------------------------------------------------
// REGLA ESTRICTA:
//
//   APP_ENV=production
//     => envío REAL a WhatsApp Cloud API / Meta.
//
//   APP_ENV=sandbox
//     => simulación local, sin tocar Meta.
//
//   Cualquier otro valor:
//     => configuración inválida.
//     => el sender NO procesa el mensaje.
//
// POR QUÉ:
//   Antes teníamos:
//
//     const APP_ENV = (Deno.env.get("APP_ENV") ?? "sandbox").toLowerCase();
//     const IS_SANDBOX = APP_ENV !== "production";
//
//   Eso era peligroso porque si APP_ENV venía vacío, mal escrito,
//   como "prod", "prd", "Production " o no estaba seteado,
//   el sender caía automáticamente en sandbox.
//
//   Eso genera el problema que vimos:
//     - creías estar en producción,
//     - pero el sender devolvía wamid.SANDBOX.
//
// DECISIÓN:
//   No más fallback silencioso.
//   Si el entorno está mal configurado, fallamos claro.
// ---------------------------------------------------------------------------
const APP_ENV = (Deno.env.get("APP_ENV") ?? "").trim().toLowerCase();
const IS_PRODUCTION = APP_ENV === "production";
const IS_SANDBOX = APP_ENV === "sandbox";
const APP_ENV_VALIDO = IS_PRODUCTION || IS_SANDBOX;
// ---------------------------------------------------------------------------
// Constantes de negocio
// ---------------------------------------------------------------------------
const FUNCION = "ef_whatsapp_sender";
// ---------------------------------------------------------------------------
// Constantes de estado del outbox
// ----------------------------------------------------------------------------
// IMPORTANTE:
// - Todas las transiciones del sender deben usar estas constantes
// - Evitamos strings hardcodeados para no romper la cola por un typo
// ---------------------------------------------------------------------------
const ESTADO_PENDIENTE = "pendiente";
const ESTADO_PROCESANDO = "procesando";
const ESTADO_ENVIADO = "enviado";
const ESTADO_FALLIDO = "fallido";
const ESTADO_FALLO_DEFINITIVO = "fallo_definitivo";
// ---------------------------------------------------------------------------
// MÁXIMA CANTDAD DE INTENTOS QUE REALIZARÁ EL SENDER CON UN MENSAJE
// ----------------------------------------------------------------------------
// IMPORTANTE:
// - Considera el campo intentos de mensajes_enviados
// - Pasa a estado Fallo_definitivo al tener alcanzar los 5 intentos para un
// - mensaje
// ---------------------------------------------------------------------------
const MAX_INTENTOS = 5;
// ---------------------------------------------------------------------------
// Cliente Supabase con service role
// ---------------------------------------------------------------------------
// Esta función corre server-side y necesita permisos amplios para:
// - leer mensajes_enviados
// - actualizar mensajes_enviados
// - leer plantillas
// - leer contenido_premium
// - actualizar contenido_premium
// - escribir log_funciones
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// 🧩 MAPEO DE VARIABLES POR TEMPLATE
// ----------------------------------------------------------------------------
// Clave = nombre REAL del template en Meta
// Valor = orden EXACTO de variables que espera el body del template
//
// IMPORTANTE:
// - Este bloque debe coincidir 1 a 1 con la plantilla aprobada en Meta.
// - Si Meta tiene un nombre nuevo de template, hay que agregarlo acá.
// - Si el orden de placeholders cambia en Meta, hay que cambiarlo acá.
//
// NUEVA SITUACIÓN:
// - Antes usabas: contenido_premium_diario
// - Ahora aprobaste: contenido_premium_diario_v3
//
// Por eso agregamos AMBOS nombres al mapping.
// ============================================================================
const TEMPLATE_VARIABLE_ORDER = {
  // --------------------------------------------------------------------------
  // Templates simples
  // --------------------------------------------------------------------------
  bienvenida_validacion_numero: [
    "nombre"
  ],
  confirmacion_numero_ok: [
    "nombre"
  ],
  // --------------------------------------------------------------------------
  // AYUDA DEL USUARIO
  // --------------------------------------------------------------------------
  // Template real en Meta:
  //   ayuda_usuario
  //
  // Body aprobado:
  //   Hola {{1}} ✨
  //
  //   Podés escribir:
  //
  //   BAJA — pausar tus mensajes.
  //   ALTA — volver a recibirlos.
  //   ESTADO — consultar tu situación actual.
  //
  //   Estamos con vos.
  //
  // Variables:
  //   {{1}} = nombre
  //
  // IMPORTANTE:
  // - Esto debe coincidir exactamente con el orden de placeholders en Meta.
  // - El inbound debe encolar esta misma key dentro de metadata.variables.
  // --------------------------------------------------------------------------
  ayuda_usuario: [
    "nombre"
  ],
  // --------------------------------------------------------------------------
  // ESTADO DEL USUARIO
  // --------------------------------------------------------------------------
  // Template real en Meta:
  //   estado_usuario
  //
  // Body aprobado:
  //   Hola {{1}} ✨
  //
  //   ✅ Tu suscripción está {{2}}.
  //   💬 Tus mensajes están {{3}}.
  //
  //   ⏸️ Para pausar los mensajes, escribí BAJA.
  //   ▶️ Para volver a recibirlos, escribí ALTA.
  //
  // Variables:
  //   {{1}} = nombre
  //   {{2}} = estado_suscripcion
  //   {{3}} = estado_mensaje
  //
  // IMPORTANTE:
  // - Esto debe coincidir exactamente con el orden de placeholders en Meta.
  // - El inbound debe encolar estas mismas keys dentro de metadata.variables.
  // --------------------------------------------------------------------------
  estado_usuario: [
    "nombre",
    "estado_suscripcion",
    "estado_mensaje"
  ],
  // --------------------------------------------------------------------------
  // Template premium diario - versión anterior
  // --------------------------------------------------------------------------
  // Si todavía querés compatibilidad con mensajes viejos, lo dejás.
  contenido_premium_diario: [
    "saludo_inicial",
    "horoscopo",
    "contenido_preferido",
    "numero",
    "color",
    "pausa",
    "pie_de_pagina"
  ],
  // --------------------------------------------------------------------------
  // Template premium diario - NUEVA VERSIÓN APROBADA EN META
  // --------------------------------------------------------------------------
  // ESTE ES EL BLOQUE QUE TE FALTABA.
  // El error "template_sin_mapping_local" aparece porque este nombre no existía.
  contenido_premium_diario_v3: [
    "saludo_inicial",
    "horoscopo",
    "contenido_preferido",
    "numero",
    "color",
    "pausa",
    "pie_de_pagina"
  ],
  // --------------------------------------------------------------------------
  // Template premium domingo
  // --------------------------------------------------------------------------
  // Template real en Meta:
  //   contenido_premium_domingo
  // Variables:
  //   {{1}} = nombre
  //   {{2}} = balance_semanal
  //   {{3}} = intencion_semana
  //   {{4}} = ritual_simple
  //   {{5}} = cierre_inspirador
  // --------------------------------------------------------------------------
  contenido_premium_domingo: [
    "nombre",
    "balance_semanal",
    "intencion_semana",
    "ritual_simple",
    "cierre_inspirador"
  ],
  // --------------------------------------------------------------------------
  // Opcionales / futuros
  // --------------------------------------------------------------------------
  confirmacion_baja: [
    "link_mp"
  ],
  confirmacion_alta: [
    "nombre"
  ],
  pago_pendiente: [
    "nombre",
    "link_mp"
  ],
  suscripcion_finalizada: [
    "nombre",
    "link_checkout"
  ],
  abandono_checkout: [
    "link_checkout"
  ],
  // --------------------------------------------------------------------------
  // Menú de ajustes WhatsApp (12 plantillas)
  // --------------------------------------------------------------------------
  // Todas usan al menos {{1}} = nombre.
  // Las que tienen más variables se documentan con sus placeholders en orden.
  // --------------------------------------------------------------------------
  menu_principal: [
    "nombre"
  ],
  menu_salir: [
    "nombre"
  ],
  menu_timeout: [
    "nombre"
  ],
  menu_principal_invalido: [
    "nombre"
  ],
  // {{1}} = nombre, {{2}} = enfoque_actual (ej: "amor_relaciones")
  menu_enfoque: [
    "nombre",
    "enfoque_actual"
  ],
  // {{1}} = nombre, {{2}} = enfoque (nombre legible confirmado)
  menu_confirmacion_enfoque: [
    "nombre",
    "enfoque"
  ],
  menu_enfoque_invalido: [
    "nombre"
  ],
  // {{1}} = nombre, {{2}} = premium, {{3}} = suscripcion, {{4}} = mensajes, {{5}} = vencimiento
  menu_estado_suscripcion: [
    "nombre",
    "premium",
    "suscripcion",
    "mensajes",
    "vencimiento"
  ],
  // {{1}} = nombre, {{2}} = estado_mensajes (ej: "activos" / "pausados")
  menu_pausa: [
    "nombre",
    "estado_mensajes"
  ],
  menu_pausa_confirmada: [
    "nombre"
  ],
  menu_reactivacion_confirmada: [
    "nombre"
  ],
  menu_pausa_invalido: [
    "nombre"
  ]
};
// ============================================================================
// 🧰 HELPERS GENERALES
// ============================================================================
// ============================================================================
// 🕒 EXTRAER fecha_envio_programada DESDE metadata
// ----------------------------------------------------------------------------
// Busca la fecha programada dentro de msg.metadata.
//
// Casos posibles:
// - viene como ISO string válida
// - no viene
// - viene inválida
//
// Devuelve:
// - string ISO si existe y parece usable
// - null si no existe o es inválida
//
// IMPORTANTE:
// No hacemos conversión de timezone acá.
// Comparamos ISO UTC contra ISO UTC.
// ============================================================================
function getFechaEnvioProgramada(msg) {
  const raw = msg?.metadata?.fecha_envio_programada;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
// ============================================================================
// 🧠 CONFIRMAR ENVÍO REAL DE CONTENIDO PREMIUM
// ----------------------------------------------------------------------------
// OBJETIVO:
// - Invocar ef_actualiza_envio_real_premium cuando un contenido premium fue
//   efectivamente enviado por WhatsApp.
//
// CUÁNDO SE USA:
// - Solo después de un envío OK
// - Solo si el mensaje tiene id_contenido
//
// IMPORTANTE:
// - Esta función NO envía nada.
// - Solo registra en la capa de negocio que el contenido salió realmente.
//
// SEGURIDAD:
// - Usa x-internal-key para acceso interno
// - No usa WHATSAPP_TOKEN
// - No usa Authorization ni apikeya
// ============================================================================
async function confirmarEnvioRealPremium(params) {
  const { id_contenido, fecha_envio_real, mensaje_id_whatsapp, enviado_por, tsNow } = params;
  const url = `${SUPABASE_URL}/functions/v1/ef_actualiza_envio_real_premium`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Seguridad interna entre Edge Functions.
      //
      // IMPORTANTE:
      //   Esta llamada NO es a Meta.
      //   Esta llamada es a otra Edge Function de Supabase:
      //
      //     ef_actualiza_envio_real_premium
      //
      //   Por lo tanto, JAMÁS debe usar WHATSAPP_TOKEN.
      //
      // NOTA:
      //   Más adelante vamos a alinear ef_actualiza_envio_real_premium
      //   porque hoy esa función espera UUID y tu contenido_premium.id
      //   parece ser integer.
      //
      //   Por ahora dejamos solo x-internal-key para no seguir mezclando tokens.
      "x-internal-key": WHATSAPP_INTERNAL_KEY
    },
    body: JSON.stringify({
      id: id_contenido,
      fecha_envio_real,
      mensaje_id_whatsapp,
      enviado_por
    })
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body: parsed
  };
}
// ============================================================================
// 🧠 VALIDAR SI EL MENSAJE PUEDE ENVIARSE SEGÚN FECHA
// ----------------------------------------------------------------------------
// Reglas:
//
// 1) Si testMode = true
//    => SIEMPRE permitir envío
//
// 2) Si no hay fecha_envio_programada
//    => permitir envío
//       (decisión pragmática para no romper mensajes legacy)
//
// 3) Si fecha_envio_programada <= ahora
//    => permitir envío
//
// 4) Si fecha_envio_programada > ahora
//    => NO permitir envío en producción normal
//
// Esto cubre:
// - pasado   ✅ permitido
// - hoy      ✅ permitido
// - futuro   ❌ bloqueado (salvo force_send)
//
// Devuelve:
// - ok=true  => seguir
// - ok=false => saltar / no enviar todavía
// ============================================================================
function validarVentanaDeEnvio(params) {
  const { msg, testMode, nowIso } = params;
  // --------------------------------------------------------------------------
  // 1) force_send habilita bypass total del control temporal
  // --------------------------------------------------------------------------
  if (testMode) {
    return {
      ok: true,
      fechaProgramada: getFechaEnvioProgramada(msg)
    };
  }
  // --------------------------------------------------------------------------
  // 2) Si no hay fecha programada, permitimos envío
  // --------------------------------------------------------------------------
  const fechaProgramada = getFechaEnvioProgramada(msg);
  if (!fechaProgramada) {
    return {
      ok: true,
      fechaProgramada: null
    };
  }
  // --------------------------------------------------------------------------
  // 3) Comparación temporal
  // --------------------------------------------------------------------------
  // Si la fecha programada es futura respecto al momento actual,
  // NO enviamos en producción normal.
  if (fechaProgramada > nowIso) {
    return {
      ok: false,
      reason: "contenido_futuro",
      fechaProgramada,
      nowIso
    };
  }
  // --------------------------------------------------------------------------
  // 4) Pasado o presente => permitido
  // --------------------------------------------------------------------------
  return {
    ok: true,
    fechaProgramada
  };
}
// ---------------------------------------------------------------------------
// nowUTCISO
// ---------------------------------------------------------------------------
// Devuelve la fecha/hora actual en formato ISO UTC.
//
// La usamos para:
// - log_funciones.fecha_ejecucion
// - mensajes_enviados.fecha_enviado
// - trazabilidad general
function nowUTCISO() {
  return new Date().toISOString();
}
// ============================================================================
// 🧠 RESOLVER VARIABLE SEMÁNTICA
// ----------------------------------------------------------------------------
// Objetivo:
//   Resolver correctamente cada variable textual que espera la plantilla.
//
// NUEVO CONTEXTO:
//   Antes el template premium diario usaba un único campo "cuerpo".
//   Ahora la nueva plantilla usa variables separadas:
//     - saludo_inicial
//     - horoscopo
//     - contenido_preferido
//     - numero
//     - color
//     - pausa
//     - pie_de_pagina
//
// PRIORIDAD DE BÚSQUEDA:
//   1) msg.metadata.variables[key]
//   2) msg.metadata.contenido[key]
//   3) caso legacy: key === "cuerpo" -> msg.metadata.contenido.cuerpo
//   4) fallback = ""
//
// ¿Por qué esto es importante?
//   Porque en tu sistema puede haber mensajes donde:
//   - metadata.variables ya está armada para enviar
//   - o metadata.contenido tiene los campos estructurados
//   - o todavía existe el "cuerpo" legacy para compatibilidad
//
// Este helper NO rompe compatibilidad hacia atrás.
// ============================================================================
function resolveTemplateVariable(msg, key) {
  // --------------------------------------------------------------------------
  // metadata.variables
  // --------------------------------------------------------------------------
  const variables = msg?.metadata?.variables ?? {};
  // --------------------------------------------------------------------------
  // metadata.contenido
  // --------------------------------------------------------------------------
  const contenido = msg?.metadata?.contenido ?? {};
  // --------------------------------------------------------------------------
  // 1) Prioridad más alta: variables explícitas para envío
  // --------------------------------------------------------------------------
  if (typeof variables[key] === "string" && variables[key].trim()) {
    return variables[key].trim();
  }
  // --------------------------------------------------------------------------
  // 2) Fallback estructurado: metadata.contenido[key]
  // --------------------------------------------------------------------------
  // Esto cubre casos como:
  //   contenido.saludo_inicial
  //   contenido.horoscopo
  //   contenido.numero
  // etc.
  if (typeof contenido[key] === "string" && contenido[key].trim()) {
    return contenido[key].trim();
  }
  // --------------------------------------------------------------------------
  // 3) Compatibilidad legacy con "cuerpo"
  // --------------------------------------------------------------------------
  // Solo para no romper mensajes viejos o templates anteriores.
  if (key === "cuerpo") {
    const cuerpo = contenido?.cuerpo;
    if (typeof cuerpo === "string" && cuerpo.trim()) {
      return cuerpo.trim();
    }
  }
  // --------------------------------------------------------------------------
  // 4) Nada encontrado => string vacío
  // --------------------------------------------------------------------------
  // OJO:
  // - que devuelva "" NO significa que esté bien enviar;
  // - por eso más abajo agregamos validación obligatoria antes del envío.
  return "";
}
// ============================================================================
// 🧠 VARIABLES OBLIGATORIAS POR TEMPLATE
// ----------------------------------------------------------------------------
// Define qué variables NO pueden venir vacías antes de enviar.
// Si falta alguna, el sender marca el mensaje como fallido y NO llama a Meta.
//
// IMPORTANTE:
// - Como ahora existe contenido_premium_diario_v3,
//   también tiene que existir acá.
// ============================================================================
const TEMPLATE_REQUIRED_VARIABLES = {
  // --------------------------------------------------------------------------
  // AYUDA DEL USUARIO
  // --------------------------------------------------------------------------
  // Template real en Meta:
  //   ayuda_usuario
  //
  // Body aprobado:
  //   Hola {{1}} ✨
  //
  //   Podés escribir:
  //
  //   BAJA — pausar tus mensajes.
  //   ALTA — volver a recibirlos.
  //   ESTADO — consultar tu situación actual.
  //
  //   Estamos con vos.
  //
  // Variables:
  //   {{1}} = nombre
  //
  // IMPORTANTE:
  // - Esto debe coincidir exactamente con el orden de placeholders en Meta.
  // - El inbound debe encolar esta misma key dentro de metadata.variables.
  // --------------------------------------------------------------------------
  ayuda_usuario: [
    "nombre"
  ],
  // --------------------------------------------------------------------------
  // Comando ESTADO
  // --------------------------------------------------------------------------
  // Estas variables son obligatorias porque la plantilla estado_usuario
  // espera 3 placeholders en Meta.
  //
  // Si alguna falta, el sender NO llama a WhatsApp y marca el mensaje como
  // fallido por validación local, evitando errores innecesarios contra Meta.
  // --------------------------------------------------------------------------
  estado_usuario: [
    "nombre",
    "estado_suscripcion",
    "estado_mensaje"
  ],
  // --------------------------------------------------------------------------
  // Premium diario - versión anterior
  // --------------------------------------------------------------------------
  contenido_premium_diario: [
    "saludo_inicial",
    "horoscopo",
    "contenido_preferido",
    "numero",
    "color",
    "pausa",
    "pie_de_pagina"
  ],
  // --------------------------------------------------------------------------
  // Premium diario - nueva versión aprobada
  // --------------------------------------------------------------------------
  contenido_premium_diario_v3: [
    "saludo_inicial",
    "horoscopo",
    "contenido_preferido",
    "numero",
    "color",
    "pausa",
    "pie_de_pagina"
  ],
  // --------------------------------------------------------------------------
  // Premium domingo
  // --------------------------------------------------------------------------
  // Estas variables son obligatorias porque la plantilla domingo espera 5
  // placeholders en Meta.
  //
  // Si alguna falta, el sender NO llama a WhatsApp y marca el mensaje como
  // fallido por validación local.
  // --------------------------------------------------------------------------
  contenido_premium_domingo: [
    "nombre",
    "balance_semanal",
    "intencion_semana",
    "ritual_simple",
    "cierre_inspirador"
  ],
  // --------------------------------------------------------------------------
  // Menú de ajustes — solo plantillas con más de una variable obligatoria
  // --------------------------------------------------------------------------
  menu_enfoque: [
    "nombre",
    "enfoque_actual"
  ],
  menu_confirmacion_enfoque: [
    "nombre",
    "enfoque"
  ],
  menu_estado_suscripcion: [
    "nombre",
    "premium",
    "suscripcion",
    "mensajes",
    "vencimiento"
  ],
  menu_pausa: [
    "nombre",
    "estado_mensajes"
  ]
};
// ============================================================================
// 🧠 OBTENER VARIABLES FALTANTES DE UN TEMPLATE
// ----------------------------------------------------------------------------
// Dado un mensaje y un nombre de template,
// devuelve qué claves obligatorias vienen vacías.
//
// Esto NO envía nada.
// Solo inspecciona.
// ============================================================================
function getMissingRequiredVariables(msg, templateName) {
  const requiredKeys = TEMPLATE_REQUIRED_VARIABLES[templateName] ?? [];
  return requiredKeys.filter((key)=>{
    const value = resolveTemplateVariable(msg, key);
    return !(typeof value === "string" && value.trim());
  });
}
// ============================================================================
// 🧠 VALIDAR TEMPLATE ANTES DE ENVIAR
// ----------------------------------------------------------------------------
// Objetivo:
//   Evitar mandar mensajes incompletos o rotos.
//
// Valida:
//
//   1) Que exista mapping para ese template
//   2) Que el template tenga variables definidas (si corresponde)
//   3) Que todas las obligatorias vengan con valor
//
// Devuelve:
//   { ok: true }
//   o
//   { ok: false, error: "...", detail: ... }
//
// NOTA:
//   Esta validación es local, previa al POST a Meta.
//   Es MUY valiosa porque evita consumir llamadas reales innecesarias.
// ============================================================================
function validarTemplateAntesDeEnviar(msg, templateName) {
  // --------------------------------------------------------------------------
  // 1) Verificar que el template exista en el mapping local
  // --------------------------------------------------------------------------
  const variableOrder = TEMPLATE_VARIABLE_ORDER[templateName];
  if (!variableOrder) {
    return {
      ok: false,
      error: "template_sin_mapping_local",
      detail: {
        templateName
      }
    };
  }
  // --------------------------------------------------------------------------
  // 2) Verificar obligatorias faltantes
  // --------------------------------------------------------------------------
  const missing = getMissingRequiredVariables(msg, templateName);
  if (missing.length > 0) {
    return {
      ok: false,
      error: "template_variables_obligatorias_faltantes",
      detail: {
        templateName,
        missing
      }
    };
  }
  return {
    ok: true
  };
}
// ============================================================================
// 🧱 CONSTRUIR PARAMETERS PARA TEMPLATE WHATSAPP (VERSIÓN CORREGIDA)
// ----------------------------------------------------------------------------
// PROBLEMA ORIGINAL:
// - Usábamos msg.nombre_plantilla
// - Pero el nombre REAL se resuelve más adelante (templateFinal)
//
// SOLUCIÓN:
// - Recibir templateName explícito (el REAL)
// - Nunca depender de msg.nombre_plantilla
//
// RESULTADO:
// - Variables SIEMPRE alineadas con la template correcta
// ============================================================================
function buildTemplateParameters(msg, templateName) {
  const variableOrder = TEMPLATE_VARIABLE_ORDER[templateName] ?? [];
  return variableOrder.map((key)=>({
      type: "text",
      text: resolveTemplateVariable(msg, key)
    }));
}
// ============================================================================
// 📝 LOG A log_funciones
// ----------------------------------------------------------------------------
// FUNCIÓN CANÓNICA DEL SENDER
//
// IMPORTANTE:
// - Esta es la ÚNICA versión de registrarLog que debe existir en este archivo.
// - Usa el cliente global `supabase`
// - Usa la constante global `FUNCION`
// - Recibe `tsNow` explícito para mantener trazabilidad exacta por ejecución
//
// ¿Por qué dejar solo esta?
// - Evita ambigüedad
// - Evita bugs por shadowing / redefinición
// - Deja el contrato de logging consistente en toda la función
// ============================================================================
async function registrarLog(tsNow, resultado, detalle = {}, exito = true) {
  try {
    await supabase.from("log_funciones").insert([
      {
        nombre_funcion: FUNCION,
        fecha_ejecucion: tsNow,
        resultado,
        detalle,
        exito,
        creado_por: "system"
      }
    ]);
  } catch (e) {
    console.error(`[${FUNCION}] Error al registrar log`, e);
  }
}
// ============================================================================
// 🧾 EXTRAER WAMID DESDE RESPUESTA DE WHATSAPP
// ----------------------------------------------------------------------------
// Meta suele responder algo así:
//
// {
//   "messages": [
//     { "id": "wamid.HBg..." }
//   ]
// }
//
// Si existe, lo devolvemos.
// Si no, null.
// ============================================================================
function extraerWamid(body) {
  const id = body?.messages?.[0]?.id;
  if (typeof id !== "string") return null;
  const t = id.trim();
  return t ? t : null;
}
// ============================================================================
// 🧠 NORMALIZAR tipo_contenido
// ----------------------------------------------------------------------------
// Aceptamos SOLO:
//   - "diario"
//   - "domingo"
//
// Todo lo demás se considera inválido.
// ============================================================================
function normalizarTipoContenido(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "diario") return "diario";
  if (v === "domingo") return "domingo";
  return null;
}
// ============================================================================
// 🧠 RESOLVER PLANTILLA WHATSAPP + CONFIGURACIÓN DE HEADER
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Resolver el nombre REAL del template que Meta espera y traer, si existe,
//   la configuración estructural de header desde `plantillas`.
//
// POR QUÉ CAMBIAMOS ESTA FUNCIÓN:
//   Antes alcanzaba con devolver:
//     - templateReal
//     - templateKey
//
//   Ahora el sender también necesita:
//     - header_activo
//     - header_tipo
//     - header_url
//     - header_media_id
//
//   Por eso esta función debe devolver también:
//     - plantillaConfig
//
// REGLA PRINCIPAL:
//   Para leer headers NO debemos depender solo de msg.nombre_plantilla,
//   porque ese campo suele contener el nombre REAL de Meta:
//
//     contenido_premium_diario_v3
//
//   Pero la configuración estructural vive en plantillas.nombre:
//
//     contenido_premium_diario
//
// PRIORIDAD DE RESOLUCIÓN:
//   1) metadata.plantilla_clave
//      Ejemplo: contenido_premium_diario / contenido_premium_domingo
//
//   2) metadata.tipo_contenido o contenido_premium.tipo
//      diario  -> contenido_premium_diario
//      domingo -> contenido_premium_domingo
//
//   3) fallback legacy:
//      si no se puede encontrar config, usar msg.nombre_plantilla sin header
//
// IMPORTANTE:
//   Si encontramos fila en plantillas:
//     templateReal = plantillas.contenido
//     plantillaConfig = fila completa de plantillas
//
//   Si NO encontramos fila pero msg.nombre_plantilla existe:
//     templateReal = msg.nombre_plantilla
//     plantillaConfig = null
//
//   Eso mantiene compatibilidad con mensajes viejos.
// ============================================================================
async function resolverPlantillaWhatsApp(tsNow, msg) {
  // --------------------------------------------------------------------------
  // 1) Intentar resolver desde metadata.plantilla_clave
  // --------------------------------------------------------------------------
  // Este es el caso ideal para mensajes encolados por ef_run_encolador_premium.
  //
  // Ejemplo:
  //   metadata.plantilla_clave = contenido_premium_diario
  //   metadata.plantilla_clave = contenido_premium_domingo
  // --------------------------------------------------------------------------
  const plantillaClaveMetadata = typeof msg?.metadata?.plantilla_clave === "string" && msg.metadata.plantilla_clave.trim() ? msg.metadata.plantilla_clave.trim() : null;
  let templateKey = plantillaClaveMetadata;
  // --------------------------------------------------------------------------
  // 2) Si no vino plantilla_clave, resolver por tipo_contenido
  // --------------------------------------------------------------------------
  if (!templateKey) {
    let tipo = normalizarTipoContenido(msg.metadata?.tipo_contenido);
    // ------------------------------------------------------------------------
    // Fallback: leer tipo desde contenido_premium
    // ------------------------------------------------------------------------
    if (!tipo && msg?.id_contenido) {
      const { data: cp, error: eCp } = await supabase.from("contenido_premium").select("tipo").eq("id", msg.id_contenido).maybeSingle();
      if (eCp) {
        await registrarLog(tsNow, "resolver_plantilla_error_read_cp", {
          id_mensaje: msg.id,
          id_contenido: msg.id_contenido,
          error: eCp.message
        }, false);
        return {
          ok: false,
          error: "no_pude_leer_contenido_premium",
          detail: eCp.message
        };
      }
      tipo = normalizarTipoContenido(cp?.tipo);
    }
    // ------------------------------------------------------------------------
    // Mapeo correcto para tu tabla real `plantillas`
    // ------------------------------------------------------------------------
    // OJO:
    //   NO usar premium_diario / premium_domingo.
    //
    // En tu DB existen:
    //   contenido_premium_diario
    //   contenido_premium_domingo
    // ------------------------------------------------------------------------
    if (tipo === "diario") {
      templateKey = "contenido_premium_diario";
    }
    if (tipo === "domingo") {
      templateKey = "contenido_premium_domingo";
    }
  }
  // --------------------------------------------------------------------------
  // 3) Buscar configuración completa en plantillas
  // --------------------------------------------------------------------------
  if (templateKey) {
    const { data: tpl, error: eTpl } = await supabase.from("plantillas").select(`
        id,
        nombre,
        contenido,
        canal,
        activo,
        header_activo,
        header_tipo,
        header_nombre,
        header_url,
        header_media_id
      `).eq("canal", "whatsapp").eq("nombre", templateKey).eq("activo", true).maybeSingle();
    if (eTpl) {
      await registrarLog(tsNow, "resolver_plantilla_error_db", {
        id_mensaje: msg.id,
        templateKey,
        error: eTpl.message
      }, false);
      return {
        ok: false,
        error: "error_leyendo_plantilla",
        detail: {
          templateKey,
          error: eTpl.message
        }
      };
    }
    if (tpl?.contenido) {
      const templateReal = String(tpl.contenido).trim();
      if (!templateReal) {
        await registrarLog(tsNow, "resolver_plantilla_contenido_vacio", {
          id_mensaje: msg.id,
          templateKey
        }, false);
        return {
          ok: false,
          error: "plantilla_contenido_vacio",
          detail: {
            templateKey
          }
        };
      }
      return {
        ok: true,
        templateReal,
        templateKey,
        plantillaConfig: tpl
      };
    }
    // ------------------------------------------------------------------------
    // Si no encontró por templateKey, dejamos log pero todavía podemos hacer
    // fallback legacy con msg.nombre_plantilla.
    // ------------------------------------------------------------------------
    await registrarLog(tsNow, "resolver_plantilla_no_encontrada_por_key", {
      id_mensaje: msg.id,
      templateKey,
      nombre_plantilla_actual: msg?.nombre_plantilla ?? null
    }, false);
  }
  // --------------------------------------------------------------------------
  // 4) Fallback legacy: usar msg.nombre_plantilla sin header
  // --------------------------------------------------------------------------
  // Esto permite no romper templates operativos viejos que no tienen fila
  // estructural en plantillas o no usan header.
  // --------------------------------------------------------------------------
  if (typeof msg?.nombre_plantilla === "string" && msg.nombre_plantilla.trim()) {
    const templateReal = msg.nombre_plantilla.trim();
    return {
      ok: true,
      templateReal,
      templateKey: templateKey ?? templateReal,
      plantillaConfig: null
    };
  }
  // --------------------------------------------------------------------------
  // 5) Si no se pudo resolver nada, fallar explícitamente
  // --------------------------------------------------------------------------
  await registrarLog(tsNow, "resolver_plantilla_no_resuelta", {
    id_mensaje: msg.id,
    id_contenido: msg.id_contenido,
    templateKey,
    nombre_plantilla: msg?.nombre_plantilla ?? null,
    metadata: msg?.metadata ?? null
  }, false);
  return {
    ok: false,
    error: "plantilla_no_resuelta",
    detail: {
      templateKey,
      nombre_plantilla: msg?.nombre_plantilla ?? null
    }
  };
}
// ============================================================================
// 🧠 ESTADOS PERMITIDOS SEGÚN MODO
// ----------------------------------------------------------------------------
// REGLA CANÓNICA:
//
// - Modo normal:
//     solo procesa mensajes en estado "pendiente"
//
// - Modo soporte manual (`forzar_reintento=true`):
//     permite volver a procesar mensajes en:
//       - "pendiente"
//       - "fallido"
//
// NO permitimos por este carril:
//   - "enviado"
//   - "procesando"
//   - "fallo_definitivo"
//
// POR QUÉ EXCLUIMOS "fallo_definitivo":
//   - Porque ese estado representa corte duro del pipeline normal.
//   - Si algún día querés reabrir "fallo_definitivo", conviene hacerlo con
//     otro flujo explícito de soporte, no mezclado con el reintento estándar.
// ============================================================================
function obtenerEstadosPermitidos(esReintentoManual) {
  return esReintentoManual ? [
    ESTADO_PENDIENTE,
    ESTADO_FALLIDO
  ] : [
    ESTADO_PENDIENTE
  ];
}
// ============================================================================
// 🧠 PREPARAR INTENTO / CLAIM DEL MENSAJE / BUMP DE INTENTOS
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Preparar un mensaje de la OUTBOX para su envío real.
//
// QUÉ HACE ESTA FUNCIÓN:
//   1) Incrementa en +1 el contador de intentos
//   2) Reclama la fila cambiando su estado a `procesando`
//   3) En reintento manual:
//        - permite tomar mensajes en `pendiente` o `fallido`
//        - limpia `ultimo_error`
//        - limpia `reintentar_despues`
//   4) En modo normal:
//        - solo permite tomar mensajes en `pendiente`
//
// POR QUÉ ES CRÍTICA:
//   Este bloque es el "claim" real del mensaje.
//   Si dos ejecuciones intentan procesar el mismo `id_mensaje`,
//   solo una debe lograr mover la fila a `procesando`.
//
// REGLA DE CONCURRENCIA:
//   - El UPDATE se hace con filtro por `id` y por `estado` permitido.
//   - Si otra ejecución ya tocó la fila antes,
//     este UPDATE no encontrará coincidencia y devolverá `data = null`.
//   - Eso se interpreta como NO-OP, no como error técnico.
//
// IMPORTANTE:
//   - Esta función NO envía WhatsApp.
//   - Esta función NO resuelve plantilla.
//   - Esta función NO hace lógica de negocio.
//   - Solo deja el mensaje correctamente tomado para continuar el pipeline.
//
// USO DE tsNow:
//   - Se usa el mismo timestamp recibido por parámetro,
//     para mantener trazabilidad consistente con logs y resto del handler.
//
// RETORNO:
//   - data:
//       fila actualizada si el claim tuvo éxito
//       null si no matcheó ninguna fila
//   - error:
//       error técnico de Supabase si lo hubo
//   - nextIntentos:
//       valor calculado del nuevo intento
// ============================================================================
async function prepararIntento(params) {
  const { id_mensaje, intentosActuales, esReintentoManual, tsNow } = params;
  // --------------------------------------------------------------------------
  // 1) Calcular el número del próximo intento
  // --------------------------------------------------------------------------
  // Ejemplo:
  //   intentosActuales = 0  -> nextIntentos = 1
  //   intentosActuales = 4  -> nextIntentos = 5
  const nextIntentos = Number(intentosActuales ?? 0) + 1;
  // --------------------------------------------------------------------------
  // 2) Construir UPDATE base
  // --------------------------------------------------------------------------
  // Siempre que reclamamos el mensaje:
  //   - incrementamos intentos
  //   - lo pasamos a estado `procesando`
  //   - guardamos fecha_ultimo_intento
  //
  // Si el intento fue manual:
  //   - además limpiamos ultimo_error
  //   - además limpiamos reintentar_despues
  let query = supabase.from("mensajes_enviados").update({
    intentos: nextIntentos,
    // 🔥 CLAIM REAL DEL MENSAJE
    // Desde este punto, si el UPDATE matchea,
    // el mensaje queda tomado por esta ejecución.
    estado: ESTADO_PROCESANDO,
    // Usamos el timestamp canónico de esta corrida
    fecha_ultimo_intento: tsNow,
    ...esReintentoManual ? {
      ultimo_error: null,
      reintentar_despues: null
    } : {}
  }).eq("id", id_mensaje);
  // --------------------------------------------------------------------------
  // 3) Restringir estados permitidos según el modo
  // --------------------------------------------------------------------------
  // Modo normal:
  //   solo procesa pendientes
  //
  // Modo soporte manual:
  //   permite reabrir pendientes o fallidos
  if (esReintentoManual) {
    query = query.in("estado", [
      ESTADO_PENDIENTE,
      ESTADO_FALLIDO
    ]);
  } else {
    query = query.eq("estado", ESTADO_PENDIENTE);
  }
  // --------------------------------------------------------------------------
  // 4) Ejecutar UPDATE y devolver la fila efectivamente reclamada
  // --------------------------------------------------------------------------
  // Si no actualiza ninguna fila:
  //   - data = null
  //   - error = null
  //
  // Eso significa normalmente:
  //   - el estado ya cambió
  //   - otra ejecución ganó la carrera
  //   - o el mensaje ya no era procesable
  const { data, error } = await query.select("id, estado, intentos").maybeSingle();
  // --------------------------------------------------------------------------
  // 5) Retornar resultado
  // --------------------------------------------------------------------------
  return {
    data,
    error,
    nextIntentos
  };
}
// ============================================================================
// 🧱 CONSTRUIR COMPONENTS DEL TEMPLATE WHATSAPP
// ----------------------------------------------------------------------------
// OBJETIVO:
//   Armar dinámicamente el array `components` que se envía a Meta.
//
// ANTES:
//   El sender siempre enviaba solamente:
//
//     components: [
//       {
//         type: "body",
//         parameters: [...]
//       }
//     ]
//
// PROBLEMA:
//   Si la plantilla en Meta tiene HEADER tipo IMAGE, Meta espera también:
//
//     {
//       type: "header",
//       parameters: [
//         {
//           type: "image",
//           image: { link: "https://..." }
//         }
//       ]
//     }
//
//   Si no lo enviamos, Meta responde:
//
//     header: Format mismatch, expected IMAGE, received UNKNOWN
//
// REGLA:
//   - Si plantillaConfig.header_activo = true:
//       agregamos header según header_tipo.
//   - Por ahora soportamos image.
//   - Si header_activo = false o no hay config:
//       no agregamos header.
//   - Siempre agregamos body.
//
// PRIORIDAD DE MEDIA:
//   1) header_media_id
//   2) header_url
//
// POR QUÉ:
//   Meta acepta image.id o image.link.
//   Si algún día subís la imagen a Meta y guardás media_id,
//   conviene usar media_id.
// ============================================================================
function buildTemplateComponents(params) {
  const { msg, templateName, plantillaConfig } = params;
  const components = [];
  // --------------------------------------------------------------------------
  // 1) HEADER opcional
  // --------------------------------------------------------------------------
  if (plantillaConfig?.header_activo === true) {
    const headerTipo = String(plantillaConfig.header_tipo ?? "").trim();
    // ------------------------------------------------------------------------
    // Actualmente soportamos IMAGE, que es tu caso real:
    // - contenido_premium_diario_v3
    // - contenido_premium_domingo
    // ------------------------------------------------------------------------
    if (headerTipo === "image") {
      const mediaId = typeof plantillaConfig.header_media_id === "string" ? plantillaConfig.header_media_id.trim() : "";
      const mediaUrl = typeof plantillaConfig.header_url === "string" ? plantillaConfig.header_url.trim() : "";
      // ----------------------------------------------------------------------
      // Si header_activo=true pero no hay media_id ni URL, es error de config.
      // Tiramos error para que el handler marque fallido y quede trazabilidad.
      // ----------------------------------------------------------------------
      if (!mediaId && !mediaUrl) {
        throw new Error(`plantilla_header_image_sin_media: ${plantillaConfig.nombre}`);
      }
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: mediaId ? {
              id: mediaId
            } : {
              link: mediaUrl
            }
          }
        ]
      });
    } else {
      // ----------------------------------------------------------------------
      // Si en el futuro activás video/document y todavía no lo soportamos,
      // preferimos fallar claro antes que mandar un payload incorrecto.
      // ----------------------------------------------------------------------
      throw new Error(`plantilla_header_tipo_no_soportado: ${plantillaConfig.nombre} / ${headerTipo}`);
    }
  }
  // --------------------------------------------------------------------------
  // 2) BODY obligatorio
  // --------------------------------------------------------------------------
  const parameters = buildTemplateParameters(msg, templateName);
  components.push({
    type: "body",
    parameters
  });
  return components;
}
/// ============================================================================
// 📦 ENVÍO REAL A WHATSAPP (PRODUCCIÓN)
// ----------------------------------------------------------------------------
// Envía SIEMPRE templates.
//
// CAMBIO NUEVO:
//   Ahora soporta headers dinámicos definidos en `plantillas`.
//
// ANTES:
//   El payload enviaba solamente componente BODY.
//
// AHORA:
//   El payload puede enviar:
//
//   - HEADER image, si la plantilla lo tiene activo.
//   - BODY con variables de texto.
//
// IMPORTANTE:
//   El sender NO decide qué header usar.
//   Solo lee `plantillaConfig`, que fue resuelta desde la tabla `plantillas`.
// ============================================================================
async function enviarWhatsAppReal(msg, templateName, plantillaConfig, tsNow) {
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  // --------------------------------------------------------------------------
  // Construimos components dinámicamente.
  //
  // Puede devolver:
  //   [body]
  //
  // o:
  //   [header image, body]
  // --------------------------------------------------------------------------
  const components = buildTemplateComponents({
    msg,
    templateName,
    plantillaConfig
  });
  const body = {
    messaging_product: "whatsapp",
    to: msg.whatsapp_destino,
    type: "template",
    template: {
      name: templateName,
      // ----------------------------------------------------------------------
      // Mantenemos "es" porque es lo que usaba tu sender.
      // Si tus templates están aprobados como es_UY, ahí sí cambiamos a es_UY.
      // No lo cambio ahora para no introducir una variable nueva.
      // ----------------------------------------------------------------------
      language: {
        code: "es"
      },
      components
    }
  };
  // ==========================================================================
  // 🧪 DEBUG TEMPORAL — PAYLOAD REAL A WHATSAPP
  // --------------------------------------------------------------------------
  // OBJETIVO:
  //   Ver exactamente qué payload se está mandando a Meta.
  //
  // IMPORTANTE:
  //   - NO logueamos WHATSAPP_TOKEN.
  //   - NO logueamos Authorization.
  //   - Sí logueamos template, idioma, destino, header y variables.
  //
  // CUÁNDO SACARLO:
  //   Cuando confirmemos que los mensajes vuelven a llegar al teléfono.
  // ==========================================================================
  await registrarLog(tsNow, "debug_payload_whatsapp_real", {
    id_mensaje: msg.id,
    id_contenido: msg.id_contenido ?? null,
    whatsapp_destino: msg.whatsapp_destino,
    templateName,
    language: body.template.language,
    plantilla_config: plantillaConfig ? {
      nombre: plantillaConfig.nombre,
      contenido: plantillaConfig.contenido,
      header_activo: plantillaConfig.header_activo,
      header_tipo: plantillaConfig.header_tipo,
      header_nombre: plantillaConfig.header_nombre,
      header_url: plantillaConfig.header_url,
      header_media_id: plantillaConfig.header_media_id ? "[MEDIA_ID_PRESENTE]" : null
    } : null,
    components: body.template.components
  }, true);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      // --------------------------------------------------------------------------
      // Token real de WhatsApp Cloud API.
      //
      // IMPORTANTE:
      //   Este token debe venir desde Supabase Secrets:
      //
      //     WHATSAPP_TOKEN
      //
      //   No debe estar hardcodeado en el código.
      // --------------------------------------------------------------------------
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch  {
    parsed = {
      raw: text
    };
  }
  return {
    ok: r.ok,
    status: r.status,
    body: parsed
  };
}
// ============================================================================
// 🎭 SIMULADOR SANDBOX
// ----------------------------------------------------------------------------
// NO ENVÍA NADA a Meta.
// Solo devuelve una respuesta con formato parecido al real.
//
// Esto permite probar el pipeline completo sin tocar producción.
// ============================================================================
async function simularEnvioSandbox(params) {
  const fakeWamid = `wamid.SANDBOX-${params.id_mensaje}-${Date.now()}`;
  return {
    ok: true,
    status: 200,
    body: {
      sandbox: true,
      message: "Mensaje simulado correctamente",
      to: params.to,
      template: params.template,
      contacts: [
        {
          wa_id: params.to
        }
      ],
      messages: [
        {
          id: fakeWamid
        }
      ]
    }
  };
}
// ============================================================================
// 🧠 ACTUALIZAR MENSAJE COMO ENVIADO
// ----------------------------------------------------------------------------
// Si el envío fue OK:
//   - estado = enviado
//   - fecha_enviado = tsNow
//   - resultado_envio = true
//   - ultimo_error = null
//   - mensaje_id_whatsapp = wamid (si vino)
//
// Protegemos con:
//   .eq("estado", ESTADO_PROCESANDO)
//
// Esto evita pisar estados avanzados si hubo doble ejecución.
// ============================================================================
async function marcarMensajeEnviado(params) {
  const { id_mensaje, tsNow, wamid } = params;
  return await supabase.from("mensajes_enviados").update({
    estado: ESTADO_ENVIADO,
    fecha_enviado: tsNow,
    ultimo_error: null,
    resultado_envio: true,
    ...wamid ? {
      mensaje_id_whatsapp: wamid
    } : {}
  }).eq("id", id_mensaje).eq("estado", ESTADO_PROCESANDO);
}
// ============================================================================
// 🧠 ACTUALIZAR MENSAJE COMO FALLIDO
// ----------------------------------------------------------------------------
// Si el envío falló:
//   - estado = fallido
//   - resultado_envio = false
//   - ultimo_error = respuesta real de Meta (o simulador)
//
// NO tocamos nada más por ahora.
// ============================================================================
async function marcarMensajeFallido(params) {
  const { id_mensaje, errorBody } = params;
  return await supabase.from("mensajes_enviados").update({
    estado: ESTADO_FALLIDO,
    resultado_envio: false,
    ultimo_error: JSON.stringify(errorBody)
  }).eq("id", id_mensaje).eq("estado", ESTADO_PROCESANDO);
}
// ============================================================================
// 🧠 ACTUALIZAR contenido_premium CON WAMID
// ----------------------------------------------------------------------------
// Si el mensaje tiene id_contenido y obtuvimos wamid:
//   - contenido_premium.mensaje_id_whatsapp = wamid
//   - contenido_premium.estado_envio = "enviado"
//
// Esto te ayuda a correlacionar el contenido con el envío real.
// ============================================================================
async function actualizarContenidoPremiumConWamid(params) {
  const { id_mensaje, id_contenido, wamid, tsNow } = params;
  const { error } = await supabase.from("contenido_premium").update({
    mensaje_id_whatsapp: wamid,
    estado_envio: "enviado"
  }).eq("id", id_contenido);
  if (error) {
    await registrarLog(tsNow, "update_contenido_premium_wamid_error", {
      id_mensaje,
      id_contenido,
      wamid,
      error: error.message
    }, false);
  }
}
// ============================================================================
// 🚀 HANDLER PRINCIPAL
// ============================================================================
serve(async (req)=>{
  const tsNow = nowUTCISO();
  // ==========================================================================
  // 0) VALIDACIÓN ESTRICTA DE ENTORNO
  // --------------------------------------------------------------------------
  // OBJETIVO:
  //   Evitar que el sender procese mensajes si APP_ENV está mal configurado.
  //
  // VALORES VÁLIDOS:
  //   - production
  //   - sandbox
  //
  // SI APP_ENV ESTÁ VACÍO O MAL ESCRITO:
  //   - No procesamos el mensaje.
  //   - No reclamamos la fila.
  //   - No incrementamos intentos.
  //   - No enviamos por sandbox por accidente.
  //
  // Esto protege producción.
  // ==========================================================================
  if (!APP_ENV_VALIDO) {
    await registrarLog(tsNow, "sender_app_env_invalido", {
      app_env: APP_ENV || null,
      esperado: [
        "production",
        "sandbox"
      ],
      accion: "no_se_procesa_mensaje"
    }, false);
    return new Response("APP_ENV inválido", {
      status: 500
    });
  }
  // ==========================================================================
  // 1) SEGURIDAD BÁSICA
  // ==========================================================================
  // Esta función NO debe ser pública libre.
  // Solo la deben invocar procesos internos o soporte autorizado.
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== WHATSAPP_INTERNAL_KEY) {
    return new Response("Unauthorized", {
      status: 401
    });
  }
  // ==========================================================================
  // 2) PARSE BODY
  // ==========================================================================
  let body;
  try {
    body = await req.json();
  } catch  {
    return new Response("Invalid JSON", {
      status: 400
    });
  }
  // ==========================================================================
  // 2.1) PARÁMETROS DE ENTRADA
  // --------------------------------------------------------------------------
  // Soportamos:
  // - id_mensaje         => obligatorio
  // - forzar_reintento   => soporte manual para reprocesar fallidos
  // - force_send          => modo test funcional
  //
  // force_send = true
  //   => permite enviar aunque la fecha_envio_programada sea futura
  //
  // force_send = false / ausente
  //   => comportamiento de producción:
  //      NO enviar si la fecha programada es futura
  //
  // IMPORTANTE:
  // - force_send NO reemplaza dry_run (eso vive en otros módulos)
  // - force_send NO afecta sandbox/prod
  // - force_send solo afecta la validación temporal del mensaje
  // ==========================================================================
  const { id_mensaje, forzar_reintento, force_send } = body;
  if (!id_mensaje) {
    return new Response("id_mensaje requerido", {
      status: 400
    });
  }
  // --------------------------------------------------------------------------
  // Flag manual de soporte
  // --------------------------------------------------------------------------
  // Si viene true, habilita reprocesar fallidos.
  const esReintentoManual = forzar_reintento === true;
  // --------------------------------------------------------------------------
  // Flag de testing funcional
  // --------------------------------------------------------------------------
  // Si viene true:
  // - se permite enviar contenido futuro
  //
  // Si viene false o ausente:
  // - se aplica control temporal normal de producción
  const testMode = force_send === true;
  // ==========================================================================
  // 3) OBTENER MENSAJE ENCOLADO
  // ==========================================================================
  const { data: msg, error } = await supabase.from("mensajes_enviados").select("*").eq("id", id_mensaje).maybeSingle();
  if (error || !msg) {
    await registrarLog(tsNow, "mensaje_no_encontrado", {
      id_mensaje
    }, false);
    return new Response("Mensaje no encontrado", {
      status: 404
    });
  }
  // ==========================================================================
  // 4) VALIDACIÓN PREVIA DE VENTANA TEMPORAL (ANTES DE RECLAMAR EL MENSAJE)
  // --------------------------------------------------------------------------
  // REGLA NUEVA:
  // - En modo normal (force_send=false), si el mensaje todavía no corresponde
  //   enviarse porque su fecha_envio_programada es futura:
  //     => NO se toca la fila
  //     => NO se incrementan intentos
  //     => NO pasa a "procesando"
  //     => simplemente se ignora
  //
  // - En modo forzado (force_send=true):
  //     => se permite seguir
  //
  // BENEFICIO:
  // - intentos pasa a significar intentos reales de envío
  // - el sender normal deja de ensuciar la cola
  // ==========================================================================
  const ventana = validarVentanaDeEnvio({
    msg,
    testMode,
    nowIso: tsNow
  });
  if (!ventana.ok) {
    await registrarLog(tsNow, "mensaje_ignorado_contenido_futuro", {
      id_mensaje,
      fecha_envio_programada: ventana.fechaProgramada,
      now_utc: ventana.nowIso,
      esReintentoManual,
      force_send: testMode,
      accion: "ignorado_sin_tocar_fila"
    }, true);
    return new Response("OK");
  }
  // ==========================================================================
  // 5) PREPARAR INTENTO / BUMP DE INTENTOS
  // ==========================================================================
  const prep = await prepararIntento({
    id_mensaje,
    intentosActuales: Number(msg.intentos ?? 0),
    esReintentoManual,
    tsNow
  });
  if (prep.error) {
    await registrarLog(tsNow, "bump_intentos_error", {
      id_mensaje,
      error: prep.error.message,
      esReintentoManual
    }, false);
    // No rompemos cron / pipeline
    return new Response("OK");
  }
  if (!prep.data) {
    await registrarLog(tsNow, "bump_intentos_noop", {
      id_mensaje,
      esReintentoManual
    }, true);
    return new Response("OK");
  }
  const intentoActual = Number(prep.data.intentos ?? prep.nextIntentos);
  // ==========================================================================
  // 5.0) SNAPSHOT CANÓNICO DEL MENSAJE YA RECLAMADO
  // --------------------------------------------------------------------------
  // A partir de acá conviene seguir trabajando con una versión del mensaje que
  // represente la fila ya tomada por esta ejecución.
  //
  // `msg` fue leído antes del claim.
  // `prep.data` representa la fila luego del claim.
  //
  // Como `prep.data` solo trae algunos campos,
  // hacemos un merge conservador:
  //   - mantenemos todo lo que traía `msg`
  //   - sobreescribimos con lo que devolvió `prep.data`
  //
  // BENEFICIO:
  // - consistencia interna del flujo
  // - evita seguir operando con el snapshot viejo
  // ==========================================================================
  const msgProcesado = {
    ...msg,
    ...prep.data ?? {}
  };
  // Si vino por soporte manual, dejamos log explícito.
  if (esReintentoManual) {
    await registrarLog(tsNow, "reintento_manual_iniciado", {
      id_mensaje,
      estado_original: msg.estado,
      intento_actual: intentoActual,
      force_send: force_send
    }, true);
  }
  // ==========================================================================
  // 5.1) CORTE POR MÁXIMO DE INTENTOS
  // --------------------------------------------------------------------------
  // REGLA CORRECTA:
  // - `intentoActual` YA viene incrementado por `prepararIntento(...)`.
  // - Por lo tanto:
  //
  //     intentoActual = 1  -> intento real #1 permitido
  //     intentoActual = 2  -> intento real #2 permitido
  //     ...
  //     intentoActual = 5  -> intento real #5 permitido
  //     intentoActual = 6  -> ya superó el máximo, se corta
  //
  // POR ESO LA CONDICIÓN CORRECTA ES:
  //   if (intentoActual > MAX_INTENTOS)
  //
  // y NO:
  //   if (intentoActual >= MAX_INTENTOS)
  //
  // porque `>=` mata el intento 5 antes de ejecutarlo.
  // ==========================================================================
  if (intentoActual > MAX_INTENTOS) {
    const errorMaxIntentos = {
      error: "max_intentos_superado",
      max_intentos: MAX_INTENTOS,
      intento_actual: intentoActual
    };
    const { error: updMaxErr } = await supabase.from("mensajes_enviados").update({
      estado: ESTADO_FALLO_DEFINITIVO,
      resultado_envio: false,
      ultimo_error: JSON.stringify(errorMaxIntentos)
    }).eq("id", id_mensaje).eq("estado", ESTADO_PROCESANDO);
    if (updMaxErr) {
      await registrarLog(tsNow, "max_intentos_update_error", {
        id_mensaje,
        intento_actual: intentoActual,
        error: updMaxErr.message
      }, false);
      return new Response("OK");
    }
    await registrarLog(tsNow, "mensaje_fallo_definitivo_max_intentos", {
      id_mensaje,
      intento_actual: intentoActual,
      max_intentos: MAX_INTENTOS
    }, false);
    return new Response("OK");
  }
  // ==========================================================================
  // 7) RESOLVER PLANTILLA REAL
  // --------------------------------------------------------------------------
  // Acá obtenemos el nombre REAL del template que WhatsApp espera.
  //
  // Ejemplo:
  //   templateKey lógico: premium_diario
  //   templateReal en Meta: contenido_premium_diario_v3
  //
  // IMPORTANTE:
  // - Este valor es el que después usa TODO el sender:
  //   - validación local
  //   - persistencia en outbox
  //   - envío real a Meta
  //   - logs
  // ==========================================================================
  const tplRes = await resolverPlantillaWhatsApp(tsNow, msgProcesado);
  // Si no se pudo resolver la plantilla, marcamos fallido y salimos.
  if (!tplRes.ok) {
    await supabase.from("mensajes_enviados").update({
      estado: ESTADO_FALLIDO,
      resultado_envio: false,
      ultimo_error: JSON.stringify({
        error: tplRes.error,
        detail: tplRes.detail
      })
    }).eq("id", id_mensaje).eq("estado", ESTADO_PROCESANDO);
    await registrarLog(tsNow, "mensaje_envio_error_template", {
      id_mensaje,
      error: tplRes.error,
      detail: tplRes.detail,
      esReintentoManual,
      force_send: testMode
    }, false);
    return new Response("OK");
  }
  // ==========================================================================
  // 7.1) TEMPLATE FINAL RESUELTA
  // --------------------------------------------------------------------------
  // ESTE era el punto que te faltaba.
  //
  // templateFinal = nombre REAL del template aprobado en Meta.
  //
  // Ejemplo:
  //   "contenido_premium_diario_v3"
  //
  // Sin esta variable, después el código intenta validar/enviar usando una
  // variable inexistente y todo se rompe.
  // ==========================================================================
  const templateFinal = tplRes.templateReal;
  // ==========================================================================
  // 7.2) VALIDAR QUE EL MENSAJE TENGA TODAS LAS VARIABLES NECESARIAS
  // --------------------------------------------------------------------------
  // Validamos contra el nombre REAL de template.
  //
  // Esto usa:
  // - TEMPLATE_VARIABLE_ORDER
  // - TEMPLATE_REQUIRED_VARIABLES
  // - resolveTemplateVariable(...)
  //
  // Si falta alguna variable obligatoria, NO llamamos a WhatsApp.
  // ==========================================================================
  const validacionTemplate = validarTemplateAntesDeEnviar({
    ...msgProcesado,
    nombre_plantilla: templateFinal
  }, templateFinal);
  if (!validacionTemplate.ok) {
    await supabase.from("mensajes_enviados").update({
      estado: ESTADO_FALLIDO,
      resultado_envio: false,
      ultimo_error: JSON.stringify({
        error: validacionTemplate.error,
        detail: validacionTemplate.detail
      })
    }).eq("id", id_mensaje).eq("estado", ESTADO_PROCESANDO);
    await registrarLog(tsNow, "mensaje_envio_error_validacion_template", {
      id_mensaje,
      plantilla: templateFinal,
      error: validacionTemplate.error,
      detail: validacionTemplate.detail,
      esReintentoManual,
      force_send: force_send
    }, false);
    return new Response("OK");
  }
  // ==========================================================================
  // 7.3) PERSISTIR TEMPLATE REAL EN OUTBOX
  // --------------------------------------------------------------------------
  // Guardamos el nombre REAL del template resuelto.
  //
  // IMPORTANTE:
  // - Si esto falla, NO frenamos el envío.
  // - Pero SÍ dejamos log, porque afecta trazabilidad y soporte.
  // ==========================================================================
  const { error: updTplErr } = await supabase.from("mensajes_enviados").update({
    nombre_plantilla: templateFinal
  }).eq("id", id_mensaje);
  if (updTplErr) {
    await registrarLog(tsNow, "update_template_outbox_error", {
      id_mensaje,
      plantilla: templateFinal,
      error: updTplErr.message
    }, false);
  }
  // ==========================================================================
  // 8) ENVÍO (SANDBOX vs PROD)
  // ==========================================================================
  let result;
  // ==========================================================================
  // 7.9) VALIDAR CONFIGURACIÓN WHATSAPP EN PRODUCCIÓN
  // --------------------------------------------------------------------------
  // Si APP_ENV=production, el sender debe tener:
  //   - WHATSAPP_TOKEN
  //   - WHATSAPP_PHONE_NUMBER_ID
  //
  // Si falta alguno, NO intentamos Meta y NO caemos a sandbox.
  // Marcamos el mensaje como fallido con error claro.
  // ==========================================================================
  if (IS_PRODUCTION && (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID)) {
    const errorBody = {
      error: "config_whatsapp_incompleta",
      app_env: APP_ENV,
      whatsapp_token_configurado: Boolean(WHATSAPP_TOKEN),
      whatsapp_phone_number_id_configurado: Boolean(WHATSAPP_PHONE_NUMBER_ID)
    };
    await marcarMensajeFallido({
      id_mensaje,
      errorBody
    });
    await registrarLog(tsNow, "mensaje_envio_error_config_whatsapp", {
      id_mensaje,
      ...errorBody
    }, false);
    return new Response("OK");
  }
  if (IS_SANDBOX) {
    // ==========================================================================
    // 8.A) ENVÍO SIMULADO / SANDBOX
    // --------------------------------------------------------------------------
    // Este bloque SOLO se ejecuta si APP_ENV=sandbox.
    // Si APP_ENV=production, jamás debe entrar acá.
    // ==========================================================================
    result = await simularEnvioSandbox({
      id_mensaje,
      to: msgProcesado.whatsapp_destino,
      template: templateFinal
    });
    await registrarLog(tsNow, "sandbox_envio_simulado", {
      id_mensaje,
      // Ambiente usado en esta ejecución.
      app_env: APP_ENV,
      is_production: IS_PRODUCTION,
      is_sandbox: IS_SANDBOX,
      whatsapp: msgProcesado.whatsapp_destino,
      plantilla: templateFinal,
      template_key: tplRes.templateKey,
      // Configuración de header leída desde plantillas.
      header_activo: tplRes.plantillaConfig?.header_activo ?? false,
      header_tipo: tplRes.plantillaConfig?.header_tipo ?? null,
      header_nombre: tplRes.plantillaConfig?.header_nombre ?? null,
      header_url: tplRes.plantillaConfig?.header_url ?? null,
      header_media_id: tplRes.plantillaConfig?.header_media_id ?? null,
      esReintentoManual,
      intento_actual: intentoActual,
      force_send: testMode,
      fecha_envio_programada: ventana.fechaProgramada
    }, true);
  }
  if (IS_PRODUCTION) {
    // ==========================================================================
    // 8.B) ENVÍO REAL / PRODUCTION
    // --------------------------------------------------------------------------
    // Este bloque SOLO se ejecuta si APP_ENV=production.
    // Si Meta falla, NO se simula.
    // Si Meta falla, result.ok vendrá en false y más abajo se marca fallido.
    // ==========================================================================
    try {
      const plantillaConfig = tplRes.plantillaConfig ?? null;
      result = await enviarWhatsAppReal(msgProcesado, templateFinal, plantillaConfig, tsNow);
    } catch (e) {
      const errorBody = {
        error: "error_construyendo_payload_whatsapp",
        message: e instanceof Error ? e.message : String(e),
        templateFinal,
        templateKey: tplRes.templateKey,
        header_activo: tplRes.plantillaConfig?.header_activo ?? false,
        header_tipo: tplRes.plantillaConfig?.header_tipo ?? null,
        header_url: tplRes.plantillaConfig?.header_url ?? null,
        header_media_id: tplRes.plantillaConfig?.header_media_id ?? null
      };
      await marcarMensajeFallido({
        id_mensaje,
        errorBody
      });
      await registrarLog(tsNow, "mensaje_envio_error_payload", {
        id_mensaje,
        ...errorBody
      }, false);
      return new Response("OK");
    }
  }
  if (!result) {
    const errorBody = {
      error: "result_indefinido",
      app_env: APP_ENV,
      is_production: IS_PRODUCTION,
      is_sandbox: IS_SANDBOX
    };
    await marcarMensajeFallido({
      id_mensaje,
      errorBody
    });
    await registrarLog(tsNow, "mensaje_envio_error_result_indefinido", {
      id_mensaje,
      ...errorBody
    }, false);
    return new Response("OK");
  }
  // ==========================================================================
  // 8) ACTUALIZAR ESTADO SEGÚN RESULTADO
  // ==========================================================================
  if (result.ok) {
    // ------------------------------------------------------------------------
    // 8.1) Extraer wamid
    // ------------------------------------------------------------------------
    const wamid = extraerWamid(result.body);
    // ------------------------------------------------------------------------
    // 8.2) Marcar outbox como enviado
    // ------------------------------------------------------------------------
    const { error: updMsgErr } = await marcarMensajeEnviado({
      id_mensaje,
      tsNow,
      wamid
    });
    if (updMsgErr) {
      await registrarLog(tsNow, "update_outbox_error", {
        id_mensaje,
        wamid,
        tsNow,
        error: updMsgErr.message,
        esReintentoManual
      }, false);
      return new Response("OK");
    }
    // ------------------------------------------------------------------------
    // 8.3) Si corresponde, copiar wamid a contenido_premium
    // ------------------------------------------------------------------------
    if (msgProcesado.id_contenido && wamid) {
      await actualizarContenidoPremiumConWamid({
        id_mensaje,
        id_contenido: msgProcesado.id_contenido,
        wamid,
        tsNow
      });
    }
    // ==========================================================================
    // 8.4) CONFIRMAR ENVÍO REAL DEL CONTENIDO PREMIUM
    // --------------------------------------------------------------------------
    // Este paso NO envía WhatsApp.
    // Solo confirma en la capa de negocio que el contenido asociado fue enviado.
    //
    // Se ejecuta únicamente después de que Meta aceptó el mensaje y tenemos:
    // - id_contenido
    // - fecha_envio_real
    // - mensaje_id_whatsapp / wamid
    //
    // Esta llamada actualiza:
    // - contenido_premium.fecha_envio_real
    // - contenido_premium.estado_envio
    // - contenido_premium.mensaje_id_whatsapp
    // - contenido_premium.enviado_por
    // - suscriptores.primer_envio_premium_enviado
    // - suscriptores.fecha_primer_envio_premium
    // ==========================================================================
    if (msgProcesado.id_contenido) {
      const confirmacionEnvioReal = await confirmarEnvioRealPremium({
        id_contenido: String(msgProcesado.id_contenido),
        fecha_envio_real: tsNow,
        mensaje_id_whatsapp: wamid,
        enviado_por: FUNCION,
        tsNow
      });
      await registrarLog(tsNow, confirmacionEnvioReal.ok ? "confirmacion_envio_real_premium_ok" : "confirmacion_envio_real_premium_error", {
        id_mensaje,
        id_contenido: msgProcesado.id_contenido,
        fecha_envio_real: tsNow,
        mensaje_id_whatsapp: wamid,
        enviado_por: FUNCION,
        status: confirmacionEnvioReal.status,
        response: confirmacionEnvioReal.body
      }, confirmacionEnvioReal.ok);
    }
    // ------------------------------------------------------------------------
    // 8.5) Log final OK
    // ------------------------------------------------------------------------
    await registrarLog(tsNow, "mensaje_enviado_ok", {
      id_mensaje,
      // Ambiente real usado por esta ejecución.
      app_env: APP_ENV,
      is_production: IS_PRODUCTION,
      is_sandbox: IS_SANDBOX,
      sandbox: IS_SANDBOX,
      wamid,
      plantilla: templateFinal,
      esReintentoManual,
      intento_actual: intentoActual,
      force_send: force_send,
      fecha_envio_programada: ventana.fechaProgramada,
      response: result.body
    }, true);
  } else {
    // ------------------------------------------------------------------------
    // 8.5) Si falla el envío real/simulado
    // ------------------------------------------------------------------------
    const { error: updErr } = await marcarMensajeFallido({
      id_mensaje,
      errorBody: result.body
    });
    if (updErr) {
      await registrarLog(tsNow, "update_outbox_error_fallo", {
        id_mensaje,
        status: result.status,
        error: updErr.message,
        esReintentoManual,
        response: result.body
      }, false);
      return new Response("OK");
    }
    await registrarLog(tsNow, "mensaje_envio_error", {
      id_mensaje,
      // Ambiente real usado por esta ejecución.
      app_env: APP_ENV,
      is_production: IS_PRODUCTION,
      is_sandbox: IS_SANDBOX,
      sandbox: IS_SANDBOX,
      status: result.status,
      esReintentoManual,
      intento_actual: intentoActual,
      force_send: force_send,
      fecha_envio_programada: ventana.fechaProgramada,
      response: result.body
    }, false);
  }
  // ==========================================================================
  // 9) RESPUESTA FINAL
  // ==========================================================================
  return new Response("OK");
});
