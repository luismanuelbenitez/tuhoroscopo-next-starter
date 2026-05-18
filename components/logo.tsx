// ============================================================
// === Archivo: components/logo.tsx
// === Descripción: Componente para mostrar el logo y nombre del sitio.
// ===              Modificado para aceptar className.
// ============================================================
import Image from "next/image";
import Link from "next/link";

// 1. Define la interfaz de props, incluyendo className opcional
interface LogoProps {
  className?: string;
  // Puedes añadir otras props si las necesitas
}

// 2. Acepta className (y otras props si las hubiera)
export default function Logo({ className }: LogoProps) {
  return (
    // 3. Aplica el className recibido al elemento Link raíz
    //    Se usa `flex items-center justify-center gap-3 hover:opacity-90 transition` como clases base
    //    y se añade el `className` recibido para permitir personalización externa.
    <Link href="/" className={`flex items-center justify-center gap-3 hover:opacity-90 transition ${className || ''}`}>
      {/* Imagen del logo */}
      <Image
        // Asegúrate que esta ruta sea correcta según tu estructura en /public
        src="/img/logo/logo_solo.webp"
        alt="Tu Horóscopo Cósmico"
        width={120} // Considera si este tamaño debe ser fijo o adaptable
        height={120}
        priority // Mantenido si es importante para LCP
        // className interno para la imagen si necesitas estilos específicos en ella
        className="w-8 h-8 md:w-10 md:h-10"
      />

      {/* Nombre del sitio */}
      <div className="text-center leading-tight">
        <span className="block text-lg md:text-xl font-extrabold drop-shadow-sm text-white">
          TU HORÓSCOPO
        </span>
        <span className="block text-base md:text-lg font-bold text-violet-300 drop-shadow-sm">
          CÓSMICO
        </span>
      </div>
    </Link>
  );
}
