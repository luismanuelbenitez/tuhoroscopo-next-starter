import type { CSSProperties, ReactNode } from "react";
import { GOLD } from "@/components/home/theme";

// Piezas visuales base de /lectura (rediseño 2026-10-18, solo capa visual).
// Mismo lenguaje que /tarot: dorado de marca, Cormorant, pergamino para el
// contenido personal, paneles violeta oscuro con filete dorado fino.

export const DIR = "/img/lectura";
export const SERIF = "var(--font-serif-editorial), Georgia, serif";
export const CREMA = "#F5EFE0";
export const TINTA = "#241426";       // títulos sobre pergamino (misma que /tarot)
export const TINTA_SUAVE = "#5A4632"; // texto secundario sobre pergamino
export const TINTA_TEXTO = "#2a1a12"; // párrafos sobre pergamino
export { GOLD };

/** Fondo de página: el mismo de Home y /tarot. Se aplica en el <main>. */
export const FONDO_PAGINA = "linear-gradient(180deg, #120a28 0%, #0d0820 45%, #0b0818 100%)";

/** Ajusta el body como Home y /tarot (color base, sin el velo global). */
export function FondoLectura() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: "body{background-image:none!important;background-color:#0b0818!important}body::before{display:none!important}",
      }}
    />
  );
}

// "Carta viva" nivel 1 (2026-10-18): solo CSS (transform + opacity, sin
// re-render de React). Se aplica con la clase .carta-viva a un envoltorio de
// la carta y un <span class="carta-viva-brillo"> adentro para el reflejo.
//   - respiración: scale 1 → 1.015 + translateY 0 → -2px, 8s ida y vuelta
//   - halo dorado/violeta estático cuya OPACIDAD respira (.30 → .60)
//   - reflejo dorado tenue (alfa máx .14) que cruza la carta 1 vez cada 12s
// --cv-delay desfasa cada carta para que no respiren al unísono.
// prefers-reduced-motion: todo apagado (carta estática normal).
const CSS_CARTA_VIVA = `
.carta-viva{position:relative;animation:cv-respira 8s ease-in-out infinite alternate;animation-delay:var(--cv-delay,0s);will-change:transform}
.carta-viva::before{content:"";position:absolute;inset:-3px;border-radius:12px;pointer-events:none;z-index:-1;
  box-shadow:0 0 18px 1px rgba(240,197,90,.30),0 0 34px 6px rgba(110,50,190,.20);
  opacity:.30;animation:cv-halo 8s ease-in-out infinite alternate;animation-delay:var(--cv-delay,0s)}
.carta-viva-brillo{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}
.carta-viva .carta-viva-brillo::after{content:"";position:absolute;top:-25%;bottom:-25%;left:-60%;width:45%;
  background:linear-gradient(105deg,rgba(240,197,90,0) 0%,rgba(255,226,150,.14) 50%,rgba(240,197,90,0) 100%);
  animation:cv-brillo 12s ease-in-out infinite;animation-delay:var(--cv-delay,0s)}
@keyframes cv-respira{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(0,-2px,0) scale(1.015)}}
@keyframes cv-halo{from{opacity:.30}to{opacity:.60}}
@keyframes cv-brillo{0%,72%{transform:translateX(0)}100%{transform:translateX(430%)}}
@media (prefers-reduced-motion:reduce){
  .carta-viva,.carta-viva::before{animation:none!important}
  .carta-viva .carta-viva-brillo::after{display:none}
  .cartas-parallax{transform:none!important}
}`;

export function EstilosCartaViva() {
  return <style dangerouslySetInnerHTML={{ __html: CSS_CARTA_VIVA }} />;
}

/** Logo + nombre de la marca (mismo que el cabezal). */
export function MarcaTuOraculo({ centrado = false }: { centrado?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${centrado ? "justify-center" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/img/logo/logo-isotipo.png" alt="" aria-hidden="true" width={38} height={38} style={{ width: 38, height: 38 }} />
      <span className="whitespace-nowrap text-[17px] md:text-[18px] font-bold uppercase leading-none" style={{ fontFamily: SERIF, letterSpacing: "0.08em", color: GOLD }}>
        Tu Oráculo
      </span>
    </div>
  );
}

/** Antetítulo dorado en versalitas (mismo patrón que /tarot). */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.22em] ${className}`} style={{ color: GOLD }}>
      {children}
    </p>
  );
}

/** Panel violeta oscuro con filete dorado fino (mismo borde que /tarot). */
export function PanelOscuro({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[16px] ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(28,15,50,0.86) 0%, rgba(12,7,24,0.9) 100%)",
        border: "1px solid rgba(231,184,71,0.55)",
        boxShadow: "0 0 0 1px rgba(231,184,71,0.08), 0 12px 40px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,235,170,0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Pergamino de las tarjetas (mensaje, claves, PDF, otra lectura, texto del
// resumen): imagen 9-slice `paneles/pergamino-tarjeta.webp` (1200×420; los
// adornos de esquina ocupan ~130px). Las esquinas quedan intactas y solo se
// estiran bordes y centro, porque cada tarjeta tiene otro alto (y crece al
// desplegarse). Sin fondo de color ni esquinas redondeadas por CSS: asomarían
// por los bordes rasgados transparentes. La sombra va con drop-shadow, que
// respeta la transparencia. El grosor del borde va en PERGAMINO_CLASES
// (responsive: 34px mobile, 50px desktop).
export const PERGAMINO_TARJETA: CSSProperties = {
  borderStyle: "solid",
  borderColor: "transparent",
  borderImageSource: `url(${DIR}/contenedores/paneles/pergamino-tarjeta.webp)`,
  borderImageSlice: "130 fill",
  borderImageRepeat: "stretch",
  filter: "drop-shadow(0 12px 26px rgba(0,0,0,0.45))",
  color: TINTA_TEXTO,
};
export const PERGAMINO_CLASES = "border-[34px] [border-image-width:34px] md:border-[50px] md:[border-image-width:50px]";

/** Marco dorado metálico de carta, hecho con código (igual que /tarot). */
const MARCO_DORADO = "linear-gradient(145deg, #8a6420 0%, #f3d27a 22%, #b8862b 45%, #fbe39a 62%, #9c7224 82%, #e9c56a 100%)";

export function CartaConMarco({
  src, alt, invertida, ancho, grosor = 3, radio = 8, className = "",
}: { src: string | null; alt: string; invertida: boolean; ancho: number | string; grosor?: number; radio?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{ width: ancho, padding: grosor, borderRadius: radio, background: MARCO_DORADO, boxShadow: "0 8px 22px rgba(0,0,0,0.45), 0 0 0 1px rgba(90,60,10,0.35)", flexShrink: 0 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={invertida ? "rotate-180" : ""}
          style={{ display: "block", width: "100%", aspectRatio: "2 / 3", objectFit: "cover", borderRadius: Math.max(1, radio - grosor) }}
        />
      ) : (
        <div className="flex items-center justify-center text-[10px] text-center px-1" style={{ aspectRatio: "2 / 3", borderRadius: Math.max(1, radio - grosor), background: "#0c0718", color: "#8b84a3" }}>
          {alt}
        </div>
      )}
    </div>
  );
}
