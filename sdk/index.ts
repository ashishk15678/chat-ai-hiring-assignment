import { AuthManager } from "./auth";
import { HttpClient } from "./http";

/**
 * LLM Logger SDK
 * A typed, event-driven client for the LLM Logger API.
 *
 * Every meaningful lifecycle moment emits a typed event you can subscribe to:
 *
 *   const sdk = new LLMLoggerSDK({ baseUrl: "https://your-app.com" });
 *
 *   sdk.on("stream:chunk",  ({ chunk })   => process.stdout.write(chunk));
 *   sdk.on("stream:finish", ({ usage })   => console.log("tokens:", usage));
 *   sdk.on("request:error", ({ error })   => console.error(error));
 *   sdk.on("log:created",   ({ logId })   => saveForDashboard(logId));
 *
 *   const reply = await sdk.chat({ messages: [{ role: "user", content: "Hi" }] });
 *
 * Architecture
 * ─────────────
 * LLMLoggerSDK          — main entry point; owns the EventBus and all managers
 *   ├── EventBus        — typed pub/sub (on / off / emit / once)
 *   ├── AuthManager     — login / logout / register / me; persists session cookie
 *   ├── ChatManager     — streaming chat; consumes POST /api/chat SSE
 *   ├── ConversationManager — CRUD for conversations
 *   └── LogManager      — read-only access to inference logs (dashboard data)
 */

export interface SDKEvents {
  // Auth lifecycle
  "auth:login": { user: SessionUser };
  "auth:logout": Record<string, never>;
  "auth:register": { user: SessionUser };
  "auth:error": { error: string; context: string };

  // Chat / streaming
  "stream:start": { conversationId: string; model: string };
  "stream:chunk": {
    conversationId: string;
    chunk: string;
    accumulated: string;
  };
  "stream:finish": {
    conversationId: string;
    fullText: string;
    usage?: TokenUsage;
  };
  "stream:cancel": { conversationId: string };
  "stream:error": { conversationId: string; error: string };

  // Inference log lifecycle (mirrors server-side InferenceLogger)
  "log:created": {
    logId: string;
    conversationId: string;
    model: string;
    requestedAt: Date;
  };
  "log:completed": {
    logId: string;
    latencyMs: number;
    totalTokens?: number;
    status: LogStatus;
  };
  "log:failed": { logId: string; error: string; latencyMs: number };

  // Conversation CRUD
  "conversation:created": { conversation: Conversation };
  "conversation:updated": { conversation: Conversation };
  "conversation:deleted": { id: string };
  "conversation:loaded": { conversation: ConversationWithMessages };

  // Network / request lifecycle
  "request:start": { method: string; path: string; requestId: string };
  "request:end": {
    method: string;
    path: string;
    requestId: string;
    status: number;
    latencyMs: number;
  };
  "request:error": {
    method: string;
    path: string;
    requestId: string;
    error: string;
  };

  // Rate limit signal from API
  "ratelimit:hit": { path: string; retryAfter: number };
}

export type SDKEventName = keyof SDKEvents;

export type LogStatus = "pending" | "success" | "error" | "cancelled";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  status: "active" | "cancelled";
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
  messageCount?: number;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
  logCount: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  conversationId?: string;
  model?: string;
  /** Override the server-side GROQ API key for this request only */
  apiKey?: string;
  /** AbortSignal to cancel mid-stream */
  signal?: AbortSignal;
  /** Called for each streaming text chunk */
  onChunk?: (chunk: string, accumulated: string) => void;
}

export interface ChatResult {
  conversationId: string;
  text: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SDKConfig {
  /** Base URL of the LLM Logger app, e.g. "https://your-app.com" */
  baseUrl: string;
  /**
   * Optional session cookie value if you have one already (e.g. from SSR).
   * In browser environments the cookie is managed automatically.
   */
  sessionCookie?: string;
  /**
   * Default model to use for chat requests.
   * @default "llama-3.3-70b-versatile"
   */
  defaultModel?: string;
  /**
   * Request timeout in milliseconds (non-streaming requests only).
   * @default 30_000
   */
  timeout?: number;
}

type Listener<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private onceListeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends SDKEventName>(event: K, listener: Listener<SDKEvents[K]>): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Listener<unknown>);
    return this;
  }

  off<K extends SDKEventName>(
    event: K,
    listener: Listener<SDKEvents[K]>,
  ): this {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
    this.onceListeners.get(event)?.delete(listener as Listener<unknown>);
    return this;
  }

  once<K extends SDKEventName>(
    event: K,
    listener: Listener<SDKEvents[K]>,
  ): this {
    if (!this.onceListeners.has(event))
      this.onceListeners.set(event, new Set());
    this.onceListeners.get(event)!.add(listener as Listener<unknown>);
    return this;
  }

  emit<K extends SDKEventName>(event: K, payload: SDKEvents[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));

    const onceFns = this.onceListeners.get(event);
    if (onceFns) {
      onceFns.forEach((fn) => fn(payload));
      onceFns.clear();
    }
  }

  /** Remove all listeners for all events */
  removeAllListeners(): void {
    this.listeners.clear();
    this.onceListeners.clear();
  }
}

