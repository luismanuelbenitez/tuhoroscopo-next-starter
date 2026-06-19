import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import { AdminSession, adminSessionOptions } from "@/lib/adminSessionOptions";

const FREE_PATHS = [
  "/admin/login",
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
];

// These paths bypass maintenance mode (admin always accessible)
const MAINTENANCE_BYPASS_PREFIXES = ["/admin", "/api/admin"];

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

async function isMaintenanceModeOn(): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return false;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/config?nombre=eq.MODO_MANTENIMIENTO&select=valor&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
        },
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) return false;
    const data: { valor: string }[] = await res.json();
    return data?.[0]?.valor === "true";
  } catch {
    return false; // fail open — never block the site by a DB error
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const requestHeaders = new Headers(req.headers);
  if (pathname.startsWith("/admin")) {
    requestHeaders.set("x-is-admin", "1");
  }

  // /mantenimiento solo accesible si el modo está activo; si no, redirige al home
  if (pathname === "/mantenimiento") {
    const onMaintenance = await isMaintenanceModeOn();
    if (!onMaintenance) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Maintenance mode — check before anything else
  const skipMaintenance = MAINTENANCE_BYPASS_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );
  if (!skipMaintenance) {
    const onMaintenance = await isMaintenanceModeOn();
    if (onMaintenance) {
      return NextResponse.redirect(new URL("/mantenimiento", req.url));
    }
  }

  // Admin auth (unchanged logic)
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
  matcher: [
    // All routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?|ttf|otf|map)$).*)",
  ],
};
