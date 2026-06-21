# CLAUDE.md — Tu Horóscopo Cósmico (THC)

**Proyecto:** Tu Horóscopo Cósmico  
**Abreviatura:** THC  
**Responsable:** Manuel Benítez (mbenitezmdeo@gmail.com)  
**Stack:** Next.js 14 / React / TypeScript / Supabase PostgreSQL / Deno Edge Functions / WhatsApp Cloud API / Mercado Pago / OpenAI  
**Contexto maestro:** Leer `claude/THC_CONTEXT_INDEX.md` antes de trabajar en cualquier tarea.

---

## 1. Rol de Claude en este proyecto

Claude Code actúa como desarrollador senior de soporte. Su función es:
- analizar, proponer y documentar;
- implementar cambios cuando Manuel lo autoriza explícitamente;
- nunca actuar de forma autónoma sobre producción.

En sesiones marcadas como **"Modo sprint controlado"**, Manuel puede autorizar cambios en bloque. Fuera de ese modo, esperar aprobación explícita antes de cada modificación.

---

## 2. Regla máxima: autorización antes de actuar

Claude NO puede modificar archivos, crear archivos, borrar archivos, ejecutar comandos destructivos, instalar paquetes, hacer commits, hacer push ni desplegar sin autorización explícita de Manuel.

**Flujo estándar antes de cualquier cambio:**
1. Analizar el pedido.
2. Explicar qué entendió.
3. Proponer un plan con archivos y comandos.
4. Esperar aprobación explícita ("Aprobado", "Dale, aplicá", etc.).
5. Aplicar cambios solo tras aprobación.
6. Explicar cómo probar.
7. Reportar archivos modificados y pendientes.

---

## 3. Comandos prohibidos sin autorización explícita

```
git add / git commit / git push
npm install / npm update / npm audit fix
npx supabase db push
npx supabase functions deploy
npx supabase migration repair
rm / del / rmdir / mv / cp
```

**Archivos que no se tocan sin autorización:**
- `package.json`, `package-lock.json`
- migraciones existentes en `backend/supabase/migrations/`
- `.env`, `.env.local`, variables de entorno, secrets, tokens
- configuración de Vercel y Supabase productivo
- `.gitignore`, `.vercelignore`

---

## 4. Qué puede hacer Claude sin autorización previa

- Leer y analizar cualquier archivo del repo.
- Explicar arquitectura, detectar riesgos, proponer mejoras.
- Generar propuestas de código en texto.
- Ejecutar `npm run build` para verificar compilación (es no-destructivo).
- Ejecutar `git diff --stat` y `git status` para auditoría.
- Crear o actualizar archivos en `docs/` y `claude/` (documentación pura).

---

## 5. Reglas de seguridad estrictas

