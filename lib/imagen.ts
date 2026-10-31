import { getImageProps } from "next/image";

// Imágenes optimizadas para un <img> existente (Paquete SEO 2, 2026-10-21).
//
// Devuelve solo los atributos de carga (src/srcSet/sizes/loading/
// fetchPriority/decoding) del optimizador de Next, para sumarlos a un <img>
// que ya tiene su estilo, ref, onError, etc. — sin cambiar el diseño ni la
// lógica de respaldo de cada componente. No agrega width/height al <img>
// (el layout lo siguen definiendo sus estilos).
//
// Dos usos:
//  - Tamaño fijo en pantalla (íconos, medallones): `fijo(src, ancho, alto)`
//    con el tamaño PINTADO más grande → variantes 1x/2x.
//  - Fluido (fondos, cartas, ilustraciones): `fluido(src, anchoNat, altoNat,
//    sizes)` con el tamaño natural del archivo (proporción) y `sizes` = ancho
//    pintado → el navegador elige el ancho justo.
// Por defecto carga diferida (las ocultas por CSS no se descargan); `prioridad`
// solo para el elemento LCP.
type Opc = { prioridad?: boolean; calidad?: number };

function base(src: string, width: number, height: number, sizes: string | undefined, { prioridad, calidad = 75 }: Opc) {
  const { props } = getImageProps({ src, width, height, alt: "", sizes, priority: prioridad, quality: calidad });
  return {
    src: props.src,
    srcSet: props.srcSet,
    sizes: props.sizes,
    loading: props.loading,
    fetchPriority: props.fetchPriority,
    decoding: props.decoding,
  };
}

export function fijo(src: string, ancho: number, alto: number = ancho, opc: Opc = {}) {
  return base(src, ancho, alto, undefined, opc);
}

export function fluido(src: string, anchoNat: number, altoNat: number, sizes: string, opc: Opc = {}) {
  return base(src, anchoNat, altoNat, sizes, opc);
}

/** URL del optimizador para usar en CSS (background-image). `ancho` tiene
 *  que ser uno de los tamaños permitidos (deviceSizes: 640, 750, 828, 1080,
 *  1200, 1920…). El formato (AVIF/WebP) lo negocia el navegador. */
export function urlOptimizada(src: string, ancho: 96 | 128 | 256 | 384 | 640 | 750 | 828 | 1080 | 1200 | 1920, calidad = 75) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${ancho}&q=${calidad}`;
}

// Cartas de /lectura: vienen como URL firmada de Supabase (tarot-assets).
// Si la URL es de ese bucket se pide optimizada (ver remotePatterns en
// next.config); cualquier otra se devuelve tal cual.
const CARTAS_FIRMADAS = "https://bckbpixlaxfxafhvlpbt.supabase.co/storage/v1/object/sign/tarot-assets/";
export function urlCarta(src: string, ancho: 96 | 256 | 384) {
  return src.startsWith(CARTAS_FIRMADAS) ? urlOptimizada(src, ancho) : src;
}
