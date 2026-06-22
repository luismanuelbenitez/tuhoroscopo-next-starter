import { NextResponse } from "next/server";
import { getPrecioTarot } from "@/lib/getPrecioTarot";

export async function GET() {
  const precio = await getPrecioTarot();
  return NextResponse.json(
    { precio, moneda: "UYU" },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}
