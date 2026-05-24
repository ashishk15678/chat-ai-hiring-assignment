// lib/session.ts

import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/lib/sdk/types";

const secret = process.env.SESSION_SECRET || "replace-me-with-a-random-32-char-string-minimum";

export const sessionOptions = {
  cookieName: "llm_logger_session",
  password: secret,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Returns the logged-in user from the session, or null.
 * Use this in Server Components and Route Handlers.
 */
export async function getSessionUser() {
  const session = await getSession();
  return session.user ?? null;
}

/**
 * Throws a 401 JSON response if no user is in session.
 * Intended for Route Handlers that require authentication.
 */
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }
  return user;
}
