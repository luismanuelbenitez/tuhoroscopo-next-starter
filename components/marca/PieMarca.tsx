import Link from "next/link";
import type { Route } from "next";
import { EnlacesTarotPie } from "@/components/marca/EnlacesTarotPie";

// Pie único de las páginas de marca (auditoría UX 2026-10-30, T5): antes
// cada página cerraba distinto (/tarot y las SEO sin Privacidad, Términos ni
// Contacto; gracias sin los de Tarot). Oculta el footer global del layout.
// `minimo`: checkout y opinión, sin los enlaces de Tarot (no distraer del
// formulario) pero con los legales y Contacto, que dan confianza al pagar.
// Los enlaces llevan área de toque de ~36 px y sombra para leerse sobre la
// escena del pie (velas).
const INSTITUCIONALES = [
  { href: "/quienes-somos", label: "¿Quiénes somos?" },
  { href: "/faq", label: "Preguntas frecuentes" },
  { href: "/politica-de-privacidad", label: "Política de privacidad" },
  { href: "/terminos-del-servicio", label: "Términos del servicio" },
  { href: "/contacto", label: "Contacto" },
];
const MINIMOS = ["/politica-de-privacidad", "/terminos-del-servicio", "/contacto"];
const SOMBRA = "0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)";

export function PieMarca({ minimo = false, className = "" }: { minimo?: boolean; className?: string }) {
  const links = minimo ? INSTITUCIONALES.filter((l) => MINIMOS.includes(l.href)) : INSTITUCIONALES;
  return (
    <footer className={`relative pt-4 pb-10 ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: "body > footer { display: none !important; }" }} />
      {/* Velo detrás del texto: la escena del pie (velas, cristales) cae justo
          acá; mismo recurso que el pie de /lectura. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 bottom-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 55%, rgba(8,4,16,0.72), rgba(8,4,16,0.4) 60%, transparent 90%)" }} />
      {!minimo && <EnlacesTarotPie className="pb-3" />}
      <nav aria-label="Enlaces del sitio" className="relative px-5 mx-auto max-w-[760px]">
        <ul className="flex flex-wrap justify-center gap-x-5 text-[13px] text-white/70" style={{ textShadow: SOMBRA }}>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href as Route} className="inline-block py-2 hover:text-white transition-colors">{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="relative mt-2 px-5 mx-auto max-w-[560px] text-center text-[11.5px] leading-relaxed text-white/60" style={{ textShadow: SOMBRA }}>
        © {new Date().getFullYear()} Tu Oráculo · Operado por Luis Manuel Benítez Rodríguez · RUT 214998320016 · Uruguay. Todos los derechos reservados.
      </p>
    </footer>
  );
}
