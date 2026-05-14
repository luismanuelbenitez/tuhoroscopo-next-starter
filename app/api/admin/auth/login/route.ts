import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { AdminSession, adminSessionOptions } from "@/lib/adminSessionOptions";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { usuario, password } = body;

  if (!usuario || !password) {
    return NextResponse.json(
      { ok: false, motivo: "campos_requeridos", mensaje: "Falta usuario o contraseña." },
      { status: 400 }
    );
  }

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPass) {
    return NextResponse.json(
      { ok: false, motivo: "config_error", mensaje: "Variables de entorno no configuradas." },
      { status: 500 }
    );
  }

  if (usuario !== adminUser || password !== adminPass) {
    await new Promise(r => setTimeout(r, 500));
    return NextResponse.json(
      { ok: false, motivo: "credenciales_invalidas", mensaje: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const session = await getIronSession<AdminSession>(cookies(), adminSessionOptions);
  session.admin = { autenticado: true, usuario };
  await session.save();

  return NextResponse.json({ ok: true });
}
