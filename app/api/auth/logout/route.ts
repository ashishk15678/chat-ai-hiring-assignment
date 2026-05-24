// app/api/auth/logout/route.ts

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { successResponse } from "@/lib/utils";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json(successResponse({ loggedOut: true }));
}
