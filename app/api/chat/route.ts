/**
 * app/api/chat/route.ts
 * POST /api/chat
 *
 * Streams a GROQ model response back to the client using the Vercel AI SDK.
 * On each request the route:
 *   1. Validates the body (messages, conversationId?, model, apiKey?)
 *   2. Resolves or creates the conversation in the DB
 *   3. Persists the new user message
 *   4. Creates a pending InferenceLog
 *   5. Calls GROQ via streamText and pipes the response
 *   6. In the onFinish callback, persists the assistant message and completes the log
 *
 * The conversation ID is returned in the X-Conversation-Id response header so
 * the client can redirect to /chat/[id] after the first message.
 *
 * Supports:
 *   - Multi-turn context (send full message history each request)
 *   - Custom API key (apiKey in body overrides server GROQ_API_KEY)
 *   - Streaming via SSE / data stream
 *   - Cancellation (client disconnect is handled by the AI SDK abort signal)
 */

import { NextRequest, NextResponse } from "next/server";
import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { db } from "@/lib/db";
import { InferenceLogger } from "@/lib/sdk/inference-logger";
import { ChatRequestSchema } from "@/lib/validators";
import { titleFromMessage, errorResponse } from "@/lib/utils";
import { ZodError } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Rate limit: 50 requests per 2 hours per user (or IP fallback)
  const user = await getSessionUser();
  const rateLimitIdentifier = user ? user.id : undefined;
  const limited = await checkRateLimit(req, "chat", rateLimitIdentifier);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(errorResponse("Invalid JSON body"), {
      status: 400,
    });
  }

  let parsed;
  try {
    parsed = ChatRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Validation failed", err.flatten()),
        { status: 422 },
      );
    }
    throw err;
  }

  const { messages, conversationId, model, apiKey } = parsed;

  // ── 2. Resolve conversation ─────────────────────────────────────────────────
  let conversation: { id: string; status: string; title: string } | null = null;

  if (conversationId) {
    conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true, title: true },
    });
    if (!conversation) {
      return NextResponse.json(errorResponse("Conversation not found"), {
        status: 404,
      });
    }
    if (conversation.status === "cancelled") {
      return NextResponse.json(
        errorResponse("This conversation has been cancelled. Start a new one."),
        { status: 409 },
      );
    }
  } else {
    // Create new conversation — title derived from the first user message
    const firstUser = messages.find((m) => m.role === "user");
    const title = firstUser ? titleFromMessage(firstUser.content) : "New Chat";
    conversation = await db.conversation.create({
      data: { title, model, provider: "groq" },
    });
  }

  // ── 3. Persist the new user message ─────────────────────────────────────────
  // The last message in the array is always the one the user just sent.
  if (!conversation) {
    return NextResponse.json(errorResponse("Failed to resolve or create conversation"), { status: 500 });
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === "user") {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: lastMessage.content,
      },
    });
  }

  // ── 4. Start inference log ────────────────────────────────────────────────
  const logger = new InferenceLogger();
  const requestedAt = new Date();
  const startTime = Date.now();

  const logId = await logger.startLog({
    conversationId: conversation.id,
    model,
    provider: "groq",
    inputPreview: lastMessage.content,
    requestedAt,
  });

  // ── 5. Stream via GROQ ────────────────────────────────────────────────────
  const groq = createGroq({
    apiKey: apiKey || process.env.GROQ_API_KEY || "",
  });

  try {
    const result = streamText({
      model: groq(model),
      messages,
      onFinish: async ({ text, usage, finishReason }) => {
        const latencyMs = Date.now() - startTime;

        // Persist assistant message
        let assistantMessageId: string | undefined;
        try {
          const assistantMsg = await db.message.create({
            data: {
              conversationId: conversation!.id,
              role: "assistant",
              content: text,
            },
          });
          assistantMessageId = assistantMsg.id;
        } catch (err) {
          console.error("[chat] Failed to persist assistant message:", err);
        }

        // Update conversation timestamp
        await db.conversation.update({
          where: { id: conversation!.id },
          data: { updatedAt: new Date() },
        });

        // Complete the log
        const status =
          finishReason === "stop" || finishReason === "length"
            ? "success"
            : "error";
        await logger.completeLog(logId, {
          messageId: assistantMessageId,
          latencyMs,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          outputPreview: text,
          respondedAt: new Date(),
          status,
        });
      },
    });

    // Return the streaming response with the conversation ID in a header
    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": conversation.id,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    await logger.failLog(logId, {
      error,
      latencyMs: Date.now() - startTime,
    });

    console.error("[chat] Stream error:", err);
    return NextResponse.json(errorResponse("Model request failed", error), {
      status: 502,
    });
  }
}

/**
 * GET /api/chat
 * Health-check for the chat endpoint.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      endpoint: "POST /api/chat",
      description: "Streams a model response using GROQ",
      defaultModel: "llama-3.3-70b-versatile",
    },
  });
}
