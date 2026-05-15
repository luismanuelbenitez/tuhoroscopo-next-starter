"use client";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-gradient-to-b from-violet-950/90 via-indigo-900/80 to-black/90 backdrop-blur-sm">
      {/* Estrellas sutiles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="stars" />
      </div>

      {/* Contenido */}
      <div className="relative mx-auto max-w-5xl px-4 py-12 text-center text-sm text-white/80 space-y-8">
        {/* Links */}
        <div className="space-x-6">
          <Link href="/quienes-somos" className="hover:text-amber-300 transition">
            ¿Quiénes somos?
          </Link>
          <Link href="/faq" className="hover:text-amber-300 transition">
            Preguntas frecuentes
          </Link>
          <Link href="/politica-de-privacidad" className="hover:text-amber-300 transition">
            Política de privacidad
          </Link>
          <Link href="/contacto" className="hover:text-amber-300 transition">
            Contacto
          </Link>
        </div>


        {/* Copyright */}
        <p className="text-white/60">
          © {new Date().getFullYear()} Tu Horóscopo Cósmico. Todos los derechos reservados.
        </p>
      </div>

      {/* Animación estrellas */}
      <style jsx>{`
        .stars {
          width: 200%;
          height: 200%;
          background: transparent
            url("https://www.transparenttextures.com/patterns/stardust.png")
            repeat;
          animation: moveStars 60s linear infinite;
          opacity: 0.25;
        }

        @keyframes moveStars {
          from {
            transform: translate(0, 0);
          }
          to {
            transform: translate(-500px, -500px);
          }
        }
      `}</style>
    </footer>
  );
}
