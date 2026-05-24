import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { LLMLoggerSDK, SDKError } from "./index";

describe("LLMLoggerSDK Unit Tests", () => {
  let sdk: LLMLoggerSDK;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    sdk = new LLMLoggerSDK({
      baseUrl: "http://localhost:3000",
      timeout: 1000,
    });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sdk.destroy();
  });

  // Helper to mock JSON response
  function mockJsonResponse(data: any, status = 200, headers: Record<string, string> = {}) {
    globalThis.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json", ...headers },
        })
      );
    }) as any;
  }

  // Helper to mock a network failure
  function mockNetworkFailure(errorMsg: string) {
    globalThis.fetch = mock(() => {
      return Promise.reject(new Error(errorMsg));
    }) as any;
  }

  // Helper to mock an SSE stream response
  function mockStreamResponse(chunks: string[], status = 200, headers: Record<string, string> = {}) {
    globalThis.fetch = mock(() => {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      return Promise.resolve(
        new Response(stream, {
          status,
          headers: {
            "Content-Type": "text/event-stream",
            "X-Conversation-Id": "test-conv-123",
            ...headers,
          },
        })
      );
    }) as any;
  }

  describe("EventBus", () => {
    it("should register and emit events", () => {
      let triggered = false;
      let data: any = null;

      sdk.on("auth:login", (payload) => {
        triggered = true;
        data = payload.user;
      });

      const mockUser = { id: "1", email: "test@example.com", role: "user" };
      sdk.events.emit("auth:login", { user: mockUser });

      expect(triggered).toBe(true);
      expect(data).toEqual(mockUser);
    });

    it("should handle once listeners only once", () => {
      let callCount = 0;

      sdk.once("auth:logout", () => {
        callCount++;
      });

      sdk.events.emit("auth:logout", {});
      sdk.events.emit("auth:logout", {});

      expect(callCount).toBe(1);
    });

    it("should allow deregistering listeners with off", () => {
      let callCount = 0;
      const callback = () => {
        callCount++;
      };

      sdk.on("auth:logout", callback);
      sdk.events.emit("auth:logout", {});

      sdk.off("auth:logout", callback);
      sdk.events.emit("auth:logout", {});

      expect(callCount).toBe(1);
    });

    it("should clear all listeners when removeAllListeners is called", () => {
      let callCount = 0;
      sdk.on("auth:logout", () => {
        callCount++;
      });

      sdk.events.removeAllListeners();
      sdk.events.emit("auth:logout", {});

      expect(callCount).toBe(0);
    });
  });

  describe("HttpClient", () => {
    it("should emit request:start and request:end on success", async () => {
      const startEvents: any[] = [];
      const endEvents: any[] = [];

      sdk.on("request:start", (payload) => startEvents.push(payload));
      sdk.on("request:end", (payload) => endEvents.push(payload));

      mockJsonResponse({ ok: true, data: "hello" });

      const response = await sdk.auth.me();

      expect(startEvents.length).toBe(1);
      expect(startEvents[0].method).toBe("GET");
      expect(startEvents[0].path).toBe("/api/auth/me");

      expect(endEvents.length).toBe(1);
      expect(endEvents[0].status).toBe(200);
      expect(endEvents[0].method).toBe("GET");
      expect(endEvents[0].path).toBe("/api/auth/me");
      expect(response).toEqual("hello" as any);
    });

    it("should emit request:error and throw SDKError on network failures", async () => {
      const errorEvents: any[] = [];
      sdk.on("request:error", (payload) => errorEvents.push(payload));

      mockNetworkFailure("Connection failed");

      let errorThrown: any = null;
      try {
        await sdk.conversations.list();
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeInstanceOf(SDKError);
      expect(errorThrown.message).toBe("Connection failed");
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].error).toBe("Connection failed");
    });

    it("should emit ratelimit:hit on HTTP 429 status code", async () => {
      const rateLimitEvents: any[] = [];
      sdk.on("ratelimit:hit", (payload) => rateLimitEvents.push(payload));

      mockJsonResponse({ error: "Rate limit exceeded" }, 429, { "Retry-After": "45" });

      let errorThrown: any = null;
      try {
        await sdk.conversations.list();
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeInstanceOf(SDKError);
      expect(errorThrown.status).toBe(429);
      expect(rateLimitEvents.length).toBe(1);
      expect(rateLimitEvents[0].path).toBe("/api/conversations");
      expect(rateLimitEvents[0].retryAfter).toBe(45);
    });
  });

  describe("AuthManager", () => {
    const testUser = { id: "usr_123", email: "user@example.com", name: "Test User", role: "user" };

    it("should handle login successfully", async () => {
      mockJsonResponse({ ok: true, data: testUser });

      const loginEvents: any[] = [];
      sdk.on("auth:login", (payload) => loginEvents.push(payload));

      const result = await sdk.auth.login("user@example.com", "password123");

      expect(result).toEqual(testUser);
      expect(sdk.auth.currentUser).toEqual(testUser);
      expect(sdk.auth.isAuthenticated).toBe(true);
      expect(loginEvents.length).toBe(1);
      expect(loginEvents[0].user).toEqual(testUser);
    });

    it("should handle logout successfully", async () => {
      // Setup logged-in state
      mockJsonResponse({ ok: true, data: testUser });
      await sdk.auth.login("user@example.com", "password123");

      mockJsonResponse({ ok: true });

      const logoutEvents: any[] = [];
      sdk.on("auth:logout", (payload) => logoutEvents.push(payload));

      await sdk.auth.logout();

      expect(sdk.auth.currentUser).toBeNull();
      expect(sdk.auth.isAuthenticated).toBe(false);
      expect(logoutEvents.length).toBe(1);
    });

    it("should handle register successfully", async () => {
      mockJsonResponse({ ok: true, data: testUser });

      const registerEvents: any[] = [];
      sdk.on("auth:register", (payload) => registerEvents.push(payload));

      const result = await sdk.auth.register("user@example.com", "password123", "Test User");

      expect(result).toEqual(testUser);
      expect(sdk.auth.currentUser).toEqual(testUser);
      expect(registerEvents.length).toBe(1);
      expect(registerEvents[0].user).toEqual(testUser);
    });

    it("should emit auth:error when login fails", async () => {
      mockJsonResponse({ error: "Invalid credentials" }, 401);

      const errorEvents: any[] = [];
      sdk.on("auth:error", (payload) => errorEvents.push(payload));

      let errorThrown: any = null;
      try {
        await sdk.auth.login("user@example.com", "wrong-password");
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeInstanceOf(SDKError);
      expect(errorThrown.status).toBe(401);
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].error).toBe("Invalid credentials");
      expect(errorEvents[0].context).toBe("login");
    });
  });

  describe("ConversationManager", () => {
    const mockConv = {
      id: "conv_123",
      title: "Test Conversation",
      model: "llama-3.3-70b-versatile",
      provider: "groq",
      status: "active",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
    };

    it("should list conversations with pagination parameters", async () => {
      const mockResult = {
        conversations: [mockConv],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      mockJsonResponse({ ok: true, data: mockResult });

      const result = await sdk.conversations.list({ page: 1, limit: 10 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe("conv_123");
      expect(result.pagination.total).toBe(1);
    });

    it("should fetch a specific conversation and emit conversation:loaded", async () => {
      const mockConvDetail = {
        ...mockConv,
        messages: [{ id: "msg_1", conversationId: "conv_123", role: "user", content: "hello", createdAt: "2026" }],
        logCount: 1,
      };
      mockJsonResponse({ ok: true, data: mockConvDetail });

      const loadedEvents: any[] = [];
      sdk.on("conversation:loaded", (payload) => loadedEvents.push(payload));

      const result = await sdk.conversations.get("conv_123");

      expect(result.id).toBe("conv_123");
      expect(result.messages.length).toBe(1);
      expect(loadedEvents.length).toBe(1);
      expect(loadedEvents[0].conversation).toEqual(mockConvDetail);
    });

    it("should create a conversation and emit conversation:created", async () => {
      mockJsonResponse({ ok: true, data: mockConv });

      const createdEvents: any[] = [];
      sdk.on("conversation:created", (payload) => createdEvents.push(payload));

      const result = await sdk.conversations.create({ title: "Test Conversation" });

      expect(result.id).toBe("conv_123");
      expect(createdEvents.length).toBe(1);
      expect(createdEvents[0].conversation).toEqual(mockConv);
    });

    it("should update a conversation and emit conversation:updated", async () => {
      const updatedConv = { ...mockConv, title: "New Title" };
      mockJsonResponse({ ok: true, data: updatedConv });

      const updatedEvents: any[] = [];
      sdk.on("conversation:updated", (payload) => updatedEvents.push(payload));

      const result = await sdk.conversations.update("conv_123", { title: "New Title" });

      expect(result.title).toBe("New Title");
      expect(updatedEvents.length).toBe(1);
      expect(updatedEvents[0].conversation).toEqual(updatedConv);
    });

    it("should delete a conversation and emit conversation:deleted", async () => {
      mockJsonResponse({ ok: true });

      const deletedEvents: any[] = [];
      sdk.on("conversation:deleted", (payload) => deletedEvents.push(payload));

      await sdk.conversations.delete("conv_123");

      expect(deletedEvents.length).toBe(1);
      expect(deletedEvents[0].id).toBe("conv_123");
    });
  });

  describe("ChatManager", () => {
    it("should handle full successful SSE streaming flow", async () => {
      const sseChunks = [
        '0:"Hello"\n',
        '0:" there"\n',
        '0:" user!"\n',
        'd:{"finishReason":"stop","usage":{"promptTokens":8,"completionTokens":4,"totalTokens":12}}\n',
      ];
      mockStreamResponse(sseChunks);

      const startEvents: any[] = [];
      const chunkEvents: any[] = [];
      const finishEvents: any[] = [];
      const logCreatedEvents: any[] = [];
      const logCompletedEvents: any[] = [];

      sdk.on("stream:start", (payload) => startEvents.push(payload));
      sdk.on("stream:chunk", (payload) => chunkEvents.push(payload));
      sdk.on("stream:finish", (payload) => finishEvents.push(payload));
      sdk.on("log:created", (payload) => logCreatedEvents.push(payload));
      sdk.on("log:completed", (payload) => logCompletedEvents.push(payload));

      const result = await sdk.send({
        messages: [{ role: "user", content: "Hi" }],
        model: "llama-3.3-70b-versatile",
      });

      expect(result.text).toBe("Hello there user!");
      expect(result.conversationId).toBe("test-conv-123");

      expect(startEvents.length).toBe(1);
      expect(startEvents[0].conversationId).toBe("test-conv-123");
      expect(startEvents[0].model).toBe("llama-3.3-70b-versatile");

      expect(chunkEvents.length).toBe(3);
      expect(chunkEvents[0].chunk).toBe("Hello");
      expect(chunkEvents[1].chunk).toBe(" there");
      expect(chunkEvents[2].chunk).toBe(" user!");

      expect(finishEvents.length).toBe(1);
      expect(finishEvents[0].fullText).toBe("Hello there user!");
      expect(finishEvents[0].usage).toEqual({
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      });

      expect(logCreatedEvents.length).toBe(1);
      expect(logCreatedEvents[0].conversationId).toBe("test-conv-123");

      expect(logCompletedEvents.length).toBe(1);
      expect(logCompletedEvents[0].status).toBe("success");
      expect(logCompletedEvents[0].totalTokens).toBe(12);
    });

    it("should handle streaming failure and emit appropriate events", async () => {
      mockNetworkFailure("Stream connection lost");

      const errorEvents: any[] = [];
      const logFailedEvents: any[] = [];

      sdk.on("stream:error", (payload) => errorEvents.push(payload));
      sdk.on("log:failed", (payload) => logFailedEvents.push(payload));

      let errorThrown: any = null;
      try {
        await sdk.send({
          messages: [{ role: "user", content: "Hi" }],
        });
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeInstanceOf(SDKError);
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].error).toBe("Stream connection lost");

      // Note: log:failed is not emitted on connection failure because logId is not yet registered (it's null).
      expect(logFailedEvents.length).toBe(0);
    });

    it("should emit stream:cancel on user abort", async () => {
      const controller = new AbortController();

      const sseChunks = [
        '0:"Hello"\n',
        '0:" there"\n',
      ];
      mockStreamResponse(sseChunks);

      const cancelEvents: any[] = [];
      const logCompletedEvents: any[] = [];

      sdk.on("stream:cancel", (payload) => cancelEvents.push(payload));
      sdk.on("log:completed", (payload) => logCompletedEvents.push(payload));

      // Trigger abort as soon as the first chunk is received
      sdk.on("stream:chunk", () => {
        controller.abort();
      });

      const result = await sdk.send({
        messages: [{ role: "user", content: "Hi" }],
        signal: controller.signal,
      });

      expect(cancelEvents.length).toBe(1);
      expect(cancelEvents[0].conversationId).toBe("test-conv-123");

      expect(logCompletedEvents.length).toBe(1);
      expect(logCompletedEvents[0].status).toBe("cancelled");
    });
  });
});
