// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { LoginSchema } from "@/lib/validators";
import { successResponse, errorResponse } from "@/lib/utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { ZodError } from "zod";

export async function POST(req: NextRequest) {
  // Rate limit: 10 attempts / minute per IP
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(errorResponse("Invalid JSON body"), {
      status: 400,
    });
  }

  let input;
  try {
    input = LoginSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid =
    user && (await bcrypt.compare(input.password, user.passwordHash));

  // Use the same error message for missing user and wrong password
  // to prevent user enumeration.
  if (!valid) {
    return NextResponse.json(errorResponse("Invalid email or password"), {
      status: 401,
    });
  }

  const session = await getSession();
  session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  await session.save();

  return NextResponse.json(
    successResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }),
  );
}
