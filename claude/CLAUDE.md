CLAUDE.md — Proyecto THC / Tu Horóscopo Cósmico
Proyecto: Tu Horóscopo Cósmico  
Abreviatura interna: THC  
Responsable: Manuel Benítez  
Stack principal: Next.js / React + Vercel + Supabase + PostgreSQL + Edge Functions + WhatsApp Cloud API + Mercado Pago + OpenAI  
Modo de trabajo obligatorio: Claude Code solo puede analizar y proponer. No puede modificar nada sin autorización explícita de Manuel.
---
1. Regla máxima de trabajo
Claude Code NO puede modificar archivos, crear archivos, borrar archivos, mover carpetas, ejecutar comandos destructivos, instalar paquetes, hacer commits, hacer push, desplegar a Vercel ni desplegar a Supabase sin autorización explícita de Manuel.
Antes de cualquier cambio debe:
Analizar el pedido.
Explicar brevemente qué entendió.
Proponer un plan.
Listar exactamente qué archivos tocaría.
Listar qué comandos ejecutaría.
Esperar aprobación explícita de Manuel.
La aprobación debe ser clara, por ejemplo:
"Aprobado, hacelo"
"Dale, aplicá los cambios"
"Sí, modificá esos archivos"
"Autorizo ejecutar esos comandos"
Si Manuel no aprueba explícitamente, Claude Code debe responder solo con análisis, propuesta, diagnóstico o código sugerido en texto, sin modificar nada.
---
2. Comandos prohibidos sin autorización explícita
No ejecutar sin aprobación directa de Manuel:
```bash
git add
git commit
git push
npm install
npm update
npm audit fix
npm run build
npx supabase db push
npx supabase functions deploy
npx supabase migration repair
supabase migration repair
rm
del
rmdir
mv
cp
```
Tampoco modificar sin autorización:
`package.json`
`package-lock.json`
migraciones existentes
`.env`
`.env.local`
variables de entorno
secretos
tokens
claves privadas
configuración de Vercel
configuración productiva de Supabase
estructura raíz del frontend
`.gitignore`
`.vercelignore`
---
3. Qué sí puede hacer Claude sin autorización de cambios
Claude puede hacer sin autorización previa:
leer archivos;
analizar código;
explicar arquitectura;
detectar riesgos;
proponer mejoras;
sugerir comandos;
diseñar planes;
revisar errores;
generar propuestas de código en texto;
explicar cómo probar;
listar archivos que convendría tocar.
Pero no puede aplicar cambios hasta que Manuel lo apruebe.
---
4. Qué no puede hacer Claude sin autorización
Claude no puede:
modificar archivos;
crear archivos;
borrar archivos;
mover carpetas;
instalar dependencias;
hacer commit;
hacer push;
desplegar a Supabase;
desplegar a Vercel;
cambiar migraciones;
tocar secretos;
ejecutar comandos destructivos;
cambiar estructura del frontend;
mover el frontend a otra carpeta;
modificar producción;
crear funciones de debug que expongan variables de entorno.
---
5. Qué es THC
Tu Horóscopo Cósmico, abreviado internamente como THC, es un producto digital/SaaS que entrega contenido personalizado por WhatsApp.
El enfoque no es astrología tradicional pesada. Es una mezcla de:
astrología suave;
bienestar emocional;
claridad práctica;
guía diaria breve;
contenido humano y cálido;
experiencia premium por WhatsApp;
automatización con IA.
El objetivo es que el usuario reciba mensajes que se sientan personales, útiles, cuidados y emocionalmente cercanos.
THC busca ser un producto premium, simple de usar, automatizado y emocionalmente valioso.
---
6. Modelo de negocio
El producto apunta principalmente a suscripciones Premium.
Plan Premium
Frecuencia operativa:
Lunes a sábado: contenido diario premium.
Domingo: mensaje especial de pausa/reflexión semanal.
Precio trabajado históricamente:
Aproximadamente UYU 390 / mes, IVA incluido.
El cobro se gestiona con Mercado Pago, principalmente mediante suscripciones recurrentes con `preapproval`.
---
7. Stack técnico
Frontend
Next.js / React.
Deploy automático en Vercel.
El frontend actual está en la raíz del repo.
Cada push a `main` dispara deploy automático en Vercel.
No mover el frontend a otra carpeta salvo instrucción explícita de Manuel.
Backend
Supabase.
PostgreSQL.
Edge Functions.
Cron jobs.
Secrets de Supabase.
Logs internos en tabla `log_funciones`.
Mensajería
WhatsApp Cloud API.
Templates aprobadas en Meta.
Envío mediante Edge Function `ef_whatsapp_sender`.
Pagos
Mercado Pago.
Suscripciones recurrentes con `preapproval`.
Webhooks procesados por Edge Functions.
Generación de contenido
OpenAI.
Se ha usado principalmente `gpt-4o-mini` en varios flujos.
---
8. Estructura actual del repositorio
```txt
/
├─ app/                  # Frontend Next.js actual
├─ components/           # Componentes React
├─ lib/                  # Utilidades y clientes frontend
├─ public/               # Assets públicos del frontend
├─ backend/
│  └─ supabase/
│     ├─ config.toml
│     ├─ migrations/
│     └─ functions/
├─ docs/
├─ claude/
│  └─ CLAUDE.md
├─ .gitignore
├─ .vercelignore
├─ package.json
└─ package-lock.json
```
Regla sobre estructura
La estructura ideal futura podría ser:
```txt
/
├─ frontend/
├─ backend/
├─ docs/
└─ claude/
```
Pero NO mover el frontend ahora. El frontend está funcionando correctamente en la raíz con GitHub y Vercel.
---
9. Reglas sobre Vercel
Vercel despliega el frontend desde la raíz actual.
No mover ni romper:
`app/`
`components/`
`lib/`
`public/`
`package.json`
`package-lock.json`
configuración actual de Next.js/Vercel
Vercel debe ignorar estas carpetas:
```txt
backend/
docs/
claude/
```
Estas carpetas existen para GitHub, Supabase local, documentación y Claude Code, pero no deberían formar parte del deploy del frontend.
Si algún cambio puede afectar el deploy de Vercel, Claude debe avisar antes y esperar autorización.
---
10. Reglas sobre Supabase
Supabase no se actualiza automáticamente por hacer push a GitHub.
GitHub guarda el código, pero Supabase solo cambia si se ejecutan comandos explícitos.
No ejecutar sin autorización:
```bash
npx supabase db push
npx supabase functions deploy
npx supabase migration repair
```
El comando `db pull` se usa para bajar schema remoto a local.  
El comando `functions download` se usa para bajar Edge Functions remotas a local.
Nunca asumir que se puede cambiar producción.
Antes de proponer cambios de Supabase, Claude debe explicar:
qué tabla o función se tocaría;
si afecta producción;
si requiere migración;
si requiere deploy de Edge Function;
cómo se prueba;
cómo se revierte.
---
11. Principio arquitectónico central
La arquitectura busca separar responsabilidades.
Regla de oro
> El sender no decide. Ejecuta.
Capas conceptuales
Generación  
Genera contenido con OpenAI y lo guarda en `contenido_premium`.
Encolado  
Decide qué contenido se debe mandar y crea filas en `mensajes_enviados`.
Sender  
Toma una fila de `mensajes_enviados`, valida si puede procesarla, resuelve plantilla, envía a WhatsApp y actualiza estados técnicos.
Webhooks  
Procesan eventos externos de WhatsApp y Mercado Pago.
Capa de negocio  
Maneja suscriptores, pagos, estados premium, contenido, plantillas y productos.
---
12. Tablas principales
12.1 `suscriptores`
Tabla central de usuarios/suscriptores.
Campos relevantes:
`id`
`nombre`
`email`
`telefono`
`whatsapp`
`signo`
`tipo_suscripcion`
`estado_suscripcion`
`premium_activo`
`whatsapp_confirmado`
`contenido_preferido`
`fecha_alta`
`fecha_inicio_premium`
`fecha_vencimiento_premium`
`preapproval_id`
`preapproval_status`
`mp_payer_email`
`mp_payer_id`
`bienvenida_enviada`
`primer_envio_premium_enviado`
`fecha_primer_envio_premium`
`fecha_baja`
`motivo_baja`
`creado_en`
`actualizado_en`
12.2 `contenido_premium`
Tabla donde se guarda el contenido generado para suscriptores premium.
Campos relevantes:
`id`
`id_suscriptor`
`contenido`
`fecha_creacion`
`generado`
`generado_por`
`resultado`
`ciclo_semana`
`emocion_dominante`
`fecha_envio_programada`
`fecha_envio_real`
`tipo`
`estado_envio`
`mensaje_id_whatsapp`
`ultimo_error`
`canal`
`reintentar_despues`
`enviado_por`
`color`
`contenido_preferido`
`numero`
`origen_generacion`
`meta_generacion`
Tipos de contenido:
`diario`
`domingo`
Estados de envío habituales:
`pendiente`
`encolado`
`enviado`
`fallido`
12.3 `mensajes_enviados`
Tabla tipo outbox para controlar envíos.
Uso esperado:
registrar mensajes pendientes;
controlar intentos;
evitar duplicados;
registrar errores;
guardar `mensaje_id_whatsapp`;
permitir reintentos controlados.
12.4 `plantillas`
Tabla usada para resolver plantillas de WhatsApp.
Importante:
el campo interno puede representar una plantilla lógica;
el valor real aprobado en Meta puede estar en otra columna;
no inventar nombres de plantillas;
revisar código y datos antes de asumir.
12.5 `log_funciones`
Tabla de observabilidad interna.
Uso:
registrar ejecuciones;
registrar errores;
guardar detalles JSON;
facilitar diagnóstico de Edge Functions.
12.6 Otras tablas relevantes
Pueden existir tablas relacionadas con:
pagos;
suscripciones;
configuración;
productos;
signos;
contenido gratis;
códigos de descuento;
eventos de WhatsApp;
webhooks;
auditoría.
Antes de tocar cualquier tabla, revisar la migración inicial en:
```txt
backend/supabase/migrations/
```
---
13. Formato de contenido diario premium
El contenido diario premium esperado suele usar este JSON:
```json
{
  "saludo_inicial": "",
  "horoscopo": "",
  "contenido_preferido": "",
  "numero": "",
  "color": "",
  "pausa": "",
  "pie_de_pagina": ""
}
```
Reglas de estilo:
breve;
humano;
cálido;
claro;
orientado a WhatsApp;
sin exceso de misticismo;
con una acción concreta o reflexión útil;
tono rioplatense moderado;
no usar frases robóticas;
no usar promesas exageradas.
---
14. Contenido domingo premium
El domingo suele tener un enfoque distinto al contenido diario.
Objetivo:
pausa semanal;
balance;
reflexión;
intención;
calma;
preparación emocional para la semana.
Puede incluir elementos como:
balance;
intención;
ritual simple;
frase de domingo;
color de la semana;
número de la semana;
desafío cósmico.
El tono debe sentirse premium, breve y útil.
---
15. Funciones Edge importantes
Funciones destacadas del backend:
`ef_whatsapp_sender`
`ef_run_sender_batch`
`ef_run_encolador_premium`
`ef_genera_guarda_contenido_premium`
`ef_genera_guarda_contenido_premium_domingo`
`ef_openia_genera_contenido_premium`
`ef_openia_genera_contenido_premium_domingo`
`ef_actualiza_envio_real_premium`
`ef_webhook_mp`
`ef_webhook_suscripcion`
`ef_webhook_whatsapp_events`
`ef_webhook_whatsapp_inbound`
`ef_webhook_whatsapp_status`
`ef_admin_listar_suscriptores`
`ef_admin_listar_suscripciones`
`ef_admin_listar_contenido_premium`
`ef_admin_metricas_basicas`
`ef_admin_resumen_diario`
`ef_admin_ver_estado_suscriptor`
`ef_admin_ver_mensaje`
`ef_aplicar_codigo_descuento`
`ef_validar_codigo_descuento`
Antes de modificar una función, Claude debe leerla completa y explicar:
qué hace;
qué entradas espera;
qué tablas toca;
qué riesgos tiene;
qué cambios propone.
---
16. Seguridad y secretos
Nunca imprimir, exponer, registrar ni devolver secretos.
No crear funciones de debug que muestren variables de entorno.
No subir a GitHub:
tokens;
passwords;
claves privadas;
archivos `.env`;
credenciales de Mercado Pago;
credenciales de WhatsApp;
service role key;
API keys de OpenAI;
connection strings privadas;
archivos de credenciales temporales.
Usar siempre:
```ts
Deno.env.get("NOMBRE_VARIABLE")
```
en lugar de hardcodear secretos.
Funciones de debug
No versionar ni desplegar funciones tipo:
```txt
ef_debug_env
```
o cualquier función cuyo objetivo sea mostrar variables de entorno.
---
17. Desarrollo del panel administrador
Objetivo próximo probable:
crear o mejorar un panel administrador en el frontend para consultar y operar información del backend.
Áreas esperadas:
suscriptores;
suscripciones;
pagos;
contenido premium;
mensajes enviados;
mensajes problemáticos;
logs;
métricas básicas;
resumen diario;
acciones administrativas controladas.
Regla:
Preferir consumir Edge Functions existentes antes que consultar directamente tablas desde el frontend.
No exponer `SUPABASE_SERVICE_ROLE_KEY` en frontend.
Si el frontend necesita datos sensibles, debe llamar una API route segura o una Edge Function administrativa protegida.
---
18. Forma correcta de trabajar
Para cualquier pedido de desarrollo:
Analizar.
Proponer plan.
Listar archivos a tocar.
Listar comandos a ejecutar.
Esperar aprobación.
Aplicar cambios solo si Manuel aprueba.
Explicar cómo probar.
Listar archivos modificados.
Advertir riesgos o pendientes.
Ejemplo de respuesta esperada antes de modificar:
```txt
Entendí que querés crear una pantalla admin para listar suscriptores.

Plan:
1. Revisar la función ef_admin_listar_suscriptores.
2. Crear una página en app/admin/suscriptores.
3. Crear un componente de tabla.
4. Agregar llamada desde el frontend a la API correspondiente.

Archivos que tocaría:
- app/admin/suscriptores/page.tsx
- components/admin/SuscriptoresTable.tsx
- lib/adminApi.ts

Comandos que ejecutaría:
- ninguno por ahora

No hago cambios hasta que me apruebes.
```
---
19. Estado actual del proyecto
Estado actual:
Frontend Next.js funcionando en la raíz.
GitHub conectado.
Vercel conectado.
Push a `main` dispara deploy automático.
Backend Supabase versionado en `backend/supabase`.
Schema remoto bajado como migración inicial.
Edge Functions remotas bajadas y versionadas.
`backend/`, `docs/` y `claude/` deben quedar fuera del deploy de Vercel.
No mover el frontend todavía.
---
20. Prioridad actual
La prioridad es avanzar de forma controlada, sin romper lo que ya funciona.
Orden recomendado:
Mantener frontend funcionando.
Construir panel administrador de forma progresiva.
Consumir Edge Functions administrativas existentes.
Probar cada pantalla de forma aislada.
No tocar producción sin autorización.
Documentar decisiones importantes.
Evitar cambios masivos.
Evitar refactors innecesarios.
---
21. Criterios para cambios de frontend
Antes de cambiar frontend, Claude debe revisar:
estructura actual de `app/`;
componentes existentes;
estilos usados;
patrones de llamadas API;
variables de entorno públicas;
impacto sobre Vercel.
No crear una arquitectura paralela si ya existe una forma usada en el proyecto.
No instalar librerías nuevas sin autorización.
No mover rutas existentes sin autorización.
---
22. Criterios para cambios de backend
Antes de cambiar backend, Claude debe revisar:
Edge Function afectada;
migración inicial;
tablas involucradas;
secrets necesarios;
compatibilidad con flujos actuales;
riesgo sobre producción.
No crear nuevas tablas sin explicar por qué.
No cambiar tipos de columnas sin explicar impacto.
No modificar migraciones existentes salvo autorización explícita.
Para nuevos cambios de schema, proponer una nueva migración.
---
23. Criterios para pruebas
Cuando proponga o aplique un cambio, Claude debe indicar cómo probarlo.
Para backend y Edge Functions, preferir:
comandos `curl` seguros;
colección Postman si corresponde;
JSON de prueba;
explicación de headers;
explicación de body;
resultado esperado;
validación en tablas.
Para frontend:
ruta a visitar;
pasos de prueba;
resultado esperado;
posibles errores.
---
24. Estilo de respuesta de Claude
Claude debe responder en español, claro y directo.
Preferencias:
ir paso a paso;
no dar 2 carillas cuando Manuel pidió algo puntual;
no apurarse;
confirmar antes de ejecutar;
evitar relleno;
separar diagnóstico, plan y autorización pendiente.
Formato recomendado:
```txt
Entendido.

Diagnóstico:
...

Plan:
...

Archivos que tocaría:
...

Comandos que ejecutaría:
...

Espero tu autorización antes de modificar.
```
---
25. Instrucción final para Claude Code
Actuar como un desarrollador senior cuidadoso.
No asumir.  
No improvisar.  
No tocar producción.  
No modificar sin permiso.  
No inventar campos ni tablas.  
No exponer secretos.  
No romper Vercel.  
No romper Supabase.  
No hacer cambios grandes sin dividirlos.
Primero entender.  
Después proponer.  
Después esperar autorización.  
Recién entonces ejecutar.