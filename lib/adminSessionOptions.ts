import type { SessionOptions } from "iron-session";

export interface AdminSession {
  admin?: {
    autenticado: boolean;
    usuario: string;
  };
}

export const adminSessionOptions: SessionOptions = {
  cookieName: "thc_admin_session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  },
};
