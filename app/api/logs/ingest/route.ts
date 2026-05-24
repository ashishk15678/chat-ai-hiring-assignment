/**
 * app/api/logs/ingest/route.ts
 * ──────────────────────────────────────────────
 * POST /api/logs/ingest
 *
 * The central ingestion endpoint for the lightweight SDK.
 * Receives an inference log payload, validates it, applies PII redaction,
 * and upserts it into the InferenceLog table.
 *
 * This endpoint is called by InferenceLogger.ingestRemote() when you want
 * to decouple the SDK from direct database access (e.g. edge environments).
 *
 * In the default setup the SDK writes directly to the DB via Prisma, so this
 * endpoint is only needed when useRemoteIngestion: true is set.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redactPII } from "@/lib/sdk/inference-logger";
import { IngestLogSchema } from "@/lib/validators";
import { successResponse, errorResponse } from "@/lib/utils";
import { ZodError } from "zod";

/**
 * POST /api/logs/ingest
 *
 * Body: IngestLogPayload (see lib/sdk/types.ts)
 *
 * Processing steps:
 *   1. Parse & validate with Zod
 *   2. Verify the referenced conversationId exists
 *   3. Redact PII from inputPreview / outputPreview
 *   4. Upsert the log row (idempotent if id is supplied)
 */
export async function POST(req: NextRequest) {
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
    input = IngestLogSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Payload validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  // Verify the conversation exists (foreign key check)
  const conversation = await db.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json(
      errorResponse(`Conversation '${input.conversationId}' not found`),
      { status: 404 },
    );
  }

  // Apply PII redaction to previews before storage
  const safeInput = input.inputPreview
    ? redactPII(input.inputPreview)
    : undefined;
  const safeOutput = input.outputPreview
    ? redactPII(input.outputPreview)
    : undefined;

  // Upsert so repeated deliveries don't create duplicate rows
  const log = await db.inferenceLog.upsert({
    where: {
      // If the sender didn't supply an id, use a synthetic unique combo
      // (this falls back to create since no row matches)
      id: ((body as Record<string, unknown>)["id"] as string) ?? "no-such-id",
    },
    create: {
      conversationId: input.conversationId,
      messageId: input.messageId,
      model: input.model,
      provider: input.provider,
      status: input.status,
      requestedAt: new Date(input.requestedAt),
      respondedAt: input.respondedAt ? new Date(input.respondedAt) : undefined,
      latencyMs: input.latencyMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      inputPreview: safeInput,
      outputPreview: safeOutput,
      error: input.error,
    },
    update: {
      status: input.status,
      respondedAt: input.respondedAt ? new Date(input.respondedAt) : undefined,
      latencyMs: input.latencyMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      outputPreview: safeOutput,
      error: input.error,
    },
  });

  return NextResponse.json(successResponse(log), { status: 201 });
}

/**
 * GET /api/logs/ingest
 * Returns schema documentation for the ingestion endpoint.
 */
export async function GET() {
  return NextResponse.json(
    successResponse({
      endpoint: "POST /api/logs/ingest",
      description: "Receives and stores inference log payloads",
      schema: {
        conversationId:
          "string (required) — must reference an existing conversation",
        messageId: "string (optional) — links log to a persisted message",
        model: "string (required) — model identifier",
        provider: "string (required) — e.g. 'groq'",
        status: "pending | success | error | cancelled",
        requestedAt: "ISO 8601 datetime (required)",
        respondedAt: "ISO 8601 datetime (optional)",
        latencyMs: "integer (optional) — wall-clock ms",
        promptTokens: "integer (optional)",
        completionTokens: "integer (optional)",
        totalTokens: "integer (optional)",
        inputPreview: "string (optional, max 500 chars) — will be PII-redacted",
        outputPreview:
          "string (optional, max 500 chars) — will be PII-redacted",
        error: "string (optional, max 1000 chars)",
      },
    }),
  );
}
