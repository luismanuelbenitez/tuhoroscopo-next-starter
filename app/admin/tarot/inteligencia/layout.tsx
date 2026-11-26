import { Inter } from "next/font/google";

// Inteligencia comercial · Level Up (2026-11-25): tipografía del módulo.
// Inter (con cifras tabulares) solo para el contenido del módulo: el menú del
// admin sigue con la fuente del sistema. next/font la sirve desde el propio
// sitio (sin dependencias nuevas ni pedidos a Google en el navegador).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-ic" });

export default function LayoutInteligencia({ children }: { children: React.ReactNode }) {
  return <div className={inter.variable}>{children}</div>;
}
