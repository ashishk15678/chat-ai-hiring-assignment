/**
 * app/api/logs/route.ts
 * ──────────────────────────────────────────────
 * GET /api/logs  — list inference logs with filtering and pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LogsQuerySchema } from "@/lib/validators";
import { successResponse } from "@/lib/utils";

/**
 * GET /api/logs
 *
 * Query params:
 *   page            — page number (default 1)
 *   limit           — items per page (default 20, max 100)
 *   conversationId  — filter to a specific conversation
 *   status          — filter by status: pending | success | error | cancelled
 *   model           — filter by model identifier
 *
 * Returns logs ordered by most recently requested.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const query = LogsQuerySchema.parse({
    page: searchParams.get("page") ?? 1,
    limit: searchParams.get("limit") ?? 20,
    conversationId: searchParams.get("conversationId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    model: searchParams.get("model") ?? undefined,
  });

  const where = {
    ...(query.conversationId && { conversationId: query.conversationId }),
    ...(query.status && { status: query.status }),
    ...(query.model && { model: query.model }),
  };

  const [logs, total] = await Promise.all([
    db.inferenceLog.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        conversation: { select: { id: true, title: true } },
      },
    }),
    db.inferenceLog.count({ where }),
  ]);

  return NextResponse.json(
    successResponse({
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }),
  );
}
