-- Estratega de anuncios: documentos iniciales de "Qué sabe" (2026-11-04).
-- Se editan desde Admin → Estratega; este archivo solo los crea si no existen.

insert into estratega_documentos (clave, titulo, descripcion, orden, contenido) values
('economia', 'Economía del negocio', 'Precio, costos por venta, margen y cuánto se puede pagar por cliente. Los números en vivo los consulta con la herramienta "economia".', 10,
$$# Economía del negocio (al 4/11/2026)

## Producto
- Lectura de tarot online (tarot_one_shot): $690 UYU. Se entrega por WhatsApp (canal principal) con link a /lectura, audio y PDF.
- El precio NO incluye IVA por venta (confirmado por Manuel 4/11/2026).
- Hay cupones y lecturas de cortesía ($0): no son ventas.

## Lo que cuesta cada venta (variables)
| Concepto | Por venta | Origen |
|---|---|---|
| Mercado Pago | $42 (6,1 %) | comisión real de los cobros |
| Factura electrónica | $20 | pack de 50 facturas por $1.000 |
| IA de la lectura | ≈ $2 | US$ 0,05 promedio |
| Audio | ≈ $1 | ~1.400 caracteres |
| WhatsApp | ≈ $3 | 1 plantilla paga por venta (US$ 0,074) |
| **Margen por venta** | **≈ $622** | |

## Costos fijos por mes
- Vercel Pro US$ 20, Microsoft 365 US$ 10, dominio US$ 50/año ≈ US$ 4 → ≈ $1.400 por mes.
- Supabase Pro (US$ 25) se activa cuando haya ventas regulares → ≈ $2.450 por mes.
- Punto de equilibrio: ≈ 3 ventas por mes.

## Cuánto se puede pagar por cliente (CAC)
- Tope (ni gana ni pierde): $622.
- **Objetivo sano para crecer: ≈ $200 por venta** (un tercio del margen).
- Aceptable mientras se aprende: hasta ≈ $300.
- Si hay recompra, el tope sube: medir clientes que vuelven.

## Referencias reales
- Meta exp 1: ≈ $1.160 por venta → pérdida.
- Google Ads (2–4/11): ≈ US$ 6,45 (~$260) por 21 visitas, 6 checkouts y 1 venta.
$$),
('reglas', 'Reglas del negocio', 'Lo que la IA nunca debe proponer o romper.', 20,
$$# Reglas del negocio

- Mercado: Uruguay primero. LATAM recién cuando Uruguay venda de forma regular; España postergada.
- WhatsApp es el canal principal de entrega y de contacto.
- Paula (la lectura de ejemplo) es un personaje ficticio y se dice siempre. Nunca usar lecturas de clientes reales en anuncios.
- Checkout sin fricción: no agregar pasos, textos legales ni datos extra.
- Nada se le envía solo a un cliente. Cualquier mensaje a clientes lo decide Manuel.
- Meta Ads y Google Ads se manejan a mano por Manuel: la IA propone la configuración exacta y él la ejecuta.
- Tope de gasto de la cuenta de Meta: $8.000. No proponer subirlo sin datos que lo justifiquen.
- No tocar una campaña de Meta los primeros 3 días (reinicia el aprendizaje), salvo que esté claramente quemando plata.
- Diseño: móvil primero; textos legibles sobre fondos ilustrados.
$$),
('guia_meta', 'Guía Meta Ads', 'Cómo funciona Meta y qué aplica a este negocio.', 30,
$$# Guía Meta Ads (para este negocio)

## Cómo cobra
- Por impresiones (cada mil vistas, CPM). El costo por clic depende de cuánta gente toca: con CTR bajo, cada clic sale caro.
- En Uruguay el CPM ronda $150–250. Con CTR 4–5 % el clic sale $4–6; con 0,7 % sale ≈ $26.

## Qué pedirle (evento de optimización), según cuántas ventas hay
- Meta necesita ~50 eventos por semana del evento elegido para salir del aprendizaje.
- Con menos de ~10 ventas por semana, optimizar a Compra no alcanza a aprender.
- "Ver contenido" (ViewContent) en esta web se dispara apenas carga /tarot: trae clics baratos de curiosos (visitas de 2 s).
- "Iniciar el pago" (InitiateCheckout) se dispara cuando se crea la orden (formulario completo): es el mejor punto medio hoy.
- Compra (Purchase) cuando haya ~10+ ventas por semana.

## Qué reinicia el aprendizaje
- Cambiar público, ubicaciones, evento, creatividad o el presupuesto más de ~20 % de una vez. Pausar más de 7 días.

## Público
- El tarot lo compran mayormente mujeres. Exp 1 (mujeres 25–55) tuvo CTR 4,8 %; exp 2 (todos los géneros, edad abierta a 18) tuvo 0,7 %.
- La edad y el género "sugeridos" (Advantage+) son solo sugerencias: Meta los amplía. Para fijarlos hay que apagar la ampliación.

## Ubicaciones (datos reales 4/11)
- Facebook inicio: ≈ $12 por clic. Instagram inicio: ≈ $60. Instagram historias: ≈ $43.
- Estado de WhatsApp trajo la persona más interesada del exp 2.
- Audience Network: visitas baratas pero 0 inicios de pago (exp 1). No usar.

## Presupuesto
- Meta puede gastar hasta 75 % más del diario en un día, pero no más de 7 × diario por semana.
- Al arrancar una campaña suele quemar el presupuesto del día en la primera hora.

## Medición en esta web
- Píxel 1032140642948167. Eventos: PageView, ViewContent (/tarot), InitiateCheckout (orden creada), Purchase (pago aprobado).
- Las visitas de Meta desde fuera de Uruguay son la revisión de anuncios de Meta (robots) y no cuentan.
$$),
('guia_google', 'Guía Google Ads', 'Cómo funciona Google Ads de búsqueda y qué aplica a este negocio.', 40,
$$# Guía Google Ads (para este negocio)

## Cómo cobra
- Por clic (CPC). La persona ya estaba buscando ("tarot online", "lectura de tarot"): intención alta.
- En Uruguay hay poca competencia en tarot: clics baratos (≈ US$ 0,30 el 2–4/11).

## Campaña actual
- "tarot_busqueda" (búsqueda). Llega a /tarot y páginas por tema. utm_term trae la palabra clave.

## Qué mirar
- "Limitado por el presupuesto": si no aparece, subir presupuesto no trae más visitas; hay que sumar palabras clave o subir pujas.
- Términos de búsqueda reales: sumar negativas (ej. "gratis", "free", cursos, "significado de cartas").
- Medición de compra: conversión "Compra Tarot" con ID y etiqueta (pendientes "Google Ads 1/6–6/6"). Sin eso, Google no aprende quién compra.

## Cómo crecer
- Subir el presupuesto 30–50 % cada 2–3 días mientras el costo por venta siga bajo el objetivo.
- Probar páginas por tema (/tarot/amor, /tarot/trabajo-y-dinero, /tarot/decisiones) con grupos de anuncios por tema.

## Datos disponibles
- Hoy: visitas, checkout y ventas medidas en la web (fuente "Google Ads").
- Cuando se conecte la API de Google Ads (pendientes "Google Ads API 1/5–5/5"): gasto, clics, palabras clave y términos de búsqueda.
$$),
('experimentos', 'Historial de experimentos', 'Qué se probó, cuánto costó y qué se aprendió. Sumar uno al cerrar cada experimento.', 50,
$$# Historial de experimentos

## Meta · Exp 1 (tarot_video_v6_oct26) · 29/10–2/11/2026
- Optimizado a Compra, mujeres 25–55, Video V6.
- $2.325 gastados, CTR 4,8 %, 215 visitas, 2 % al checkout, 1 venta confirmada (≈ $1.160 por venta vs margen $622).
- Dejó de entregar el 2/11 por el límite de gasto ($5.000, ahora $8.000).
- Aprendizaje: el público y el video sí generan clics; el problema fue el paso de visita a checkout y el costo por venta.

## Meta · Exp 2 (meta_exp2) · desde 4/11/2026 14:17
- Objetivo "Ver contenido", $300/día, Uruguay, edad mínima 18 (sugerencia 22–55), todos los géneros, Video V6.
- Día 1: $498 en ~40 min, 2.728 impresiones, 19 clics (0,7 %), 14 visitas reales, 9 se fueron en ≤ 4 s, 1 checkout, 0 ventas.
- Instagram se llevó 62 % del gasto con clics de $43–60; Facebook inicio $12.
- Manuel le dio un día más (5/11). Pausar si clics < 1,5 % o > $35 por visita real sin ventas.

## Google Ads · tarot_busqueda · desde 2/11/2026
- ≈ US$ 6,45 al 4/11: 21 visitas, 6 al checkout (29 %), 1 venta.
- Mejor canal hasta ahora.
$$),
('decisiones', 'Decisiones tomadas', 'Lo que se acordó. Se suma solo cuando Manuel acepta una propuesta del Estratega.', 60,
$$# Decisiones tomadas

- 4/11/2026: el precio no incluye IVA por venta; cada venta lleva 1 factura ($20) y 1 mensaje pago de WhatsApp.
- 4/11/2026: el Estratega no toca Meta ni Google; propone y Manuel ejecuta.
$$)
on conflict (clave) do nothing;
