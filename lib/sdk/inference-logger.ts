// lib/sdk/inference-logger.ts

import { db } from "@/lib/db";
import type {
  StartLogInput,
  CompleteLogInput,
  FailLogInput,
} from "@/lib/sdk/types";

/**
 * InferenceLogger wraps all DB writes for inference log lifecycle:
 *   startLog → completeLog | failLog | cancelLog
 */
export class InferenceLogger {
  async startLog(input: StartLogInput): Promise<string> {
    const log = await db.inferenceLog.create({
      data: {
        conversationId: input.conversationId,
        model: input.model,
        provider: input.provider,
        inputPreview: input.inputPreview?.slice(0, 500),
        requestedAt: input.requestedAt,
        status: "pending",
      },
    });
    return log.id;
  }

  async completeLog(id: string, input: CompleteLogInput): Promise<void> {
    await db.inferenceLog.update({
      where: { id },
      data: {
        messageId: input.messageId,
        latencyMs: input.latencyMs,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        outputPreview: input.outputPreview?.slice(0, 500),
        respondedAt: input.respondedAt,
        status: input.status,
      },
    });
  }

  async failLog(id: string, input: FailLogInput): Promise<void> {
    await db.inferenceLog.update({
      where: { id },
      data: {
        status: "error",
        error: input.error.slice(0, 1000),
        latencyMs: input.latencyMs,
        respondedAt: new Date(),
      },
    });
  }

  async cancelLog(id: string, latencyMs: number): Promise<void> {
    await db.inferenceLog.update({
      where: { id },
      data: {
        status: "cancelled",
        latencyMs,
        respondedAt: new Date(),
      },
    });
  }
}

export function redactPII(text: string): string {
  if (!text) return text;
  let redacted = text;
  // Redact emails
  redacted = redacted.replace(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  // Redact API keys (common formats like sk-..., gsk_..., etc.)
  redacted = redacted.replace(/(?:sk|gsk|key)-[a-zA-Z0-9]{20,}/gi, "[API_KEY]");
  // Redact credit cards (simple 13-16 digit pattern)
  redacted = redacted.replace(/\b(?:\d[ -]*?){13,16}\b/g, "[CREDIT_CARD]");
  return redacted;
}
