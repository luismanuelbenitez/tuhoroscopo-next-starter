"use client";

import { useState, type ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { StyleRegistry, createStyleRegistry } from "styled-jsx";

// Registro de styled-jsx para el App Router (Paquete SEO 2, 2026-10-21).
// Sin esto, los <style jsx> de los componentes cliente recién se aplican al
// hidratar: el header global se veía ~2 s y después desaparecía (CLS de
// 0,08–0,13 en /, /tarot y las páginas con PaginaMarca). Con el registro, esos
// mismos estilos salen en el HTML del servidor. Patrón oficial de Next.js.
export function StyledJsxRegistry({ children }: { children: ReactNode }) {
  const [registro] = useState(() => createStyleRegistry());
  useServerInsertedHTML(() => {
    const estilos = registro.styles();
    registro.flush();
    return <>{estilos}</>;
  });
  return <StyleRegistry registry={registro}>{children}</StyleRegistry>;
}
