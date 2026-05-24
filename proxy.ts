import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/sdk/types";
import { randomBytes } from "node:crypto";

const SESSION_COOKIE = "llm_logger_session";
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "replace-me-with-a-random-32-char-string-minimum";

export const config = {
  matcher: ["/dashboard/:path*", "/chat/:path*", "/api/:path*"],
};

export async function proxy(req: NextRequest) {
  // Create session options
  const sessionOptions = {
    cookieName: SESSION_COOKIE,
    password: SESSION_SECRET,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };

  // Type assertion needed for iron-session compatibility with Next.js RequestCookies
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getIronSession<SessionData>(
    req.cookies as any,
    sessionOptions,
  );

  // Implicit login: create user if doesn't exist
  if (!session.user) {
    const userId = `anonymous_${randomBytes(12).toString("hex")}`;
    session.user = {
      id: userId,
      email: `${userId}@anonymous.local`,
      name: "Anonymous User",
      role: "user",
    };

    // Save session - actual User record creation happens in getSessionUser()
    // which is called by API routes/components
    await session.save();
  }

  return NextResponse.next();
}
