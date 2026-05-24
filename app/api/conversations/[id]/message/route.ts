/**
 * app/api/conversations/[id]/messages/route.ts
 * ──────────────────────────────────────────────
 * GET  /api/conversations/:id/messages  — list messages for a conversation
 * POST /api/conversations/:id/messages  — manually append a message (useful for imports)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/utils";
import { z, ZodError } from "zod";
import { withAuth, isAuthError } from "@/lib/middleware/auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/:id/messages
 *
 * Returns all messages for the conversation ordered chronologically.
 * Used by the frontend to load conversation history when resuming a chat.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await withAuth(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!conversation || conversation.userId !== auth.id) {
    return NextResponse.json(errorResponse("Conversation not found"), {
      status: 404,
    });
  }

  const messages = await db.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(successResponse(messages));
}

const AddMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
});

/**
 * POST /api/conversations/:id/messages
 *
 * Manually append a message to a conversation.
 * This does NOT trigger a model call — use POST /api/chat for that.
 *
 * Body (JSON):
 *   role    — "user" | "assistant" | "system"
 *   content — message text
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await withAuth(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true },
  });
  if (!conversation || conversation.userId !== auth.id) {
    return NextResponse.json(errorResponse("Conversation not found"), {
      status: 404,
    });
  }
  if (conversation.status === "cancelled") {
    return NextResponse.json(
      errorResponse("Cannot add messages to a cancelled conversation"),
      { status: 409 },
    );
  }

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
    input = AddMessageSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  const message = await db.message.create({
    data: {
      conversationId: id,
      role: input.role,
      content: input.content,
    },
  });

  return NextResponse.json(successResponse(message), { status: 201 });
}
