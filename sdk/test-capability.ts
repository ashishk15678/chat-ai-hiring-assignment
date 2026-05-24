/**
 * sdk/test-capability.ts
 *
 * Standalone script to test and demonstrate the LLM Logger SDK capabilities.
 * It connects to the Next.js server, runs through a full user lifecycle,
 * and handles real-time SSE event streaming.
 *
 * Run with:
 *   export GROQ_API_KEY="gsk_..."
 *   bun run sdk/test-capability.ts
 *   or
 *   npx tsx sdk/test-capability.ts
 */

import { LLMLoggerSDK } from "./index";

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const groqApiKey = process.env.GROQ_API_KEY;

  console.log("[SETUP] Initializing LLM Logger SDK");
  console.log(`[SETUP] Server URL: ${baseUrl}`);
  if (groqApiKey) {
    console.log("[SETUP] Groq API Key detected in environment");
  } else {
    console.log("[WARNING] No GROQ_API_KEY environment variable found. Streaming chat might fail if not set server-side.");
  }

  // Initialize SDK
  const sdk = new LLMLoggerSDK({
    baseUrl,
    timeout: 15000,
  });

  // 1. Setup Event Listeners
  console.log("[SETUP] Registering event listeners on the event bus");

  sdk.on("request:start", (data) => {
    console.log(`[EVENT: request:start] ${data.method} ${data.path} (ID: ${data.requestId})`);
  });

  sdk.on("request:end", (data) => {
    console.log(`[EVENT: request:end] ${data.method} ${data.path} finished with status ${data.status} in ${data.latencyMs}ms`);
  });

  sdk.on("request:error", (data) => {
    console.log(`[EVENT: request:error] ${data.method} ${data.path} failed: ${data.error}`);
  });

  sdk.on("auth:login", (data) => {
    console.log(`[EVENT: auth:login] User logged in: ${data.user.email} (ID: ${data.user.id})`);
  });

  sdk.on("auth:register", (data) => {
    console.log(`[EVENT: auth:register] User registered: ${data.user.email}`);
  });

  sdk.on("auth:logout", () => {
    console.log("[EVENT: auth:logout] User logged out");
  });

  sdk.on("conversation:created", (data) => {
    console.log(`[EVENT: conversation:created] Created: "${data.conversation.title}" (ID: ${data.conversation.id})`);
  });

  sdk.on("conversation:loaded", (data) => {
    console.log(`[EVENT: conversation:loaded] Loaded: "${data.conversation.title}" with ${data.conversation.messages?.length || 0} messages`);
  });

  sdk.on("stream:start", (data) => {
    console.log(`[EVENT: stream:start] Chat stream started. Model: ${data.model}, Conv ID: ${data.conversationId}`);
  });

  sdk.on("stream:chunk", (data) => {
    // Print a dot for each chunk to show progress
    process.stdout.write(".");
  });

  sdk.on("stream:finish", (data) => {
    console.log("\n[EVENT: stream:finish] Stream complete.");
    console.log(`[EVENT: stream:finish] Total text length: ${data.fullText.length} characters`);
    if (data.usage) {
      console.log(`[EVENT: stream:finish] Tokens used: Prompt=${data.usage.promptTokens}, Completion=${data.usage.completionTokens}, Total=${data.usage.totalTokens}`);
    }
  });

  sdk.on("log:created", (data) => {
    console.log(`[EVENT: log:created] Inference log registered: ${data.logId} for model ${data.model}`);
  });

  sdk.on("log:completed", (data) => {
    console.log(`[EVENT: log:completed] Inference log finalized: ${data.logId}. Status: ${data.status}, Latency: ${data.latencyMs}ms`);
  });

  sdk.on("log:failed", (data) => {
    console.log(`[EVENT: log:failed] Inference log failed: ${data.logId}. Error: ${data.error}`);
  });

  try {
    console.log("\n--- STARTING CAPABILITY WORKFLOW ---");

    // Generate random email to avoid collision on multiple runs
    const testEmail = `tester-${Math.floor(Math.random() * 1000000)}@example.com`;
    const testPassword = "securePassword123";
    const testName = "SDK Test Agent";

    // Step 1: Register
    console.log(`\n[STEP 1] Registering user: ${testEmail}`);
    const registeredUser = await sdk.auth.register(testEmail, testPassword, testName);
    console.log(`[SUCCESS] Registration complete. User ID: ${registeredUser.id}`);

    // Step 2: Check current user session hydration
    console.log("\n[STEP 2] Verifying session hydration (me)");
    const activeUser = await sdk.init();
    if (activeUser) {
      console.log(`[SUCCESS] Session is active for: ${activeUser.email}`);
    } else {
      throw new Error("Session hydration failed. No user found.");
    }

    // Step 3: Create conversation
    console.log("\n[STEP 3] Creating new conversation");
    const conversation = await sdk.conversations.create({
      title: "SDK Capability Demo Conversation",
      model: "llama-3.3-70b-versatile",
      provider: "groq",
    });
    console.log(`[SUCCESS] Conversation created. ID: ${conversation.id}`);

    // Step 4: Stream Chat
    console.log("\n[STEP 4] Sending chat message and streaming response");
    const chatResult = await sdk.send({
      conversationId: conversation.id,
      model: "llama-3.3-70b-versatile",
      apiKey: groqApiKey,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Keep your answer under 15 words and do not use any emojis at all.",
        },
        {
          role: "user",
          content: "What is the capital of France?",
        },
      ],
    });

    console.log(`\n[SUCCESS] Chat result text: "${chatResult.text}"`);

    // Step 5: Fetch messages to verify database log persistence
    console.log("\n[STEP 5] Retrieving conversation history from DB");
    const messages = await sdk.conversations.messages(conversation.id);
    console.log(`[SUCCESS] Retrieved ${messages.length} messages:`);
    for (const msg of messages) {
      console.log(`  - [${msg.role.toUpperCase()}]: ${msg.content}`);
    }

    // Step 6: List conversations
    console.log("\n[STEP 6] Listing all active conversations");
    const listResult = await sdk.conversations.list({ page: 1, limit: 5 });
    console.log(`[SUCCESS] Found ${listResult.items.length} conversations. Total in DB: ${listResult.pagination.total}`);

    // Step 7: Logout
    console.log("\n[STEP 7] Logging out of session");
    await sdk.auth.logout();
    console.log("[SUCCESS] Logout complete");

    console.log("\n--- ALL SDK CAPABILITY TESTS PASSED SUCCESSFULLY ---");
  } catch (error) {
    console.error("\n[ERROR] Workflow failed:");
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      if ("status" in error) {
        console.error(`HTTP Status: ${(error as any).status}`);
      }
    } else {
      console.error(String(error));
    }
    process.exit(1);
  } finally {
    sdk.destroy();
  }
}

main().catch((err) => {
  console.error("Unhandled top-level error:", err);
  process.exit(1);
});
