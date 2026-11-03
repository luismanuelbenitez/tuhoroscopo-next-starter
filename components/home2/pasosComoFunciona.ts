// Los 4 pasos reales del producto (no "tu experiencia" genérico). Nunca
// decir que el usuario elige las cartas: se sortean ("aparecen para vos").
// Módulo común (sin "use client"): lo usan la Home (ComoFuncionaV2) y la
// página /como-funciona, así el texto es siempre el mismo.
export const PASOS = [
  { n: "1", icon: "/img/home/como_funciona/b4_elegi_experiencia.webp", t: "Elegís el tema", d: "Amor, trabajo, dinero, una decisión… y si querés, escribís tu consulta." },
  { n: "2", icon: "/img/home/como_funciona/b4_datos_pago.webp", t: "Pagás con Mercado Pago", d: "Pago único, simple y seguro. Sin suscripción." },
  { n: "3", icon: "/img/home/como_funciona/b4_whatsapp_experiencia.webp", t: "Cinco cartas aparecen para vos", d: "Tu lectura llega por WhatsApp en minutos." },
  { n: "4", icon: "/img/home/como_funciona/b4_experiencia_movil.webp", t: "La leés, la escuchás y la guardás", d: "Online, con resumen en audio y tu PDF." },
];
