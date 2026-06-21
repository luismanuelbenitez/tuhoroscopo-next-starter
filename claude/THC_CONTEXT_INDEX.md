# THC_CONTEXT_INDEX.md — Índice maestro de contexto

**Proyecto:** Tu Horóscopo Cósmico (THC)  
**Última actualización:** Mayo 2026  
**Leer primero:** `claude/CLAUDE.md` para reglas de trabajo.

---

## Estado actual del proyecto

Sistema completamente operativo. El flujo premium (checkout → MP → WhatsApp → contenido diario) funciona en producción. El panel admin cubre 9 secciones con operaciones manuales controladas. No hay features críticas pendientes de implementar; el foco actual es estabilidad, observabilidad y mejoras incrementales.

---

## Qué leer según la tarea

### Checkout / Funnel de alta
- `docs/flows/premium-e2e-flow.md` — flujo completo de principio a fin
- `app/checkout/page.tsx`, `app/checkout2/page.tsx` — formulario de alta
- `app/api/iniciar-checkout/route.ts` — API de checkout
- `backend/supabase/functions/ef_alta_suscriptor_premium/` — crea suscriptor
- `backend/supabase/functions/ef_crear_suscripcion/` — crea preapproval MP

### Mercado Pago
- `docs/flows/premium-e2e-flow.md` — sección webhook MP
- `backend/supabase/functions/ef_webhook_mp/` — webhook principal de MP
- `backend/supabase/functions/ef_aplicar_codigo_descuento/` — aplica descuento post-pago
- Tabla: `suscripciones`, `pagos`

### WhatsApp
- `docs/flows/whatsapp-confirmation-flow.md` — flujo de confirmación
- `docs/business/whatsapp-message-rules.md` — estructura de mensajes
- `backend/supabase/functions/ef_webhook_whatsapp_inbound/` — procesa mensajes entrantes
- `backend/supabase/functions/ef_whatsapp_sender/` — envía mensajes
- Tabla: `plantillas`, `mensajes_enviados`

### Contenido premium
- `docs/business/whatsapp-message-rules.md` — formato JSON de contenido
- `backend/supabase/functions/ef_genera_guarda_contenido_premium/` — genera contenido diario
- `backend/supabase/functions/ef_genera_guarda_contenido_premium_domingo/` — contenido domingo
- `backend/supabase/functions/ef_openia_genera_contenido_premium/` — llamada OpenAI
- Tabla: `contenido_premium`, `emocion_dominante`, `paleta_colores`, `rango_numeros`

### Sender / Outbox
- `docs/flows/outbox-sender-flow.md` — patrón outbox completo
- `backend/supabase/functions/ef_whatsapp_sender/` — executor de mensajes
- `backend/supabase/functions/ef_run_sender_batch/` — cron batch
- `backend/supabase/functions/ef_whatsapp_reintentos/` — reintentos
- Tabla: `mensajes_enviados`

### Panel admin
- `docs/business/admin-operations.md` — qué hace cada sección del panel
- `app/admin/` — páginas del panel (10 secciones)
- `app/api/admin/` — API routes del panel
- `app/api/admin/plantillas/route.ts` — GET/PUT de prompts de IA (tabla plantillas)
- `components/admin/` — componentes compartidos
- `lib/adminSession.ts` — validación de sesión

### Cupones / Descuentos
- `docs/testing/cupones-descuento-mvp.md` — implementación completa
- `backend/supabase/functions/ef_validar_codigo_descuento/` — validación
- `backend/supabase/functions/ef_aplicar_codigo_descuento/` — aplicación
- `app/admin/cupones/` — CRUD de cupones en el panel
- Tabla: `codigos_descuento`, `codigos_descuento_usos`

### Cron / Config
- `docs/architecture/edge-functions-map.md` — sección cron
- `app/admin/cron/page.tsx` — panel de monitoreo de cron
- `app/api/admin/cron/route.ts` — manifiesto estático + log_funciones
- `app/admin/config/page.tsx` — configuración del sistema
- `app/api/admin/config/route.ts`, `app/api/admin/config/accion/route.ts`
- Tabla: `config`, `configuracion`