export class SDKError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "SDKError";
  }
}

export class ChatManager {
  constructor(
    private readonly config: Required<SDKConfig>,
    private readonly bus: EventBus,
  ) {}

  /**
   * Sends a chat request and streams the response.
   *
   * Emits:
   *   stream:start  → when the HTTP connection opens
   *   stream:chunk  → for each text chunk received
   *   stream:finish → when the stream ends (includes full text)
   *   stream:cancel → if the signal is aborted mid-stream
   *   stream:error  → on any network or parse error
   *   log:created   → immediately after the request is accepted
   *   log:completed → after stream:finish with latency + token data
   *   log:failed    → after stream:error
   *
   * Returns the full assistant text and resolved conversationId.
   */
  async send(options: ChatOptions): Promise<ChatResult> {
    const {
      messages,
      conversationId,
      model = this.config.defaultModel,
      apiKey,
      signal,
      onChunk,
    } = options;

    const requestStart = Date.now();

    let resolvedConversationId = conversationId ?? "";
    let logId: string | null = null;

    const url = `${this.config.baseUrl}/api/chat`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages, conversationId, model, apiKey }),
        signal,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Fetch failed";
      this.bus.emit("stream:error", {
        conversationId: resolvedConversationId,
        error,
      });
      if (logId) {
        this.bus.emit("log:failed", {
          logId,
          error,
          latencyMs: Date.now() - requestStart,
        });
      }
      throw new SDKError(error, 0);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 60);
      this.bus.emit("ratelimit:hit", { path: "/api/chat", retryAfter });
      throw new SDKError("Rate limit exceeded", 429, { retryAfter });
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = (await response.json()) as { error?: string };
        message = data.error ?? message;
      } catch {
        /* ignore */
      }
      this.bus.emit("stream:error", {
        conversationId: resolvedConversationId,
        error: message,
      });
      throw new SDKError(message, response.status);
    }

    // The server returns the conversation ID in a header
    const headerId = response.headers.get("X-Conversation-Id");
    if (headerId) resolvedConversationId = headerId;

    // Emit log:created immediately — we don't have the DB log ID from the
    // client side, so we use the conversationId as a correlation handle.
    logId = `client-${Date.now()}`;
    this.bus.emit("log:created", {
      logId,
      conversationId: resolvedConversationId,
      model,
      requestedAt: new Date(),
    });

    this.bus.emit("stream:start", {
      conversationId: resolvedConversationId,
      model,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new SDKError("No response body", 0);

    const decoder = new TextDecoder();
    let accumulated = "";
    let usage: TokenUsage | undefined;
    let cancelled = false;

    try {
      while (true) {
        // Check for external abort
        if (signal?.aborted) {
          reader.cancel();
          cancelled = true;
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        const lines = raw.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;

          // Text chunk: 0:"some text"
          if (line.startsWith('0:"') || line.startsWith("0:")) {
            const jsonPart = line.slice(2);
            try {
              const chunk = JSON.parse(jsonPart) as string;
              accumulated += chunk;
              onChunk?.(chunk, accumulated);
              this.bus.emit("stream:chunk", {
                conversationId: resolvedConversationId,
                chunk,
                accumulated,
              });
            } catch {
              /* non-text line */
            }
            continue;
          }

          // Finish metadata: d:{...}
          if (line.startsWith("d:") || line.startsWith("e:")) {
            try {
              const meta = JSON.parse(line.slice(2)) as {
                finishReason?: string;
                usage?: {
                  promptTokens: number;
                  completionTokens: number;
                  totalTokens?: number;
                };
              };
              if (meta.usage) {
                usage = {
                  promptTokens: meta.usage.promptTokens,
                  completionTokens: meta.usage.completionTokens,
                  totalTokens:
                    meta.usage.totalTokens ??
                    meta.usage.promptTokens + meta.usage.completionTokens,
                };
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Stream read error";
      if (!cancelled) {
        this.bus.emit("stream:error", {
          conversationId: resolvedConversationId,
          error,
        });
        this.bus.emit("log:failed", {
          logId: logId!,
          error,
          latencyMs: Date.now() - requestStart,
        });
        throw new SDKError(error, 0);
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - requestStart;

    if (cancelled) {
      this.bus.emit("stream:cancel", {
        conversationId: resolvedConversationId,
      });
      this.bus.emit("log:completed", {
        logId: logId!,
        latencyMs,
        totalTokens: usage?.totalTokens,
        status: "cancelled",
      });
      return { conversationId: resolvedConversationId, text: accumulated };
    }

    this.bus.emit("stream:finish", {
      conversationId: resolvedConversationId,
      fullText: accumulated,
      usage,
    });

    this.bus.emit("log:completed", {
      logId: logId!,
      latencyMs,
      totalTokens: usage?.totalTokens,
      status: "success",
    });

    return { conversationId: resolvedConversationId, text: accumulated };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ConversationManager
// ─────────────────────────────────────────────────────────────────────────────

export class ConversationManager {
  constructor(
    private readonly http: HttpClient,
    private readonly bus: EventBus,
  ) {}

  async list(
    options: PaginationOptions & { status?: "active" | "cancelled" } = {},
  ): Promise<PaginatedResult<Conversation>> {
    const params = new URLSearchParams();
    if (options.page) params.set("page", String(options.page));
    if (options.limit) params.set("limit", String(options.limit));
    if (options.status) params.set("status", options.status);

    const qs = params.toString();
    const res = await this.http.request<{
      ok: true;
      data: {
        conversations: Conversation[];
        pagination: PaginatedResult<never>["pagination"];
      };
    }>("GET", `/api/conversations${qs ? `?${qs}` : ""}`);

    return {
      items: res.data.conversations,
      pagination: res.data.pagination,
    };
  }

  async get(id: string): Promise<ConversationWithMessages> {
    const res = await this.http.request<{
      ok: true;
      data: ConversationWithMessages;
    }>("GET", `/api/conversations/${id}`);

    this.bus.emit("conversation:loaded", { conversation: res.data });
    return res.data;
  }

  async create(
    options: {
      title?: string;
      model?: string;
      provider?: string;
    } = {},
  ): Promise<Conversation> {
    const res = await this.http.request<{ ok: true; data: Conversation }>(
      "POST",
      "/api/conversations",
      { body: options },
    );

    this.bus.emit("conversation:created", { conversation: res.data });
    return res.data;
  }

  async update(
    id: string,
    patch: { title?: string; status?: "active" | "cancelled"; model?: string },
  ): Promise<Conversation> {
    const res = await this.http.request<{ ok: true; data: Conversation }>(
      "PATCH",
      `/api/conversations/${id}`,
      { body: patch },
    );

    this.bus.emit("conversation:updated", { conversation: res.data });
    return res.data;
  }

  async cancel(id: string): Promise<Conversation> {
    return this.update(id, { status: "cancelled" });
  }

  async delete(id: string): Promise<void> {
    await this.http.request("DELETE", `/api/conversations/${id}`);
    this.bus.emit("conversation:deleted", { id });
  }

  async messages(id: string): Promise<Message[]> {
    const res = await this.http.request<{ ok: true; data: Message[] }>(
      "GET",
      `/api/conversations/${id}/message`,
    );
    return res.data;
  }

  async addMessage(
    id: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<Message> {
    const res = await this.http.request<{ ok: true; data: Message }>(
      "POST",
      `/api/conversations/${id}/message`,
      { body: { role, content } },
    );
    return res.data;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLMLoggerSDK  (main entry point)
// ─────────────────────────────────────────────────────────────────────────────

export class LLMLoggerSDK {
  /** Raw event bus — use sdk.on() / sdk.off() shortcuts instead */
  readonly events: EventBus;

  readonly auth: AuthManager;
  readonly conversations: ConversationManager;
  readonly chat: ChatManager;

  private readonly http: HttpClient;
  private readonly config: Required<SDKConfig>;

  constructor(config: SDKConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""), // strip trailing slash
      sessionCookie: config.sessionCookie ?? "",
      defaultModel: config.defaultModel ?? "llama-3.3-70b-versatile",
      timeout: config.timeout ?? 30_000,
    };

    this.events = new EventBus();
    this.http = new HttpClient(this.config, this.events);

    this.auth = new AuthManager(this.http, this.events);
    this.conversations = new ConversationManager(this.http, this.events);
    this.chat = new ChatManager(this.config, this.events);
  }

  // ── EventBus convenience shortcuts ─────────────────────────────────────────

  on<K extends SDKEventName>(
    event: K,
    listener: (payload: SDKEvents[K]) => void,
  ): this {
    this.events.on(event, listener);
    return this;
  }

  off<K extends SDKEventName>(
    event: K,
    listener: (payload: SDKEvents[K]) => void,
  ): this {
    this.events.off(event, listener);
    return this;
  }

  once<K extends SDKEventName>(
    event: K,
    listener: (payload: SDKEvents[K]) => void,
  ): this {
    this.events.once(event, listener);
    return this;
  }

  // ── Top-level chat shortcut ─────────────────────────────────────────────────

  /**
   * Shortcut for sdk.chat.send(). Streaming chunks arrive via:
   *   sdk.on("stream:chunk", ...)
   */
  async send(options: ChatOptions): Promise<ChatResult> {
    return this.chat.send(options);
  }

  /**
   * Initialize the SDK with implicit login.
   * Fetches or creates the current session user automatically.
   * Always returns a SessionUser (implicit login creates one if needed).
   */
  async init(): Promise<SessionUser> {
    return this.auth.me();
  }

  destroy(): void {
    this.events.removeAllListeners();
  }
}

export default LLMLoggerSDK;
