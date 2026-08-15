// Helper canónico para construir links de navegación entre pantallas del
// admin Tarot que referencian una orden (Alertas → detalle de Orden, etc.).
// Único punto de verdad: evita hardcodear la ruta en cada componente que
// necesite enlazar a una orden.
//
// /admin/tarot/ordenes no tiene una ruta [id] dedicada — el detalle es un
// drawer sobre la lista, controlado por estado de React. `orden_id` como
// query param permite el deep-link: la página lo lee al montar, busca esa
// orden puntual (filtro exacto ya soportado por ef_tarot_admin_listar_ordenes)
// y abre el mismo drawer que usaría un click normal en la fila.

export function hrefOrdenDetalle(ordenId: string | null | undefined): string | null {
  if (!ordenId) return null;
  return `/admin/tarot/ordenes?orden_id=${encodeURIComponent(ordenId)}`;
}
