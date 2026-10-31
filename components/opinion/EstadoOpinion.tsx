import { CREMA, SERIF } from "@/components/home/theme";

// Estados de la mini web de feedback que no muestran el formulario.
const TEXTOS: Record<string, { titulo: string; texto: string }> = {
  respondido: {
    titulo: "Gracias por compartir tu experiencia.",
    texto: "Ya recibimos tu opinión. Nos ayuda mucho a seguir mejorando Tu Oráculo.",
  },
  expirado: {
    titulo: "Este enlace ya venció",
    texto: "El pedido de opinión tenía un plazo y ya terminó. Gracias igual por tu interés.",
  },
  invalido: {
    titulo: "No encontramos este enlace",
    texto: "Revisá que el link esté completo, tal como te llegó por WhatsApp.",
  },
  error: {
    titulo: "No pudimos cargar esta página",
    texto: "Probá de nuevo en unos minutos.",
  },
};

export function EstadoOpinion({ estado, nombrePila }: { estado: string; nombrePila?: string }) {
  const t = TEXTOS[estado] ?? TEXTOS.error;
  const titulo = t.titulo;
  const texto = estado === "respondido" && nombrePila ? `${nombrePila}, ya recibimos tu opinión. Nos ayuda mucho a seguir mejorando Tu Oráculo.` : t.texto;
  return (
    <section className="mt-10 text-center rounded-2xl px-6 py-10" style={{ background: "rgba(12,7,24,0.80)", border: "1px solid rgba(240,197,90,0.30)" }}>
      <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 28, lineHeight: 1.15, color: CREMA }}>{titulo}</h1>
      <p className="mt-3 text-[15px] text-white/70 leading-relaxed">{texto}</p>
      <a href="https://tuoraculo.uy" className="inline-block mt-7 text-[14px] underline underline-offset-4 text-white/70 hover:text-white">
        Ir a tuoraculo.uy
      </a>
      {estado !== "respondido" && (
        <p className="mt-4 text-[13.5px] text-white/60">
          ¿Necesitás ayuda? <a href="mailto:hola@tuoraculo.uy" className="underline underline-offset-4 text-white/80">hola@tuoraculo.uy</a>
        </p>
      )}
    </section>
  );
}
