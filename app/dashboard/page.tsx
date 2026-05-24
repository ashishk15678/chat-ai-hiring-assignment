import { Suspense } from "react";
import { MetricsDashboard } from "@/components/dashboard/MetricsDashboard";
import { db } from "@/lib/db";
import type { DashboardMetrics } from "@/lib/sdk/types";

export const metadata = { title: "Dashboard — LLM Logger" };
export const dynamic = "force-dynamic"; // Render dynamically on request

async function fetchMetrics(hours = 24): Promise<DashboardMetrics> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const logs = await db.inferenceLog.findMany({
    where: { requestedAt: { gte: since } },
    orderBy: { requestedAt: "desc" },
  });

  const totalRequests = logs.length;
  const totalErrors = logs.filter((l) => l.status === "error").length;
  const totalCancelled = logs.filter((l) => l.status === "cancelled").length;
  const totalSuccess = logs.filter((l) => l.status === "success").length;
  const totalTokens = logs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);

  const totalConversations = await db.conversation.count({
    where: { createdAt: { gte: since } },
  });

  const completedLogs = logs.filter((l) => l.latencyMs != null);
  const avgLatencyMs = completedLogs.length
    ? Math.round(
        completedLogs.reduce((s, l) => s + l.latencyMs!, 0) /
          completedLogs.length,
      )
    : 0;
  const logsWithTokens = logs.filter((l) => l.totalTokens != null);
  const avgTokens = logsWithTokens.length
    ? Math.round(
        logsWithTokens.reduce((s, l) => s + l.totalTokens!, 0) /
          logsWithTokens.length,
      )
    : 0;

  // Time-series (1h buckets)
  const bucketMs = 60 * 60 * 1000;
  const bucketMap = new Map<
    string,
    { requests: number; errors: number; latencies: number[]; tokens: number }
  >();
  for (const log of logs) {
    const key = new Date(
      Math.floor(log.requestedAt.getTime() / bucketMs) * bucketMs,
    )
      .toISOString()
      .slice(0, 16);
    if (!bucketMap.has(key))
      bucketMap.set(key, { requests: 0, errors: 0, latencies: [], tokens: 0 });
    const b = bucketMap.get(key)!;
    b.requests++;
    if (log.status === "error") b.errors++;
    if (log.latencyMs != null) b.latencies.push(log.latencyMs);
    b.tokens += log.totalTokens ?? 0;
  }

  const timeSeries = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, d]) => ({
      bucket,
      requests: d.requests,
      errors: d.errors,
      avgLatencyMs: d.latencies.length
        ? Math.round(
            d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length,
          )
        : 0,
      tokens: d.tokens,
    }));

  const modelMap = new Map<
    string,
    { provider: string; requests: number; latencies: number[]; tokens: number }
  >();
  for (const log of logs) {
    if (!modelMap.has(log.model))
      modelMap.set(log.model, {
        provider: log.provider,
        requests: 0,
        latencies: [],
        tokens: 0,
      });
    const m = modelMap.get(log.model)!;
    m.requests++;
    if (log.latencyMs != null) m.latencies.push(log.latencyMs);
    m.tokens += log.totalTokens ?? 0;
  }

  const topModels = Array.from(modelMap.entries())
    .map(([model, d]) => ({
      model,
      provider: d.provider,
      requests: d.requests,
      avgLatencyMs: d.latencies.length
        ? Math.round(
            d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length,
          )
        : 0,
      totalTokens: d.tokens,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 5);

  return {
    totals: {
      requests: totalRequests,
      conversations: totalConversations,
      tokens: totalTokens,
      errors: totalErrors,
    },
    averages: {
      latencyMs: avgLatencyMs,
      tokensPerRequest: avgTokens,
      promptTokens: 0,
      completionTokens: 0,
    },
    rates: {
      successRate: totalRequests
        ? Math.round((totalSuccess / totalRequests) * 1000) / 10
        : 0,
      errorRate: totalRequests
        ? Math.round((totalErrors / totalRequests) * 1000) / 10
        : 0,
      cancellationRate: totalRequests
        ? Math.round((totalCancelled / totalRequests) * 1000) / 10
        : 0,
    },
    timeSeries,
    topModels,
    recentLogs: logs.slice(0, 10) as DashboardMetrics["recentLogs"],
  };
}

export default async function DashboardPage() {
  const metrics = await fetchMetrics(24);

  return (
    <div className="flex-1 overflow-auto">
      <Suspense
        fallback={
          <div className="p-8 text-muted-foreground">Loading metrics…</div>
        }
      >
        <MetricsDashboard metrics={metrics} />
      </Suspense>
    </div>
  );
}
