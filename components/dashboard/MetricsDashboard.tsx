"use client";

import React, { useMemo } from "react";
import type { DashboardMetrics } from "@/lib/sdk/types";
import {
  Activity,
  MessageSquare,
  AlertCircle,
  Clock,
  Coins,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn, relativeTime } from "@/lib/utils";

interface MetricsDashboardProps {
  metrics: DashboardMetrics;
}

export function MetricsDashboard({ metrics }: MetricsDashboardProps) {
  // Format token counts to human-readable strings (e.g. 1.2k, 500k, etc.)
  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num.toString();
  };

  // Compute stats for timeSeries chart mapping
  const timeSeriesPoints = metrics.timeSeries || [];
  const maxRequests = useMemo(() => {
    const points = metrics.timeSeries || [];
    if (points.length === 0) return 10;
    const max = Math.max(...points.map((p) => p.requests));
    return max > 0 ? max : 10;
  }, [metrics.timeSeries]);

  // Generate SVG Path for the requests chart
  const {
    linePath,
    areaPath,
    errorLinePath,
    errorAreaPath,
    gridLines,
    labels,
  } = useMemo(() => {
    const points = metrics.timeSeries || [];
    const width = 600;
    const height = 150;
    const padding = 20;

    if (points.length === 0) {
      return {
        linePath: "",
        areaPath: "",
        errorLinePath: "",
        errorAreaPath: "",
        gridLines: [],
        labels: [],
      };
    }

    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const mappedPoints = points.map((p, i) => {
      const x = padding + (i / Math.max(1, points.length - 1)) * chartWidth;
      const y =
        padding + chartHeight - (p.requests / maxRequests) * chartHeight;
      const errorY =
        padding + chartHeight - (p.errors / maxRequests) * chartHeight;
      return { x, y, errorY, label: p.bucket.split("T")[1] || p.bucket };
    });

    // Create paths for requests
    let lp = `M ${mappedPoints[0].x} ${mappedPoints[0].y}`;
    let ap = `M ${mappedPoints[0].x} ${padding + chartHeight} L ${mappedPoints[0].x} ${mappedPoints[0].y}`;

    // Create paths for errors
    let elp = `M ${mappedPoints[0].x} ${mappedPoints[0].errorY}`;
    let eap = `M ${mappedPoints[0].x} ${padding + chartHeight} L ${mappedPoints[0].x} ${mappedPoints[0].errorY}`;

    for (let i = 1; i < mappedPoints.length; i++) {
      lp += ` L ${mappedPoints[i].x} ${mappedPoints[i].y}`;
      ap += ` L ${mappedPoints[i].x} ${mappedPoints[i].y}`;
      elp += ` L ${mappedPoints[i].x} ${mappedPoints[i].errorY}`;
      eap += ` L ${mappedPoints[i].x} ${mappedPoints[i].errorY}`;
    }

    ap += ` L ${mappedPoints[mappedPoints.length - 1].x} ${padding + chartHeight} Z`;
    eap += ` L ${mappedPoints[mappedPoints.length - 1].x} ${padding + chartHeight} Z`;

    // Horizontal gridlines (4 sections)
    const grid: number[] = [];
    for (let i = 0; i <= 3; i++) {
      grid.push(padding + (i / 3) * chartHeight);
    }

    // Horizontal labels (max 5)
    const labelStep = Math.max(1, Math.floor(points.length / 4));
    const showLabels = mappedPoints.filter((_, idx) => idx % labelStep === 0);

    return {
      linePath: lp,
      areaPath: ap,
      errorLinePath: elp,
      errorAreaPath: eap,
      gridLines: grid,
      labels: showLabels,
      chartHeight,
      padding,
    };
  }, [metrics.timeSeries, maxRequests]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 overflow-y-auto h-full pb-16 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Observability Dashboard
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Real-time inference logs and API metrics from connected models.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-semibold transition-all hover:text-foreground cursor-pointer"
        >
          <RefreshCw size={13} />
          Reload
        </button>
      </div>

      {/* Totals Cards (4 columns) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Requests"
          value={formatNumber(metrics.totals.requests)}
          description="Inference API hits in timeframe"
          color="primary"
        />
        <StatCard
          title="Active Chats"
          value={formatNumber(metrics.totals.conversations)}
          description="Created conversations"
          color="emerald"
        />
        <StatCard
          title="Tokens Consumed"
          value={formatNumber(metrics.totals.tokens)}
          description="Prompt & completion tokens"
          color="amber"
        />
        <StatCard
          title="Error Count"
          value={metrics.totals.errors.toString()}
          description="Failed model API queries"
          color="red"
        />
      </div>

      {/* Middle Grid: Charts & Averages */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time-Series Chart */}
        <div className="lg:col-span-2 bg-[hsl(0,0%,6%)] border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Inference Traffic
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Total requests compared with error occurrences
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-primary">
                <span className="w-2.5 h-0.5 bg-primary inline-block" />
                Hits
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <span className="w-2.5 h-0.5 bg-red-400 inline-block" />
                Errors
              </span>
            </div>
          </div>

          <div className="h-44 flex items-end">
            {timeSeriesPoints.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center border border-dashed border-border rounded-lg text-xs text-muted-foreground select-none">
                No telemetry data available for this timeframe
              </div>
            ) : (
              <div className="w-full relative">
                <svg
                  viewBox="0 0 600 150"
                  className="w-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--color-primary)"
                        stopOpacity="0.15"
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-primary)"
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                    <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1" />
                      <stop
                        offset="100%"
                        stopColor="#ef4444"
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  {gridLines.map((y, idx) => (
                    <line
                      key={idx}
                      x1="20"
                      y1={y}
                      x2="580"
                      y2={y}
                      stroke="currentColor"
                      className="text-border/20"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Fill Areas */}
                  <path d={areaPath} fill="url(#areaGrad)" />
                  <path d={errorAreaPath} fill="url(#errorGrad)" />

                  {/* Stroke Lines */}
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={errorLinePath}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="3 3"
                  />
                </svg>

                {/* X Axis Labels */}
                <div className="flex justify-between text-[9px] text-muted-foreground font-mono mt-1.5 px-3">
                  {labels.map((p, idx) => (
                    <span key={idx}>{p.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Efficiency & Averages Metrics */}
        <div className="bg-[hsl(0,0%,6%)] border border-border/80 rounded-xl p-5 shadow-sm space-y-5 flex flex-col justify-between">
          <h2 className="text-sm font-bold text-foreground">
            Performance Rates
          </h2>

          <div className="space-y-4 flex-1 flex flex-col justify-center">
            {/* Success rate progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">API Success Rate</span>
                <span className="text-emerald-400">
                  {metrics.rates.successRate}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${metrics.rates.successRate}%` }}
                />
              </div>
            </div>

            {/* Error rate progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">API Error Rate</span>
                <span className="text-red-400">{metrics.rates.errorRate}%</span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${metrics.rates.errorRate}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-center mt-3">
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center mb-1">
                <Clock size={12} className="text-primary" />
                Avg Latency
              </p>
              <p className="text-base font-bold text-foreground font-mono">
                {metrics.averages.latencyMs}ms
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center mb-1">
                <Coins size={12} className="text-amber-400" />
                Tokens/Req
              </p>
              <p className="text-base font-bold text-foreground font-mono">
                {formatNumber(metrics.averages.tokensPerRequest)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Models & Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Top Models performance */}
        <div className="xl:col-span-2 bg-[hsl(0,0%,6%)] border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Top Models</h2>
            <p className="text-[11px] text-muted-foreground">
              Most requested model deployments
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground select-none">
                  <th className="py-2.5 font-semibold">Model</th>
                  <th className="py-2.5 font-semibold text-right">Hits</th>
                  <th className="py-2.5 font-semibold text-right">
                    Avg Latency
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {(metrics.topModels || []).map((m, idx) => (
                  <tr key={idx} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3 font-semibold text-foreground">
                      <div className="flex flex-col">
                        <span>{m.model}</span>
                        <span className="text-[10px] text-muted-foreground font-normal uppercase select-none">
                          {m.provider}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono text-muted-foreground">
                      {m.requests}
                    </td>
                    <td className="py-3 text-right font-mono text-muted-foreground">
                      {m.avgLatencyMs}ms
                    </td>
                  </tr>
                ))}
                {(metrics.topModels || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No models logged yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Observability Feed */}
        <div className="xl:col-span-3 bg-[hsl(0,0%,6%)] border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Recent Telemetry Logs
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Observed model queries in reverse-chronological order
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground select-none">
                  <th className="py-2.5 font-semibold">Time</th>
                  <th className="py-2.5 font-semibold">Model</th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Latency</th>
                  <th className="py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {(metrics.recentLogs || []).map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-muted/10 transition-colors"
                  >
                    <td className="py-3 font-mono text-muted-foreground">
                      {relativeTime(log.requestedAt)}
                    </td>
                    <td className="py-3 font-semibold text-foreground">
                      <span
                        className="block truncate max-w-[120px]"
                        title={log.model}
                      >
                        {log.model}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider select-none",
                          log.status === "success" &&
                            "bg-emerald-950/30 text-emerald-300 border-emerald-900/40",
                          log.status === "pending" &&
                            "bg-blue-950/30 text-blue-300 border-blue-900/40",
                          log.status === "error" &&
                            "bg-red-950/30 text-red-300 border-red-900/40",
                          log.status === "cancelled" &&
                            "bg-amber-950/30 text-amber-300 border-amber-900/40",
                        )}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-muted-foreground">
                      {log.latencyMs ? `${log.latencyMs}ms` : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/chat/${log.conversationId}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Open Chat
                        <ExternalLink size={10} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {(metrics.recentLogs || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No logs captured yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Helper components
// ──────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  color: "primary" | "emerald" | "amber" | "red";
}

function StatCard({ title, value, description, color }: StatCardProps) {
  return (
    <div className="bg-[hsl(0,0%,6%)] border border-border/80 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-border transition-all duration-200 group">
      <div className="flex items-center justify-between text-muted-foreground select-none mb-3">
        <span className="text-[11px] font-bold tracking-wider uppercase">
          {title}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-black text-foreground font-mono tracking-tight">
          {value}
        </p>
        <p className="text-[10px] text-muted-foreground font-medium leading-normal">
          {description}
        </p>
      </div>
    </div>
  );
}
