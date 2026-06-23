import { NextResponse } from "next/server";
import { getPrecioSuscripcion } from "@/lib/getPrecioSuscripcion";

export async function GET() {
  const precio = await getPrecioSuscripcion();
  return NextResponse.json(
    { precio, moneda: "UYU" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
