// lib/middleware/auth.ts
//
// Utility wrappers that enforce authentication inside Route Handlers.
// These are NOT Next.js middleware (middleware.ts) — they're helpers called
// at the top of each protected handler, keeping each route self-contained.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/utils";
import type { SessionUser } from "@/lib/sdk/types";

// ──────────────────────────────────────────────
// Core check
// ──────────────────────────────────────────────

/**
 * Returns the session user or a 401 NextResponse.
 *
 * @example
 * const auth = await withAuth(req);
 * if (auth instanceof NextResponse) return auth;
 * // auth is SessionUser from here
 */
export async function withAuth(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _req: NextRequest,
): Promise<SessionUser | NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json(errorResponse("Authentication required"), {
      status: 401,
    });
  }
  return session.user;
}

/**
 * Like withAuth but additionally requires the "admin" role.
 */
export async function withAdminAuth(
  req: NextRequest,
): Promise<SessionUser | NextResponse> {
  const result = await withAuth(req);
  if (result instanceof NextResponse) return result;

  if (result.role !== "admin") {
    return NextResponse.json(errorResponse("Forbidden"), { status: 403 });
  }
  return result;
}

/**
 * Type guard — narrows the return of withAuth / withAdminAuth.
 */
export function isAuthError(v: SessionUser | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
