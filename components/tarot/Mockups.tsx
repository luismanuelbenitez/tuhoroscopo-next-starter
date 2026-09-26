import Image from "next/image";
import type { CSSProperties } from "react";

// Mockups de la landing /tarot: objetos físicos generados con IA (celular y
// hoja con el fondo transparente, en public/img/tarot/props) + CAPTURAS REALES
// del producto encima. Así el contenido nunca es inventado y se puede
// actualizar cambiando solo la captura (ver docs/product/DECISIONS.md).

const PROPS = "/img/tarot/props";

// Rectángulo de la pantalla dentro de telefono.webp (medido por píxeles al
// quitar el verde #00FF00 del render original): % del ancho/alto del PNG.
const PANTALLA = { left: "4.67%", top: "1.78%", width: "90.66%", height: "96.37%" };

// Rectángulo de la hoja superior dentro de documento.webp (%).
const HOJA = { left: "0.22%", top: "0.08%", width: "90.78%", height: "93.83%" };

/** Celular con una captura real dentro de la pantalla. Relación de aspecto = telefono.webp (520×1109). */
export function CelularMock({
  pantalla, alt, className, style, priority = false,
}: { pantalla: "whatsapp" | "lectura"; alt: string; className?: string; style?: CSSProperties; priority?: boolean }) {
  return (
    <div className={className} style={{ position: "relative", aspectRatio: "520 / 1109", ...style }}>
      {/* La captura va DETRÁS del marco: la pantalla del PNG es transparente. */}
      <div style={{ position: "absolute", ...PANTALLA, overflow: "hidden", borderRadius: "9%/4.2%" }}>
        <Image
          src={`${PROPS}/pantalla-${pantalla}.webp`}
          alt={alt}
          width={780} height={1768}
          priority={priority}
          sizes="(max-width: 700px) 50vw, 260px"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
      <Image
        src={`${PROPS}/telefono.webp`}
        alt=""
        aria-hidden="true"
        width={520} height={1109}
        priority={priority}
        sizes="(max-width: 700px) 50vw, 260px"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </div>
  );
}

/** Pila de hojas con la primera página real del PDF encima. Relación de aspecto = documento.webp (520×711). */
export function DocumentoMock({
  alt, className, style, priority = false,
}: { alt: string; className?: string; style?: CSSProperties; priority?: boolean }) {
  return (
    <div className={className} style={{ position: "relative", aspectRatio: "520 / 711", ...style }}>
      <Image
        src={`${PROPS}/documento.webp`}
        alt=""
        aria-hidden="true"
        width={520} height={711}
        priority={priority}
        sizes="(max-width: 700px) 40vw, 220px"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <div style={{ position: "absolute", ...HOJA, overflow: "hidden" }}>
        <Image
          src={`${PROPS}/pdf-pagina1.webp`}
          alt={alt}
          width={620} height={877}
          priority={priority}
          sizes="(max-width: 700px) 40vw, 220px"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    </div>
  );
}
