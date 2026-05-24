/**
 * app/api/conversations/route.ts
 * ──────────────────────────────────────────────
 * GET  /api/conversations  — list all conversations (paginated)
 * POST /api/conversations  — create a new (empty) conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CreateConversationSchema, PaginationSchema } from "@/lib/validators";
import { successResponse, errorResponse } from "@/lib/utils";
import { ZodError } from "zod";
import { withAuth, isAuthError } from "@/lib/middleware/auth";

/**
 * GET /api/conversations
 *
 * Query params:
 *   page      — page number (default 1)
 *   limit     — items per page (default 20, max 100)
 *   status    — filter by status: "active" | "cancelled"
 *
 * Returns conversations ordered by most recently updated.
 */
export async function GET(req: NextRequest) {
  const auth = await withAuth(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;

  let page = 1,
    limit = 20;
  try {
    const p = PaginationSchema.parse({
      page: searchParams.get("page") ?? 1,
      limit: searchParams.get("limit") ?? 20,
    });
    page = p.page;
    limit = p.limit;
  } catch {
    // use defaults on validation failure
  }

  const statusFilter = searchParams.get("status");
  const where = statusFilter
    ? { userId: auth.id, status: statusFilter }
    : { userId: auth.id };

  const [conversations, total] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { messages: true } },
      },
    }),
    db.conversation.count({ where }),
  ]);

  return NextResponse.json(
    successResponse({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        provider: c.provider,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        cancelledAt: c.cancelledAt,
        messageCount: c._count.messages,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }),
  );
}

/**
 * POST /api/conversations
 *
 * Body (JSON):
 *   title?    — conversation title (default "New Chat")
 *   model?    — GROQ model id (default "llama-3.3-70b-versatile")
 *   provider? — provider name (default "groq")
 *
 * Creates an empty conversation (no messages). Useful for pre-creating a session
 * before the first message is sent.
 */
export async function POST(req: NextRequest) {
  const auth = await withAuth(req);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let input;
  try {
    input = CreateConversationSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  const conversation = await db.conversation.create({
    data: {
      title: input.title ?? "New Chat",
      model: input.model,
      provider: input.provider,
      userId: auth.id,
    },
  });

  return NextResponse.json(successResponse(conversation), { status: 201 });
}
