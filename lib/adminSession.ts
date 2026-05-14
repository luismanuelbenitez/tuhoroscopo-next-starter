import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { AdminSession, adminSessionOptions } from "@/lib/adminSessionOptions";

export async function requireAdminSession() {
  const session = await getIronSession<AdminSession>(cookies(), adminSessionOptions);
  if (session.admin?.autenticado !== true) return null;
  return session;
}
