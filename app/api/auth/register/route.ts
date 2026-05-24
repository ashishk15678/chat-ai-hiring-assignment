// app/api/auth/register/route.ts
//
// Self-registration. Can be disabled by setting
// DISABLE_REGISTRATION=true in your environment.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { RegisterSchema } from "@/lib/validators";
import { successResponse, errorResponse } from "@/lib/utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { ZodError } from "zod";

export async function POST(req: NextRequest) {
  if (process.env.DISABLE_REGISTRATION === "true") {
    return NextResponse.json(
      errorResponse("Registration is disabled on this instance."),
      { status: 403 },
    );
  }

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
    input = RegisterSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return NextResponse.json(
      errorResponse("An account with that email already exists."),
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: "user",
    },
  });

  // Auto-login after registration
  const session = await getSession();
  session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  await session.save();

  return NextResponse.json(
    successResponse({ id: user.id, email: user.email, name: user.name }),
    { status: 201 },
  );
}
