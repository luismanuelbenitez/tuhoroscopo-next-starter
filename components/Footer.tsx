"use client";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative">
      {/*
       * globals.css fuerza footer { background: transparent !important }.
       * El background va en este div hijo para bypasear esa regla.
       * El border-top también va acá por la misma razón.
       */}
      <div style={{ background: '#0e0b22', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="mx-auto max-w-5xl px-4 py-8 text-center text-sm space-y-4">

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-white/55">
            <Link href="/quienes-somos" className="hover:text-white/90 transition-colors">
              ¿Quiénes somos?
            </Link>
            <Link href="/faq" className="hover:text-white/90 transition-colors">
              Preguntas frecuentes
            </Link>
            <Link href="/politica-de-privacidad" className="hover:text-white/90 transition-colors">
              Política de privacidad
            </Link>
            <Link href="/terminos-del-servicio" className="hover:text-white/90 transition-colors">
              Términos del servicio
            </Link>
            <Link href="/contacto" className="hover:text-white/90 transition-colors">
              Contacto
            </Link>
          </div>

          <p className="text-white/30 text-xs">
            © {new Date().getFullYear()} Tu Oráculo. Todos los derechos reservados.
          </p>

        </div>
      </div>
    </footer>
  );
}
