import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import { AdminSession, adminSessionOptions } from "@/lib/adminSessionOptions";

const FREE_PATHS = [
  "/admin/login",
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
];

async function verifyAdminSession(req: NextRequest): Promise<boolean> {
  const cookieName = adminSessionOptions.cookieName as string;
  const cookieValue = req.cookies.get(cookieName)?.value;
  if (!cookieValue) return false;
  try {
    const session = await unsealData<AdminSession>(cookieValue, {
      password: adminSessionOptions.password as string,
    });
    return session.admin?.autenticado === true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const requestHeaders = new Headers(req.headers);
  if (pathname.startsWith("/admin")) {
    requestHeaders.set("x-is-admin", "1");
  }

  if (FREE_PATHS.includes(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const autenticado = await verifyAdminSession(req);

  if (pathname.startsWith("/api/admin")) {
    if (!autenticado) {
      return NextResponse.json({ ok: false, motivo: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/admin")) {
    if (!autenticado) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
