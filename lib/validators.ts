// lib/validators.ts

import { z } from "zod";

// ──────────────────────────────────────────────
// Chat
// ──────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(32_000),
});

export const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(200),
  conversationId: z.string().cuid().optional(),
  model: z.string().min(1).max(100).default("llama-3.3-70b-versatile"),
  apiKey: z.string().optional(),
  provider: z.string().optional(),
});

// ──────────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────────

export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  model: z.string().min(1).max(100).default("llama-3.3-70b-versatile"),
  provider: z.string().min(1).max(50).default("groq"),
});

export const UpdateConversationSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    status: z.enum(["active", "cancelled"]).optional(),
    model: z.string().min(1).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

// ──────────────────────────────────────────────
// Pagination
// ──────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});

// ──────────────────────────────────────────────
// Inference Logs
// ──────────────────────────────────────────────

export const IngestLogSchema = z.object({
  conversationId: z.string(),
  messageId: z.string().optional(),
  model: z.string(),
  provider: z.string(),
  status: z.enum(["pending", "success", "error", "cancelled"]),
  requestedAt: z.coerce.date(),
  respondedAt: z.coerce.date().optional(),
  latencyMs: z.coerce.number().int().nonnegative().optional(),
  promptTokens: z.coerce.number().int().nonnegative().optional(),
  completionTokens: z.coerce.number().int().nonnegative().optional(),
  totalTokens: z.coerce.number().int().nonnegative().optional(),
  inputPreview: z.string().optional(),
  outputPreview: z.string().optional(),
  error: z.string().optional(),
});

export const LogsQuerySchema = PaginationSchema.extend({
  conversationId: z.string().optional(),
  status: z.enum(["pending", "success", "error", "cancelled"]).optional(),
  model: z.string().optional(),
});

export const MetricsQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).default(24),
  bucketMinutes: z.coerce.number().int().min(1).default(60),
});
