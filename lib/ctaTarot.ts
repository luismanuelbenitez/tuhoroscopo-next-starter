// Texto único de los botones de compra de /tarot (Manuel, 2026-11-14: "todos
// los botones deben tener ese texto", el del cierre: "Quiero mi lectura por
// $U 690 →"). El precio siempre viene de tarot_configuracion.precio_base_uyu;
// si no se pudo verificar, el botón queda sin precio en vez de inventarlo.
export function textoCtaTarot(precioUYU: number | null, flecha = true): string {
  return `Quiero mi lectura${precioUYU !== null ? ` por $U ${precioUYU}` : ""}${flecha ? " →" : ""}`;
}
