import {
  LayoutDashboard, ListTodo, BrainCircuit, Bell, ShoppingCart, CreditCard, Receipt, TrendingUp, Calculator,
  UserCheck, MessageCircle, Bot, Users, Star, Handshake, Tag, Megaphone, Search, BarChart3, Target, Compass,
  Radar, Telescope, BookOpen, Send, FileText, Sparkles, Settings, Workflow, ScrollText, Scale, Wallet, Gift,
  Rocket, Wrench, type LucideIcon,
} from "lucide-react";

// Menú del Admin Tarot (2026-11-16, pedido de Manuel): 7 secciones con
// solapas adentro (como Google Ads), en vez de 31 opciones sueltas. Las
// direcciones de cada página no cambian; solo cómo se agrupan.
export interface Solapa { href: string; label: string; icon: LucideIcon; exact?: boolean }
export interface Seccion { clave: string; label: string; icon: LucideIcon; solapas: Solapa[] }

export const SECCIONES: Seccion[] = [
  { clave: "panel", label: "Panel", icon: LayoutDashboard, solapas: [
    { href: "/admin/tarot", label: "Panel", icon: LayoutDashboard, exact: true },
    { href: "/admin/tarot/pendientes", label: "Pendientes", icon: ListTodo },
    { href: "/admin/tarot/asistente", label: "Asistente CEO", icon: BrainCircuit },
  ] },
  { clave: "ventas", label: "Ventas", icon: Wallet, solapas: [
    { href: "/admin/tarot/ordenes", label: "Órdenes", icon: ShoppingCart },
    { href: "/admin/tarot/pagos", label: "Pagos", icon: CreditCard },
    { href: "/admin/tarot/facturacion", label: "Facturación", icon: Receipt },
    { href: "/admin/tarot/ingresos", label: "Ingresos", icon: TrendingUp },
    { href: "/admin/tarot/presupuesto", label: "Presupuesto", icon: Calculator },
  ] },
  { clave: "clientes", label: "Clientes", icon: UserCheck, solapas: [
    { href: "/admin/tarot/clientes-unicos", label: "Clientes", icon: UserCheck },
    { href: "/admin/tarot/whatsapp", label: "WhatsApp", icon: MessageCircle },
    { href: "/admin/tarot/soporte", label: "Soporte automatizado", icon: Bot },
    { href: "/admin/tarot/clientes", label: "Registros", icon: Users },
    { href: "/admin/tarot/testimonios", label: "Testimonios", icon: Star },
  ] },
  { clave: "ofertas", label: "Ofertas", icon: Gift, solapas: [
    { href: "/admin/tarot/reglas-comerciales", label: "Reglas comerciales", icon: Handshake },
    { href: "/admin/tarot/codigos", label: "Cupones", icon: Tag },
    { href: "/admin/tarot/campanas", label: "Campañas (WhatsApp)", icon: Megaphone },
  ] },
  { clave: "adquisicion", label: "Adquisición", icon: Rocket, solapas: [
    { href: "/admin/tarot/google-ads", label: "Google Ads", icon: Search },
    { href: "/admin/tarot/meta-ads", label: "Meta Ads", icon: BarChart3 },
    { href: "/admin/tarot/campanas-ads", label: "Campañas Ads", icon: Target },
    { href: "/admin/tarot/estratega", label: "Estratega", icon: Compass },
    { href: "/admin/tarot/visitantes", label: "Visitantes", icon: Radar },
    { href: "/admin/tarot/analista", label: "Analista de conversión", icon: Telescope },
  ] },
  { clave: "lecturas", label: "Lecturas", icon: BookOpen, solapas: [
    { href: "/admin/tarot/lecturas", label: "Lecturas", icon: BookOpen },
    { href: "/admin/tarot/entregas", label: "Entregas", icon: Send },
    { href: "/admin/tarot/pdfs", label: "PDFs", icon: FileText },
    { href: "/admin/tarot/product-intelligence", label: "Product Intelligence", icon: Sparkles },
  ] },
  { clave: "sistema", label: "Sistema", icon: Wrench, solapas: [
    { href: "/admin/tarot/config", label: "Configuración", icon: Settings },
    { href: "/admin/tarot/ejecuciones", label: "Ejecuciones", icon: Workflow },
    { href: "/admin/tarot/logs", label: "Logs", icon: ScrollText },
    { href: "/admin/tarot/normativa", label: "Normativa", icon: Scale },
  ] },
];

// Alertas va sola, arriba de todo y apenas destacada (pedido de Manuel 2026-11-16).
export const ALERTAS: Solapa = { href: "/admin/tarot/alertas", label: "Alertas", icon: Bell };

export const TODAS_LAS_SOLAPAS: Solapa[] = SECCIONES.flatMap((s) => s.solapas);

export const coincide = (pathname: string, s: Solapa) =>
  s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`);

/** La solapa de la página actual (la coincidencia más larga gana). */
export function solapaActual(pathname: string): Solapa | null {
  return TODAS_LAS_SOLAPAS.filter((s) => coincide(pathname, s)).sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export function seccionActual(pathname: string): Seccion | null {
  const s = solapaActual(pathname);
  return s ? SECCIONES.find((x) => x.solapas.includes(s)) ?? null : null;
}
