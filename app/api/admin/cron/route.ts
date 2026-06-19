import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/adminSession";

// DEAD CODE — original static manifest kept as reference but never executed
const _CRON_MANIFEST_UNUSED = [
  {
    id: "orquesta_premium_diario",
    nombre: "Orquesta Envío Premium Diario",
    funcion: "ef_orquesta_envio_contenido_premium",
    descripcion:
      "Orquesta el flujo diario: genera contenido premium para cada suscriptor activo y lo encola en el outbox (mensajes_enviados). Llama a ef_genera_guarda_contenido_premium → ef_run_encolador_premium.",
    frecuencia: "Diario (horario en pg_cron)",
    tipo: "diario",
    categoria: "envio",
  },
  {
    id: "genera_contenido_premium",
    nombre: "Genera Contenido Premium Diario",
    funcion: "ef_genera_guarda_contenido_premium",
    descripcion:
      "Genera horóscopo premium para cada suscriptor activo usando OpenAI y lo persiste en contenido_premium. Llamado desde el orquestador.",
    frecuencia: "Sub-proceso del orquestador diario",
    tipo: "sub-proceso",
    categoria: "generacion",
  },
  {
    id: "genera_contenido_domingo",
    nombre: "Genera Contenido Premium Domingo",
    funcion: "ef_genera_guarda_contenido_premium_domingo",
    descripcion:
      "Genera horóscopo premium especial de domingo (balance semanal) para suscriptores activos.",
    frecuencia: "Domingos (horario en pg_cron)",
    tipo: "semanal",
    categoria: "generacion",
  },
  {
    id: "encolador_premium",
    nombre: "Encolador Premium",
    funcion: "ef_run_encolador_premium",
    descripcion:
      "Lee contenido_premium con estado pendiente/generado, crea entradas en mensajes_enviados (outbox). Aplica idempotencia por id_contenido.",
    frecuencia: "Sub-proceso del orquestador diario",
    tipo: "sub-proceso",
    categoria: "envio",
  },
  {
    id: "sender_batch",
    nombre: "Sender Batch",
    funcion: "ef_run_sender_batch",
    descripcion:
      "Toma mensajes pendientes del outbox y llama a ef_whatsapp_sender por cada uno. Usa lock global para evitar ejecuciones paralelas.",
    frecuencia: "Frecuente — cada pocos minutos (pg_cron)",
    tipo: "frecuente",
    categoria: "envio",
  },
  {
    id: "reintentos",
    nombre: "Reintentos WhatsApp",
    funcion: "ef_whatsapp_reintentos",
    descripcion:
      "Reprocesa mensajes fallidos que ya cumplieron el backoff y tienen intentos < MAX_RETRY. Solo dispara ef_whatsapp_sender, no envía directamente.",
    frecuencia: "Cada ~5 minutos (pg_cron)",
    tipo: "frecuente",
    categoria: "reintentos",
  },
  {
    id: "procesar_vencimientos",
    nombre: "Procesar Vencimientos Premium",
    funcion: "ef_procesar_vencimientos",
    descripcion:
      "Desactiva el premium (premium_activo=false) de suscriptores con suscripción cancelada cuya fecha de vencimiento ya pasó.",
    frecuencia: "Diario (pg_cron)",
    tipo: "diario",
    categoria: "suscripciones",
  },
  {
    id: "revisar_pendientes",
    nombre: "Revisar Suscripciones Pendientes",
    funcion: "ef_revisar_pendientes",
    descripcion:
      "Revisa suscripciones en estado pendiente_autorizacion con TTL vencido y las cancela/expira.",
    frecuencia: "Diario (pg_cron)",
    tipo: "diario",
    categoria: "suscripciones",
  },
  {
    id: "sql_sniper",
    nombre: "SQL Sniper Sender",
    funcion: "fn_sql_sniper_sender",
    descripcion:
      "Función SQL interna ejecutada por pg_cron como fallback de envío directo. Usa net.http_post para disparar ef_whatsapp_sender. Corre en el contexto del motor PostgreSQL.",
    frecuencia: "Configurado en pg_cron (función SQL, no Edge Function)",
    tipo: "frecuente",
    categoria: "envio",
  },
];

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, motivo: "config_error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error } = await supabase.rpc("admin_listar_cron_jobs");

  if (error) {
    return NextResponse.json({ ok: false, motivo: "db_error", detalle: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, jobs: data ?? [] });
}
