// lib/utils.ts

import type { ApiSuccess, ApiError } from "@/lib/sdk/types";

export function successResponse<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function errorResponse(error: string, details?: unknown): ApiError {
  return { ok: false, error, ...(details !== undefined && { details }) };
}

/**
 * Derives a short conversation title from the first user message.
 * Truncates to 60 chars and strips newlines.
 */
export function titleFromMessage(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 60) || "New Chat";
}

// ──────────────────────────────────────────────
// General
// ──────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Returns true when running in a serverless / Edge environment
 * where native Node.js modules aren't available.
 */
export function isEdgeRuntime(): boolean {
  return typeof (globalThis as unknown as Record<string, unknown>).EdgeRuntime !== "undefined";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cn(...inputs: any[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") {
      classes.push(input);
    } else if (Array.isArray(input)) {
      const inner = cn(...input);
      if (inner) classes.push(inner);
    } else if (typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }
  return classes.join(" ");
}

export function relativeTime(date: Date | string | number): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function truncate(str: string, length: number): string {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

export const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
  { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  { id: "gemma2-9b-it", label: "Gemma 2 9B" },
];
