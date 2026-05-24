// lib/session.ts

import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/lib/sdk/types";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

const secret =
  process.env.SESSION_SECRET ||
  "replace-me-with-a-random-32-char-string-minimum";

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
 * Returns the logged-in user from the session, or automatically creates one.
 * Implicit login: every user gets a session automatically.
 * Also creates a User record in the database for proper tracking.
 */
export async function getSessionUser() {
  const session = await getSession();

  // If user already exists in session, return it
  if (session.user) {
    return session.user;
  }

  // Create implicit user - generate anonymous user ID using crypto
  const userId = `anonymous_${randomBytes(12).toString("hex")}`;
  const email = `${userId}@anonymous.local`;

  try {
    // Create actual User record in database for implicit user
    const dbUser = await db.user.create({
      data: {
        id: userId,
        email,
        name: "Anonymous User",
        passwordHash: "", // No password for implicit users
        role: "user",
      },
    });

    const implicitUser = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
    };

    // Store in session
    session.user = implicitUser;
    await session.save();

    return implicitUser;
  } catch (err) {
    // User might already exist (race condition or session reuse)
    // Try to fetch the existing user
    const existingUser = await db.user.findUnique({
      where: { id: userId },
    });

    if (existingUser) {
      const implicitUser = {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role,
      };

      session.user = implicitUser;
      await session.save();

      return implicitUser;
    }

    // If user creation failed for other reasons, throw error
    console.error("[session] Failed to create implicit user:", err);
    throw err;
  }
}

/**
 * Ensures a user is in session. Alias for getSessionUser for backward compatibility.
 */
export async function requireAuth() {
  const user = await getSessionUser();
  return user;
}
