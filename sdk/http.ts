// ─────────────────────────────────────────────────────────────────────────────
// HTTP client (shared fetch wrapper with logging events)
// ─────────────────────────────────────────────────────────────────────────────

import { EventBus, SDKConfig, SDKError } from ".";

let _requestCounter = 0;

export class HttpClient {
  constructor(
    private readonly config: Required<SDKConfig>,
    private readonly bus: EventBus,
  ) {}

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: { body?: unknown; signal?: AbortSignal } = {},
  ): Promise<T> {
    const requestId = String(++_requestCounter);
    const url = `${this.config.baseUrl}${path}`;
    const start = Date.now();

    this.bus.emit("request:start", { method, path, requestId });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Chain with any external abort signal
    options.signal?.addEventListener("abort", () => controller.abort());

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.sessionCookie
            ? { Cookie: this.config.sessionCookie }
            : {}),
        },
        credentials: "include", // browser: send session cookie automatically
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      // Automatically capture session cookies in server/CLI environments
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        const match = setCookie.match(/^([^;]+)/);
        if (match) {
          this.config.sessionCookie = match[1];
        }
      }

      this.bus.emit("request:end", {
        method,
        path,
        requestId,
        status: res.status,
        latencyMs,
      });

      // Rate limit signalling
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 60);
        this.bus.emit("ratelimit:hit", { path, retryAfter });
        throw new SDKError("Rate limit exceeded", 429, { retryAfter });
      }

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          message = data.error ?? message;
        } catch {
          /* ignore */
        }
        throw new SDKError(message, res.status);
      }

      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timeoutId);
      const error = err instanceof Error ? err.message : String(err);
      this.bus.emit("request:error", { method, path, requestId, error });
      throw err instanceof SDKError ? err : new SDKError(error, 0);
    }
  }
}
