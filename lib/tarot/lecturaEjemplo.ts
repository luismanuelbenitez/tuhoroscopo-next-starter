import type { LecturaPublica } from "@/lib/tarotLecturaPublica";

// Lectura de ejemplo de /tarot/ejemplo (2026-11-03). Copia fija de la lectura
// de cortesía "Paula" (orden ffb0cd07…, 22/10/2026): Paula es un personaje
// ficticio creado para mostrar el producto; el texto es el que generó el
// sistema, sin retoques. Copia en el repo (no se lee de la base): no vence,
// no suma aperturas a esa orden y nunca puede apuntar a un cliente real.
// Cartas y audio copiados a public/img/tarot/ejemplo/.
const DIR = "/img/tarot/ejemplo";

export const AUDIO_EJEMPLO = `${DIR}/resumen.mp3`;

export const LECTURA_EJEMPLO: LecturaPublica = {
  ok: true,
  nombre: "Paula",
  fecha_nacimiento: "1981-08-15",
  pregunta: "Amor y vínculos",
  expira_at: "",
  cartas: [
    {
      posicion: 1,
      nombre_carta: "Diez de Espadas",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-1.webp`,
      interpretacion: "El Diez de Espadas en tu presente dice lo que quizás ya sabés: algo en el plano afectivo llegó a su fin. No de a poco, sino de golpe. Esta carta no suaviza los finales — los nombra. Puede señalar una ruptura, una decepción o el cierre de una ilusión sobre alguien. El dolor es real. Y también lo es que este es el piso, no el abismo sin fondo.",
    },
    {
      posicion: 2,
      nombre_carta: "Siete de Bastos",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-2.webp`,
      interpretacion: "El Siete de Bastos como obstáculo señala una lucha interna que puede estar costándote energía: seguir defendiendo una posición que ya no tiene terreno bajo los pies. Puede ser que estés peleando por algo que ya se fue, o resistiéndote a aceptar el cierre. La valentía que esta carta pide no es aguantar más — es reconocer cuándo soltar.",
    },
    {
      posicion: 3,
      nombre_carta: "El Sol",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-3.webp`,
      interpretacion: "El Sol en la base inconsciente muestra de dónde venís: un período genuinamente luminoso, pleno, donde el amor o la conexión florecieron con claridad. Esa alegría fue real. El contraste con el presente duele más porque lo que se perdió valía. Esta carta también sugiere que esa capacidad de florecer no desapareció con el vínculo — sigue siendo tuya.",
    },
    {
      posicion: 4,
      nombre_carta: "As de Espadas",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-4.webp`,
      interpretacion: "El As de Espadas en posición de consejo es directo: el camino hacia adelante pasa por la verdad, no por el alivio. Puede haber algo que sabés pero que todavía no te animaste a formularte claramente — sobre qué pasó, sobre qué querés ahora, sobre qué no estás dispuesta a repetir. Esa claridad, aunque incomode, es lo que abre el siguiente capítulo.",
    },
    {
      posicion: 5,
      nombre_carta: "Sota de Copas",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-5.webp`,
      interpretacion: "La Sota de Copas como tendencia trae algo inesperado: si atravesás el proceso con honestidad, lo que aparece no es más dolor sino sensibilidad renovada. Un mensaje, un encuentro, una emoción que sorprende. Esta carta no promete una relación nueva — anuncia que la parte de vos que sabe amar y sentir está empezando a despertar de nuevo, con más intuición que antes.",
    },
  ],
  resumen_lectura: "Paula, las cinco cartas juntas cuentan una historia que tiene una lógica clara: vino una época de amor genuino y luminoso (El Sol), algo se rompió de manera definitiva (Diez de Espadas), y ahora hay una resistencia interna que complica el duelo (Siete de Bastos). La tensión central de la tirada no es si el vínculo puede recuperarse — las cartas no muestran eso. Lo que sí muestran es una persona que conoce el florecimiento afectivo de primera mano, que está parada en un final real, y que tiene delante una elección: seguir sosteniendo una posición que ya no tiene objeto, o usar esa energía para hacer algo más útil con el dolor.\n\nEl As de Espadas en posición de consejo es el punto de inflexión. No pide resignación ni optimismo forzado — pide lucidez. Hay algo que todavía no fue dicho con claridad, ya sea para otra persona o para vos misma, y mientras eso no se nombre, el proceso no avanza del todo. La Sota de Copas al final sugiere que cuando ese corte honesto ocurra, algo nuevo empieza a moverse en el plano emocional: no necesariamente una relación, sino una versión de vos más conectada con su propia intuición afectiva.\n\nLa progresión de la tirada es de cierre hacia apertura, pero el puente entre ambos pasa por una sola cosa: decirte la verdad.",
  mensaje_final: "Paula, lo que estas cartas ponen sobre la mesa es una pregunta concreta: ¿qué es lo que todavía no te dijiste? No sobre esa persona, sino sobre vos — qué querés de un vínculo, qué no estás dispuesta a volver a tolerar, qué parte de esa época luminosa querés llevar al próximo capítulo. El final ya ocurrió. Lo que depende de vos ahora es con qué claridad decidís pararte frente a lo que viene.",
  proximos_pasos: [
    "Dedicá un momento esta semana a escribir sin filtro qué fue lo que más te dolió de esta situación — no para entenderlo, sino para sacarlo afuera.",
    "Identificá una creencia sobre el amor que esta experiencia puso en duda, y preguntate si esa creencia todavía te sirve o si es hora de revisarla.",
    "Prestá atención a cualquier contacto o emoción inesperada en el plano afectivo durante los próximos días: la Sota de Copas suele llegar de formas que no anticipamos.",
  ],
};
