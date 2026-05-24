import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/sdk/types";

const SESSION_COOKIE = "llm_logger_session";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/chat/:path*",
    "/api/chat/:path*",
    "/api/conversations/:path*",
  ],
};

export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    return NextResponse.next();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getIronSession<SessionData>(req.cookies as any, {
    cookieName: SESSION_COOKIE,
    password: secret,
  });

  const isAuthenticated = Boolean(session.user);

  if (req.nextUrl.pathname.startsWith("/api/")) {
    if (!isAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
