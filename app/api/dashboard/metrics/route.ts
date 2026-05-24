/**
 * app/api/dashboard/metrics/route.ts
 * ──────────────────────────────────────────────
 * GET /api/dashboard/metrics
 *
 * Aggregates inference logs into dashboard metrics:
 *   - Totals (requests, conversations, tokens, errors)
 *   - Averages (latency, tokens per request)
 *   - Success / error rates
 *   - Time-series buckets for charting
 *   - Top models by request count
 *   - 10 most recent logs
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MetricsQuerySchema } from "@/lib/validators";
import { successResponse } from "@/lib/utils";
import type {
  DashboardMetrics,
  TimeSeriesPoint,
  ModelStat,
} from "@/lib/sdk/types";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const { hours, bucketMinutes } = MetricsQuerySchema.parse({
    hours: searchParams.get("hours") ?? 24,
    bucketMinutes: searchParams.get("bucketMinutes") ?? 60,
  });

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // ── Fetch all logs in the window ─────────────────────────────────────────
  const logs = await db.inferenceLog.findMany({
    where: { requestedAt: { gte: since } },
    orderBy: { requestedAt: "desc" },
  });

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalRequests = logs.length;
  const totalErrors = logs.filter((l) => l.status === "error").length;
  const totalCancelled = logs.filter((l) => l.status === "cancelled").length;
  const totalSuccess = logs.filter((l) => l.status === "success").length;
  const totalTokens = logs.reduce((sum, l) => sum + (l.totalTokens ?? 0), 0);

  const totalConversations = await db.conversation.count({
    where: { createdAt: { gte: since } },
  });

  // ── Averages ─────────────────────────────────────────────────────────────
  const completedLogs = logs.filter((l) => l.latencyMs != null);
  const avgLatencyMs =
    completedLogs.length > 0
      ? Math.round(
          completedLogs.reduce((sum, l) => sum + (l.latencyMs ?? 0), 0) /
            completedLogs.length,
        )
      : 0;

  const logsWithTokens = logs.filter((l) => l.totalTokens != null);
  const avgTokensPerRequest =
    logsWithTokens.length > 0
      ? Math.round(
          logsWithTokens.reduce((sum, l) => sum + (l.totalTokens ?? 0), 0) /
            logsWithTokens.length,
        )
      : 0;

  const avgPromptTokens =
    logsWithTokens.length > 0
      ? Math.round(
          logsWithTokens.reduce((sum, l) => sum + (l.promptTokens ?? 0), 0) /
            logsWithTokens.length,
        )
      : 0;

  const avgCompletionTokens =
    logsWithTokens.length > 0
      ? Math.round(
          logsWithTokens.reduce(
            (sum, l) => sum + (l.completionTokens ?? 0),
            0,
          ) / logsWithTokens.length,
        )
      : 0;

  // ── Rates ─────────────────────────────────────────────────────────────────
  const successRate =
    totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  const cancellationRate =
    totalRequests > 0 ? (totalCancelled / totalRequests) * 100 : 0;

  // ── Time-series buckets ────────────────────────────────────────────────────
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketMap = new Map<
    string,
    { requests: number; errors: number; latencies: number[]; tokens: number }
  >();

  for (const log of logs) {
    const bucketTime = new Date(
      Math.floor(log.requestedAt.getTime() / bucketMs) * bucketMs,
    );
    const key = bucketTime.toISOString().slice(0, 16); // "2025-05-24T12:00"
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { requests: 0, errors: 0, latencies: [], tokens: 0 });
    }
    const bucket = bucketMap.get(key)!;
    bucket.requests++;
    if (log.status === "error") bucket.errors++;
    if (log.latencyMs != null) bucket.latencies.push(log.latencyMs);
    bucket.tokens += log.totalTokens ?? 0;
  }

  const timeSeries: TimeSeriesPoint[] = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, data]) => ({
      bucket,
      requests: data.requests,
      errors: data.errors,
      avgLatencyMs:
        data.latencies.length > 0
          ? Math.round(
              data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length,
            )
          : 0,
      tokens: data.tokens,
    }));

  // ── Top models ─────────────────────────────────────────────────────────────
  const modelMap = new Map<
    string,
    { provider: string; requests: number; latencies: number[]; tokens: number }
  >();

  for (const log of logs) {
    const key = log.model;
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        provider: log.provider,
        requests: 0,
        latencies: [],
        tokens: 0,
      });
    }
    const m = modelMap.get(key)!;
    m.requests++;
    if (log.latencyMs != null) m.latencies.push(log.latencyMs);
    m.tokens += log.totalTokens ?? 0;
  }

  const topModels: ModelStat[] = Array.from(modelMap.entries())
    .map(([model, data]) => ({
      model,
      provider: data.provider,
      requests: data.requests,
      avgLatencyMs:
        data.latencies.length > 0
          ? Math.round(
              data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length,
            )
          : 0,
      totalTokens: data.tokens,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 5);

  // ── Recent logs ────────────────────────────────────────────────────────────
  const recentLogs = logs.slice(0, 10);

  const metrics: DashboardMetrics = {
    totals: {
      requests: totalRequests,
      conversations: totalConversations,
      tokens: totalTokens,
      errors: totalErrors,
    },
    averages: {
      latencyMs: avgLatencyMs,
      tokensPerRequest: avgTokensPerRequest,
      promptTokens: avgPromptTokens,
      completionTokens: avgCompletionTokens,
    },
    rates: {
      successRate: Math.round(successRate * 10) / 10,
      errorRate: Math.round(errorRate * 10) / 10,
      cancellationRate: Math.round(cancellationRate * 10) / 10,
    },
    timeSeries,
    topModels,
    recentLogs,
  };

  return NextResponse.json(successResponse(metrics));
}
