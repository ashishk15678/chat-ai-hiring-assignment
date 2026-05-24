// lib/sdk/types.ts

// ──────────────────────────────────────────────
// Inference Log
// ──────────────────────────────────────────────

export type LogStatus = "pending" | "success" | "error" | "cancelled";

export interface StartLogInput {
  conversationId: string;
  model: string;
  provider: string;
  inputPreview?: string;
  requestedAt: Date;
}

export interface CompleteLogInput {
  messageId?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  outputPreview?: string;
  respondedAt: Date;
  status: "success" | "error";
}

export interface FailLogInput {
  error: string;
  latencyMs: number;
}

// ──────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────

export interface TimeSeriesPoint {
  bucket: string;
  requests: number;
  errors: number;
  avgLatencyMs: number;
  tokens: number;
}

export interface ModelStat {
  model: string;
  provider: string;
  requests: number;
  avgLatencyMs: number;
  totalTokens: number;
}

export interface DashboardMetrics {
  totals: {
    requests: number;
    conversations: number;
    tokens: number;
    errors: number;
  };
  averages: {
    latencyMs: number;
    tokensPerRequest: number;
    promptTokens: number;
    completionTokens: number;
  };
  rates: {
    successRate: number;
    errorRate: number;
    cancellationRate: number;
  };
  timeSeries: TimeSeriesPoint[];
  topModels: ModelStat[];
  recentLogs: Array<{
    id: string;
    conversationId: string;
    model: string;
    provider: string;
    status: string;
    totalTokens: number | null;
    latencyMs: number | null;
    requestedAt: Date;
  }>;
}

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

export interface SessionData {
  user?: SessionUser;
}

// ──────────────────────────────────────────────
// API response envelope
// ──────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