### Logs / Observabilidad
- `app/admin/logs/page.tsx` — panel de logs con filtros y sanitización
- `app/api/admin/logs/route.ts` — API de logs
- `backend/supabase/functions/ef_admin_listar_logs/` — EF de logs
- Tabla: `log_funciones`

### Testing E2E
- `docs/testing/current-test-plan.md` — plan de pruebas manual
- `docs/testing/e2e-premium-flow.md` — flujo E2E detallado
- `docs/testing/sql-reset-e2e-test-user.sql` — SQL para reset de usuario de prueba

### Reglas de negocio / Suscripción
- `docs/business/subscription-rules.md` — flags de suscripción y sus reglas
- `docs/business/product-vision.md` — propuesta de valor y tono

### Base de datos
- `docs/architecture/database-map.md` — todas las tablas y sus relaciones
- `backend/supabase/migrations/20260514195212_initial_schema.sql` — schema completo

### Edge Functions
- `docs/architecture/edge-functions-map.md` — mapa completo de funciones
- `backend/supabase/functions/` — código fuente

---

## Rutas principales del sistema

| Ruta | Tipo | Propósito |
|---|---|---|
| `/` | Público | Landing page de ventas |
| `/checkout` | Público | Formulario de alta premium |
| `/checkout2` | Público | Variante de checkout |
| `/gracias` | Público | Post-pago / confirmación |
| `/admin` | Admin | Dashboard con métricas |
| `/admin/login` | Admin | Autenticación |
| `/admin/suscriptores` | Admin | Gestión de suscriptores |
| `/admin/mensajes-problematicos` | Admin | Outbox con errores |
| `/admin/contenido` | Admin | Archivo de contenido premium |
| `/admin/suscripciones` | Admin | Contratos MP con alertas |
| `/admin/cupones` | Admin | CRUD de descuentos |
| `/admin/prompts` | Admin | Editor de prompts de IA (diario + domingo) |
| `/admin/logs` | Admin | Log de funciones |
| `/admin/cron` | Admin | Monitoreo de cron jobs |
| `/admin/config` | Admin | Configuración del sistema |

---

## Carpetas importantes

```
app/                    # Frontend Next.js (no mover)
  admin/                # Panel administrativo
  api/                  # API routes server-side
    admin/              # APIs del panel (todas requieren sesión)
components/
  admin/                # Componentes del panel admin
lib/
  adminSession.ts       # requireAdminSession() — guard de sesión
backend/
  supabase/
    migrations/         # Schema de DB (no modificar archivos existentes)
    functions/          # Edge Functions (leer antes de modificar)
docs/
  architecture/         # Database map, EF map
  business/             # Reglas de negocio, admin ops
  flows/                # Flujos E2E
  testing/              # Planes de prueba
claude/
  CLAUDE.md             # Reglas de trabajo (leer primero)
  THC_CONTEXT_INDEX.md  # Este archivo
```

---

## Comandos útiles

```bash
# Verificar compilación (no-destructivo)
npm run build

# Estado del repo
git diff --stat
git status

# Ver logs recientes
git log --oneline -10

# Build + lint local
npm run build
```

---

## Reglas de trabajo rápidas

1. **Leer antes de tocar.** Leer el archivo completo antes de proponer cambios.
2. **Cambios granulares.** Un archivo a la vez salvo que el usuario indique sprint.
3. **Toda API route admin** lleva `requireAdminSession()` como primera línea.
4. **Toda acción sensible** pide confirmación + motivo ≥ 5 chars en el frontend.
5. **No exponer secrets** en cliente, logs ni respuestas.
6. **No tocar producción** sin autorización explícita.
7. **No hacer git add / commit / push** salvo autorización explícita.
8. **No inventar** campos, tablas ni funciones — verificar en migraciones.
9. **Preferir EFs existentes** antes de consultar tablas directamente desde API routes.
10. Si algo no está claro, preguntar. No asumir.
