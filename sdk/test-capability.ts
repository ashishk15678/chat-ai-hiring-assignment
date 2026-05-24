/**
 * sdk/test-capability.ts
 *
 * Standalone script to test and demonstrate the LLM Logger SDK capabilities.
 * It connects to the Next.js server, runs through a full implicit user lifecycle,
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
    console.log(
      "[WARNING] No GROQ_API_KEY environment variable found. Streaming chat might fail if not set server-side.",
    );
  }

  // Initialize SDK
  const sdk = new LLMLoggerSDK({
    baseUrl,
    timeout: 15000,
  });

  // 1. Setup Event Listeners
  console.log("[SETUP] Registering event listeners on the event bus");

  sdk.on("request:start", (data) => {
    console.log(
      `[EVENT: request:start] ${data.method} ${data.path} (ID: ${data.requestId})`,
    );
  });

  sdk.on("request:end", (data) => {
    console.log(
      `[EVENT: request:end] ${data.method} ${data.path} finished with status ${data.status} in ${data.latencyMs}ms`,
    );
  });

  sdk.on("request:error", (data) => {
    console.log(
      `[EVENT: request:error] ${data.method} ${data.path} failed: ${data.error}`,
    );
  });

  sdk.on("auth:login", (data) => {
    console.log(
      `[EVENT: auth:login] User logged in (implicit): ${data.user.email} (ID: ${data.user.id})`,
    );
  });

  sdk.on("auth:logout", () => {
    console.log("[EVENT: auth:logout] User logged out");
  });

  sdk.on("conversation:created", (data) => {
    console.log(
      `[EVENT: conversation:created] Created: "${data.conversation.title}" (ID: ${data.conversation.id})`,
    );
  });

  sdk.on("conversation:loaded", (data) => {
    console.log(
      `[EVENT: conversation:loaded] Loaded: "${data.conversation.title}" with ${data.conversation.messages?.length || 0} messages`,
    );
  });

  sdk.on("stream:start", (data) => {
    console.log(
      `[EVENT: stream:start] Chat stream started. Model: ${data.model}, Conv ID: ${data.conversationId}`,
    );
  });

  sdk.on("stream:chunk", (data) => {
    // Print a dot for each chunk to show progress
    process.stdout.write(".");
  });

  sdk.on("stream:finish", (data) => {
    console.log("\n[EVENT: stream:finish] Stream complete.");
    console.log(
      `[EVENT: stream:finish] Total text length: ${data.fullText.length} characters`,
    );
    if (data.usage) {
      console.log(
        `[EVENT: stream:finish] Tokens used: Prompt=${data.usage.promptTokens}, Completion=${data.usage.completionTokens}, Total=${data.usage.totalTokens}`,
      );
    }
  });

  sdk.on("log:created", (data) => {
    console.log(
      `[EVENT: log:created] Inference log registered: ${data.logId} for model ${data.model}`,
    );
  });

  sdk.on("log:completed", (data) => {
    console.log(
      `[EVENT: log:completed] Inference log finalized: ${data.logId}. Status: ${data.status}, Latency: ${data.latencyMs}ms`,
    );
  });

  sdk.on("log:failed", (data) => {
    console.log(
      `[EVENT: log:failed] Inference log failed: ${data.logId}. Error: ${data.error}`,
    );
  });

  try {
    console.log("\n--- STARTING CAPABILITY WORKFLOW ---");

    // Step 1: Implicit Login (automatic)
    console.log(
      "\n[STEP 1] Implicit login - fetching or creating anonymous user",
    );
    const implicitUser = await sdk.init();
    console.log(
      `[SUCCESS] User session established. User ID: ${implicitUser.id}`,
    );
    console.log(`         Email: ${implicitUser.email}`);

    // Step 2: Create conversation
    console.log("\n[STEP 2] Creating new conversation");
    const conversation = await sdk.conversations.create({
      title: "SDK Capability Demo Conversation",
      model: "llama-3.3-70b-versatile",
      provider: "groq",
    });
    console.log(`[SUCCESS] Conversation created. ID: ${conversation.id}`);

    // Step 3: Stream Chat
    console.log("\n[STEP 3] Sending chat message and streaming response");
    const chatResult = await sdk.send({
      conversationId: conversation.id,
      model: "llama-3.3-70b-versatile",
      apiKey: groqApiKey,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Keep your answer under 15 words and do not use any emojis at all.",
        },
        {
          role: "user",
          content: "What is the capital of France?",
        },
      ],
    });

    console.log(`\n[SUCCESS] Chat result text: "${chatResult.text}"`);

    // Step 4: Fetch messages to verify database log persistence
    console.log("\n[STEP 4] Retrieving conversation history from DB");
    const messages = await sdk.conversations.messages(conversation.id);
    console.log(`[SUCCESS] Retrieved ${messages.length} messages:`);
    for (const msg of messages) {
      console.log(`  - [${msg.role.toUpperCase()}]: ${msg.content}`);
    }

    // Step 5: List conversations
    console.log("\n[STEP 5] Listing all conversations for this user");
    const listResult = await sdk.conversations.list({ page: 1, limit: 5 });
    console.log(
      `[SUCCESS] Found ${listResult.items.length} conversations. Total for user: ${listResult.pagination.total}`,
    );

    // Step 6: Create another conversation to show multi-conversation support
    console.log("\n[STEP 6] Creating a second conversation");
    const conversation2 = await sdk.conversations.create({
      title: "Second Demo Conversation",
      model: "llama-3.3-70b-versatile",
      provider: "groq",
    });
    console.log(
      `[SUCCESS] Second conversation created. ID: ${conversation2.id}`,
    );

    // Step 7: Send chat to second conversation
    console.log("\n[STEP 7] Sending chat to second conversation");
    const chatResult2 = await sdk.send({
      conversationId: conversation2.id,
      model: "llama-3.3-70b-versatile",
      apiKey: groqApiKey,
      messages: [
        {
          role: "user",
          content: "Tell me a fun fact about programming in under 20 words.",
        },
      ],
    });

    console.log(`\n[SUCCESS] Chat result text: "${chatResult2.text}"`);

    // Step 8: Verify separate metrics per user
    console.log("\n[STEP 8] Verifying metrics isolation per user");
    const listFinal = await sdk.conversations.list({ page: 1, limit: 10 });
    console.log(
      `[SUCCESS] User has ${listFinal.pagination.total} conversations with ${listFinal.items.length} shown on this page`,
    );
    console.log(
      "         Each conversation has separate metrics tracked by user ID",
    );
  } catch (error) {
    console.error("\n[ERROR] Workflow failed:");
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      if ("status" in error) {
        console.error(
          `HTTP Status: ${(error as Record<string, unknown>).status}`,
        );
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
