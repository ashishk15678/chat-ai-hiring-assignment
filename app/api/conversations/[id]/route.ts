/**
 * app/api/conversations/[id]/route.ts
 * ──────────────────────────────────────────────
 * GET    /api/conversations/:id  — fetch conversation with messages
 * PATCH  /api/conversations/:id  — update title / status (cancel)
 * DELETE /api/conversations/:id  — hard-delete conversation and all related data
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { UpdateConversationSchema } from "@/lib/validators";
import { successResponse, errorResponse } from "@/lib/utils";
import { ZodError } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/:id
 * Returns the conversation details plus its full message history.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      _count: { select: { logs: true } },
    },
  });

  if (!conversation) {
    return NextResponse.json(errorResponse("Conversation not found"), {
      status: 404,
    });
  }

  return NextResponse.json(
    successResponse({
      ...conversation,
      logCount: conversation._count.logs,
    }),
  );
}

/**
 * PATCH /api/conversations/:id
 *
 * Body (JSON, all optional):
 *   title   — new title
 *   status  — "active" | "cancelled"  (cancellation sets cancelledAt)
 *   model   — change the model for future messages
 *
 * Cancelling a conversation marks it as cancelled but keeps all data intact,
 * allowing the user to view the history.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const existing = await db.conversation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(errorResponse("Conversation not found"), {
      status: 404,
    });
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
    input = UpdateConversationSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  const isCancelling =
    input.status === "cancelled" && existing.status !== "cancelled";

  const updated = await db.conversation.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.model !== undefined && { model: input.model }),
      ...(isCancelling && { cancelledAt: new Date() }),
    },
  });

  return NextResponse.json(successResponse(updated));
}

/**
 * DELETE /api/conversations/:id
 * Hard-deletes the conversation, all its messages, and all related logs.
 * This is irreversible. For soft-delete, use PATCH with status: "cancelled".
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const existing = await db.conversation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(errorResponse("Conversation not found"), {
      status: 404,
    });
  }

  await db.conversation.delete({ where: { id } });

  return NextResponse.json(successResponse({ id, deleted: true }));
}
