"use client";

import { Star } from "lucide-react";
import { GOLD, SERIF } from "@/components/home/theme";
import type { TestimonioTarot } from "@/lib/getTestimoniosTarot";

// Pergamino de la card (600×440, con su propio filete y hojitas en las
// esquinas; ~20px transparentes arriba y abajo). Se aplica con border-image
// en 9 partes: las esquinas quedan intactas y solo se estiran bordes y
// centro, porque el alto de cada card depende del largo de la opinión.
// Sin fondo ni box-shadow por CSS: asomarían por el margen transparente de
// la imagen (la sombra va con drop-shadow, que respeta la transparencia).
const PERGAMINO = "/img/tarot/contenedores/experiencias/pergamino-testimonio.webp";

const COLOR_TEXTO = "#2a1a12";
const COLOR_NOMBRE = "#5A4632";

function Estrellas({ n }: { n: number }) {
  return (
    <div className="flex items-center justify-center gap-1" role="img" aria-label={`${n} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={20}
          aria-hidden="true"
          style={{ color: "#D4A23C", fill: i < n ? "#E2AE3C" : "transparent" }}
        />
      ))}
    </div>
  );
}

// Exportada: la mini web de feedback (/opinion) la usa como vista previa
// REAL de cómo se vería la opinión publicada (2026-10-19).
export function CardTestimonio({ opinion, puntuacion, nombre, ciudad }: Pick<TestimonioTarot, "opinion" | "puntuacion" | "nombre" | "ciudad">) {
  const firma = [nombre, ciudad].filter(Boolean).join(", ");
  return (
    <figure
      className="h-full flex flex-col items-center justify-center text-center px-2 py-2"
      style={{
        borderStyle: "solid",
        borderWidth: 28,
        borderColor: "transparent",
        borderImage: `url(${PERGAMINO}) 80 fill / 28px stretch`,
        filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.35))",
        minHeight: 220,
      }}
    >
      <blockquote className="line-clamp-6" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, lineHeight: 1.35, color: COLOR_TEXTO }}>
        “{opinion}”
      </blockquote>
      <div className="mt-4">
        <Estrellas n={puntuacion} />
      </div>
      {firma && (
        <figcaption className="mt-3 text-[14px]" style={{ color: COLOR_NOMBRE }}>
          {firma}
        </figcaption>
      )}
    </figure>
  );
}

// Testimonios reales, levantados de tarot_testimonios (publicado = true)
// en app/tarot/page.tsx. Sin testimonios publicados, la sección no se
// renderiza — nunca hay relleno ni ejemplos en producción.
export function TestimoniosTarot({ testimonios }: { testimonios: TestimonioTarot[] }) {
  if (testimonios.length === 0) return null;

  return (
    <section id="testimonios" className="relative px-5 md:px-8 py-14 max-w-[960px] mx-auto text-center scroll-mt-16">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
        Testimonios
      </p>
      <h2 className="text-2xl md:text-3xl font-extrabold mb-10">
        Lo que dicen quienes ya lo vivieron
      </h2>

      {/* Fila centrada (no grilla fija): con 1 o 2 testimonios quedan al
          centro; cada card mide siempre un tercio, igual que con 3. */}
      <div className="flex flex-col md:flex-row md:flex-wrap md:justify-center gap-5 items-stretch">
        {testimonios.map((t) => (
          <div key={t.id} className="md:w-[calc((100%-2.5rem)/3)]">
            <CardTestimonio {...t} />
          </div>
        ))}
      </div>
    </section>
  );
}
