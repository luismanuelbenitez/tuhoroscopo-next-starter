"use client";

import { useEffect, useRef, useState } from "react";

// Aparición sutil al hacer scroll (opacity 0→1 + translateY pequeño→0), una
// sola vez por bloque — ver sprint "experiencia inmersiva de lectura"
// (2026-09-06).
//
// Implementación por getBoundingClientRect() en vez de IntersectionObserver
// puro: se probó con IntersectionObserver primero y, ante un salto de
// scroll instantáneo (scrollTo() sin pasos intermedios — puede pasar con
// restauración de posición del navegador al volver con "atrás"), algunos
// bloques nunca llegaban a revelarse porque el navegador no siempre
// muestrea la intersección de un elemento que fue "saltado" sin renderizar
// frames intermedios. Un registro compartido de checks, invocado en cada
// evento scroll/resize (con rAF para no repetir en el mismo frame) más un
// chequeo inicial al montar, es más lento en teoría pero 100% confiable
// sin importar cómo cambió el scroll — y con pocos bloques por página
// (~9) el costo es despreciable.
const registro = new Set<() => void>();
let rafId: number | null = null;
let listenersInstalados = false;

function chequearTodos() {
  rafId = null;
  for (const check of Array.from(registro)) check();
}

function solicitarChequeo() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(chequearTodos);
}

function instalarListenersGlobales() {
  if (listenersInstalados || typeof window === "undefined") return;
  listenersInstalados = true;
  window.addEventListener("scroll", solicitarChequeo, { passive: true });
  window.addEventListener("resize", solicitarChequeo);
}

export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function check() {
      const rect = el!.getBoundingClientRect();
      const margen = 80; // revela un poco antes de que entre del todo
      if (rect.top < window.innerHeight + margen && rect.bottom > -margen) {
        setVisible(true);
        registro.delete(check);
      }
    }

    registro.add(check);
    instalarListenersGlobales();
    solicitarChequeo(); // por si ya está en el viewport al montar

    return () => { registro.delete(check); };
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:!transition-none motion-reduce:!opacity-100 motion-reduce:!translate-y-0 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${className}`}
    >
      {children}
    </div>
  );
}
