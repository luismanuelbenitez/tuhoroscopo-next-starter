import { NextResponse } from "next/server";
import { getPrecioTarot } from "@/lib/getPrecioTarot";

export async function GET() {
  const precio = await getPrecioTarot();

  if (precio === null) {
    // No inventamos un precio — el caller (usePrecioTarot) debe mostrar un
    // estado de "no disponible", nunca un número no verificado.
    return NextResponse.json(
      { precio: null, moneda: "UYU" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { precio, moneda: "UYU" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
