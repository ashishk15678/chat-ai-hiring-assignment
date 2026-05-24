// app/api/auth/me/route.ts

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { successResponse } from "@/lib/utils";

export async function GET() {
  // With implicit login, getSessionUser always returns a user
  const user = await getSessionUser();
  return NextResponse.json(successResponse(user));
}
