// Formato único del precio de cara a la clienta (Manuel, 2026-11-14: "el precio
// igual en todos lados"): "$690", sin "$U". Donde hace falta aclarar la moneda
// se dice una sola vez "Pesos uruguayos" (total del checkout, términos).
// Mercado Pago lo muestra como "$ 690".
export function pesosUY(n: number): string {
  return `$${n.toLocaleString("es-UY")}`;
}

// Texto único de los botones de compra de /tarot (Manuel, 2026-11-14: "todos
// los botones deben tener ese texto", el del cierre: "Quiero mi lectura por
// $690 →"). El precio siempre viene de tarot_configuracion.precio_base_uyu;
// si no se pudo verificar, el botón queda sin precio en vez de inventarlo.
export function textoCtaTarot(precioUYU: number | null, flecha = true): string {
  return `Quiero mi lectura${precioUYU !== null ? ` por ${pesosUY(precioUYU)}` : ""}${flecha ? " →" : ""}`;
}