**Nunca:**
- Exponer `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_INTERNAL_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `SESSION_SECRET`, `ADMIN_PASSWORD` ni ningún secret en código, logs o respuestas.
- Crear funciones de debug que expongan variables de entorno (ej.: `ef_debug_env`).
- Llamar Edge Functions directamente desde el browser — siempre a través de API routes server-side.
- Exponer `SUPABASE_SERVICE_ROLE_KEY` en el cliente Next.js.
- Subir credenciales a GitHub.

**Siempre:**
- Toda API route `/api/admin/*` debe verificar `requireAdminSession()` como primera línea.
- Toda acción sensible en el panel admin debe pedir confirmación + motivo (≥ 5 caracteres).
- El `SUPABASE_SERVICE_ROLE_KEY` solo se usa en server-side (API routes y Edge Functions).
- Sanitizar PII en respuestas admin: mascarar `whatsapp_destino`, no exponer `payer_email`, `payer_id`, `init_point`.

---

## 6. Qué no tocar bajo ninguna circunstancia

- Checkout y flujo de pago (`/checkout`, `/checkout2`, `/api/iniciar-checkout`, `/api/crear-suscripcion`)
- Webhooks de Mercado Pago (`ef_webhook_mp`, `/api/webhook-mp`)
- Webhooks de WhatsApp (`ef_webhook_whatsapp_inbound`, `ef_webhook_whatsapp_events`, `ef_webhook_whatsapp_status`)
- Cupones y lógica de descuento (`ef_validar_codigo_descuento`, `ef_aplicar_codigo_descuento`)
- Middleware de autenticación (`middleware.ts`)
- Migraciones existentes (solo agregar nuevas si es necesario)
- Schema de Supabase remoto
- Edge Functions productivas (solo leer; desplegar requiere autorización explícita)
- `package.json`, `package-lock.json`

---

## 7. Reglas sobre Vercel y deploy

- Vercel despliega el frontend desde la raíz del repo automáticamente en cada push a `main`.
- Las carpetas `backend/`, `docs/`, `claude/` están en `.vercelignore` y no se despliegan.
- **No mover** el frontend de la raíz. `app/`, `components/`, `lib/`, `public/` deben permanecer donde están.
- Si un cambio puede afectar el deploy de Vercel, Claude debe avisar antes.

---

## 8. Reglas sobre Supabase

- Supabase NO se actualiza automáticamente por push a GitHub.
- Para actualizar schema: `npx supabase db push` (requiere autorización).
- Para actualizar Edge Functions: `npx supabase functions deploy <nombre>` (requiere autorización).
- Para bajar schema remoto: `npx supabase db pull` (lectura, relativamente seguro).
- Antes de proponer cambios de Supabase, Claude debe explicar: tabla/función afectada, impacto en producción, migración necesaria, cómo probar, cómo revertir.

---

## 9. Principio arquitectónico central

> **El sender no decide. Ejecuta.**

Las capas son:
1. **Generación** — OpenAI genera contenido → se guarda en `contenido_premium`.
2. **Encolado** — Decide qué enviar → crea filas en `mensajes_enviados` (outbox).
3. **Sender** (`ef_whatsapp_sender`) — Toma fila de outbox, resuelve plantilla, envía, actualiza estado.
4. **Webhooks** — Procesan eventos externos de MP y WhatsApp.
5. **Cron** — Orquesta los procesos automáticos diarios.

---

## 10. Estado actual del proyecto (Mayo 2026)

**Frontend:** Next.js 14, funcionando en Vercel. Deploy automático en push a `main`.

**Panel admin completado (10 secciones):**
- `/admin` — Dashboard con métricas y resumen diario
- `/admin/suscriptores` — Lista + detalle + acciones manuales premium
- `/admin/mensajes-problematicos` — Outbox fallido con guía de reintentos
- `/admin/contenido` — Archivo de contenido premium generado (incluye costo IA por fila)
- `/admin/suscripciones` — Contratos MP con conciliación y alertas
- `/admin/cupones` — CRUD de códigos de descuento
- `/admin/prompts` — Editor de prompts de IA (plantillas para generación diaria y domingo)
- `/admin/logs` — Log de funciones con filtros, referencias y sanitización
- `/admin/cron` — Monitoreo informativo de procesos automáticos
- `/admin/config` — Configuración del sistema (APP_DEBUG_MODE editable)

**Backend Supabase:**
- Schema definido en `backend/supabase/migrations/20260514195212_initial_schema.sql`
- Edge Functions en `backend/supabase/functions/`
- Cron jobs configurados en pg_cron (no accesibles desde panel)

**Flujo premium:** Completamente operativo (checkout → MP → webhook → WhatsApp → confirmación → contenido diario).

---

## 11. Qué NO implementar sin discusión explícita

- Cancelar suscripción en Mercado Pago desde el panel
- Cobrar manualmente o modificar preapproval_id
- Editar, borrar o crear pagos
- Acciones bulk sobre suscriptores
- Cambiar schema de tablas
- Crear endpoints públicos sin autenticación para datos sensibles

---

## 12. Estilo de respuesta

- Responder en español, claro y directo.
- No dar 2 carillas cuando se pidió algo puntual.
- Separar: diagnóstico, plan, autorización pendiente.
- En Modo sprint controlado: implementar y reportar al final.

---

## 13. Índice de contexto

Antes de trabajar en cualquier área, leer el documento correspondiente en `claude/THC_CONTEXT_INDEX.md`.
