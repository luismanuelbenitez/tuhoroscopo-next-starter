# Módulo de gobernanza de anuncios

Este módulo se armó en noviembre de 2026. Su objetivo es que el dueño de un SaaS o de una web maneje Google Ads "sin morir en el intento". La pantalla vive en `/admin/tarot/google-ads`.

## La idea

1. **Ninguna conclusión con pocos datos.** Cada regla sabe cuántos datos necesita. Si no los hay, el hallazgo va a la columna **Esperar** y dice qué falta. Así las cuentas chicas no reaccionan al ruido.
2. **Une el anuncio con el producto.** El motor cruza lo que informa Google (gasto, clics, nota de calidad) con lo que pasa después en la web: visitas, checkout y ventas. Google solo ve la primera parte.
3. **Nunca sube el gasto solo** (REGLA MÁXIMA, lib/reglaMaxima.ts):
   - Los botones **Aplicar** solo agregan palabras negativas y pausan palabras.
   - Presupuesto, pujas, campañas y redes los decide el dueño.

## Piezas

| Archivo | Qué hace | ¿Depende del negocio? |
|---|---|---|
| `tipos.ts` | Entrada, configuración y hallazgos | No |
| `reglas.ts` | Motor de reglas: una función pura que devuelve salud, números y hallazgos en 4 columnas (frenar, mejorar, escalar, esperar) más "ok" | No |
| `propuestas.ts` | Convierte el diagnóstico en cambios concretos ("agregar negativa", "pausar palabra") y en tareas a mano | No |
| `config.ts` | Valores por defecto, negativas universales, unión con la configuración guardada y validación | No |
| `resumenIa.ts` | Resumen en palabras con Anthropic, solo a demanda | No |
| `fuenteGoogle.ts` | **Adaptador de esta cuenta**: lee la base de Tu Oráculo y arma la `EntradaGobernanza` | **Sí** |
| `aplicarGoogle.ts` | Traduce las propuestas a operaciones de Google Ads, las valida, las aplica, las guarda y permite deshacerlas | Usa el adaptador |
| `../googleAdsApi/escritura.ts` | Único lugar que escribe en Google Ads, con su propio guardia (`asegurarMutacionPermitida`) | No |

## Cómo sumar otro negocio

1. **Escribir un adaptador** como `fuenteGoogle.ts` que devuelva una `EntradaGobernanza`. Necesita estos datos:
   - de la cuenta de Google: campañas, gasto por día, palabras con nota de calidad, búsquedas reales y negativas;
   - de la web: visitas, checkout, ventas e ingresos, en total y por palabra clave (`utm_term={keyword}` en el sufijo de URL de la campaña);
   - la velocidad de la página y la fecha del último cambio.
2. **Guardar su configuración.** Hoy va en `tarot_configuracion.gobernanza_google_ads`, como JSON, y se edita desde la pestaña **Ajustes**. Campos:
   - `valor_venta` y `cpa_objetivo`: si faltan, se usa el precio;
   - `paginas_destino`;
   - `negativas_extra`: las propias del rubro;
   - `no_negar`: universales que en ese negocio sí venden;
   - `minimos`: los datos que pide cada regla antes de opinar;
   - `lcp_max_ms`.
3. Llamar a `diagnosticar(entrada, armarConfig(precio, guardada))` y a `armarPropuestas(...)`. Las pantallas ya saben mostrar el resultado.

Para tener varios dueños en la misma instalación, falta guardar la configuración y las credenciales de Google por cuenta. Hoy hay una sola cuenta, en las variables de entorno.

## Probar las reglas sin tocar nada

`diagnosticar` es pura: se le puede pasar una entrada armada a mano y mirar los hallazgos. Para revisar la cuenta real, se corre `gobernanzaGoogle(rest, 14)` desde un script con `tsx`, que solo lee. `aplicarPropuesta(..., { modo: "validar" })` le pide a Google que revise los cambios (`validateOnly`) y no aplica nada.
