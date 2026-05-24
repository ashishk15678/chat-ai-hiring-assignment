// lib/middleware/auth.ts
//
// Utility wrappers that enforce authentication inside Route Handlers.
// These are NOT Next.js middleware (middleware.ts) — they're helpers called
// at the top of each protected handler, keeping each route self-contained.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { errorResponse } from "@/lib/utils";
import type { SessionUser } from "@/lib/sdk/types";

// ──────────────────────────────────────────────
// Core check
// ──────────────────────────────────────────────

/**
 * Returns the session user or a 401 NextResponse.
 * Also ensures the user exists in the database (creates implicit user if needed).
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
  try {
    // getSessionUser() ensures user exists in session AND database
    const user = await getSessionUser();
    return user;
  } catch (err) {
    console.error("[withAuth] Failed to get/create user:", err);
    return NextResponse.json(errorResponse("Authentication failed"), {
      status: 500,
    });
  }
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
