import type { LecturaPublica } from "@/lib/tarotLecturaPublica";

// Lectura de ejemplo de /tarot/ejemplo (2026-11-03). "Paula" es un personaje
// ficticio. Cartas = las del video de la portada y los anuncios (El Mago, La
// Rueda, El Sol, La Estrella, El Mundo). Textos escritos a mano con el estilo
// del sistema (a pedido de Manuel: la lectura real de cortesía era de una
// ruptura); el audio se generó con la misma voz y config de producción
// (modo "test" de ef_tarot_generar_audio_resumen, sin tocar la base).
// Copia en el repo: no vence, no suma aperturas y nunca apunta a un cliente.
const DIR = "/img/tarot/ejemplo";

export const AUDIO_EJEMPLO = `${DIR}/resumen.mp3`;

export const LECTURA_EJEMPLO: LecturaPublica = {
  ok: true,
  nombre: "Paula",
  fecha_nacimiento: "1981-08-15",
  pregunta: "Situación general",
  expira_at: "",
  cartas: [
    {
      posicion: 1,
      nombre_carta: "El Mago",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-1.webp`,
      interpretacion: "El Mago en tu presente habla de alguien que tiene en la mano todo lo que necesita para empezar. No es una carta de espera: es de acción. Las ideas que venís dando vueltas, las habilidades que quizás subestimás, los contactos que ya tenés — todo está sobre la mesa. Lo que esta carta pide es que dejes de prepararte y te animes a dar el primer paso concreto.",
    },
    {
      posicion: 2,
      nombre_carta: "La Rueda de la Fortuna",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-2.webp`,
      interpretacion: "La Rueda de la Fortuna como desafío muestra que estás en medio de un cambio de ciclo, y que no todo depende de vos. Eso puede generar ansiedad: ganas de controlar cada detalle. El desafío es otro — moverte con el cambio en lugar de resistirlo. Las circunstancias están girando a tu favor, pero piden flexibilidad para aprovechar las oportunidades cuando aparecen, aunque no lleguen en el orden que esperabas.",
    },
    {
      posicion: 3,
      nombre_carta: "El Sol",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-3.webp`,
      interpretacion: "El Sol en lo que no ves revela una fuerza que quizás no te estás reconociendo: tu capacidad de contagiar entusiasmo. Hay una alegría genuina en vos que los demás perciben con más claridad que vos misma. Esa energía es un recurso real — abre puertas, genera confianza y atrae a las personas indicadas. Esta carta te invita a mostrarla sin pedir permiso.",
    },
    {
      posicion: 4,
      nombre_carta: "La Estrella",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-4.webp`,
      interpretacion: "La Estrella como consejo es una invitación a confiar. Después de un tiempo de esfuerzo, esta carta trae calma y renovación: no hace falta forzar nada. El consejo es cuidar tu bienestar, volver a lo que te inspira y sostener la esperanza con hechos pequeños y constantes. Lo que estás sembrando ahora tiene sentido, aunque los resultados todavía no se vean del todo.",
    },
    {
      posicion: 5,
      nombre_carta: "El Mundo",
      orientacion: "derecha",
      imagen_url: `${DIR}/carta-5.webp`,
      interpretacion: "El Mundo como tendencia es una de las cartas más plenas del mazo: anuncia que un ciclo se completa y que llega una etapa de logro y satisfacción. Algo que empezaste encuentra su lugar. No es un final que cierra puertas, sino uno que te deja lista para un nuevo comienzo con más experiencia, más seguridad y una sensación clara de haber llegado.",
    },
  ],
  resumen_lectura: "Paula, tus cinco cartas cuentan una historia muy luminosa. El Mago en tu presente dice que ya tenés las herramientas: ideas, talento y recursos para avanzar. La Rueda de la Fortuna marca un cambio de ciclo que no podés controlar del todo, y ahí está el desafío: fluir con el movimiento en vez de resistirlo.\n\nEl Sol, en lo que no ves, muestra una energía tuya que los demás perciben con claridad: tu entusiasmo abre puertas. La Estrella, como consejo, te pide confiar, cuidarte y sostener la esperanza con pasos pequeños y constantes.\n\nY El Mundo, como tendencia, anuncia que algo que empezaste llega a buen puerto: una etapa de logro y plenitud. La tirada va de la acción a la realización. El puente entre las dos es animarte a empezar y confiar en el proceso.",
  mensaje_final: "Paula, estas cartas no hablan de suerte: hablan de un momento en el que tus propias herramientas y el movimiento de la vida empiezan a ir en la misma dirección. Lo que depende de vos es dar el primer paso y no soltar la confianza en el camino. Lo demás, según esta tirada, ya se está acomodando.",
  proximos_pasos: [
    "Elegí una idea que venís postergando y definí esta semana un primer paso concreto, por chico que sea.",
    "Cuando algo cambie de forma inesperada, preguntate qué oportunidad trae antes de intentar controlarlo.",
    "Reservá un momento por semana para algo que te inspire y te devuelva energía: La Estrella pide cuidarte.",
  ],
};
