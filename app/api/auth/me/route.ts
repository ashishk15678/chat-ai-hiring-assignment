// app/api/auth/me/route.ts

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { successResponse, errorResponse } from "@/lib/utils";

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json(errorResponse("Not authenticated"), {
      status: 401,
    });
  }
  return NextResponse.json(successResponse(session.user));
}
