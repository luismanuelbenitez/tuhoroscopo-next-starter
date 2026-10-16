// Helpers de las API routes del admin de testimonios (tarot_testimonios).
// Viven acá y no en route.ts: un route.ts de Next solo puede exportar
// handlers HTTP.

export function restHeaders(serviceRoleKey: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    ...extra,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La orden se puede indicar por id (uuid) o por external_reference (lo que
// se ve en el admin de Órdenes). Devuelve el id o un motivo de error.
export async function resolverOrden(
  supabaseUrl: string,
  serviceRoleKey: string,
  ref: string,
): Promise<{ id: string } | { error: string }> {
  const valor = ref.trim();
  const filtro = UUID_RE.test(valor)
    ? `id=eq.${valor}`
    : `external_reference=eq.${encodeURIComponent(valor)}`;
  const res = await fetch(`${supabaseUrl}/rest/v1/tarot_ordenes?select=id&${filtro}&limit=1`, {
    headers: restHeaders(serviceRoleKey),
    cache: 'no-store',
  });
  const rows = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(rows)) return { error: 'db_error' };
  if (rows.length === 0) return { error: 'orden_no_encontrada' };
  return { id: rows[0].id };
}

// Mensaje claro cuando la base rechaza la operación.
export function motivoDesdeError(detalle: string): { motivo: string; detalle: string; status: number } {
  if (detalle.includes('chk_tarot_testimonios_publicable')) {
    return {
      motivo: 'no_publicable',
      detalle: 'Para que sea visible en la web necesita opinión, estrellas y la autorización del cliente.',
      status: 400,
    };
  }
  if (detalle.includes('uq_tarot_testimonios_orden') || detalle.includes('duplicate')) {
    return { motivo: 'orden_duplicada', detalle: 'Esa orden ya tiene un testimonio cargado.', status: 409 };
  }
  return { motivo: 'db_error', detalle, status: 500 };
}
