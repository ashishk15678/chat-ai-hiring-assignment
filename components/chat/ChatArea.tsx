"use client";

/**
 * components/chat/ChatArea.tsx
 * ──────────────────────────────────────────────
 * The main chat interface. Uses Vercel AI SDK's useChat hook for
 * streaming. Supports:
 *   - New conversations (no conversationId prop)
 *   - Resuming conversations (conversationId + initialMessages)
 *   - Stop/cancel streaming
 *   - Model selection per conversation
 *   - Custom API key injection
 */

import { useChat } from "ai/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageInput } from "./MessageInput";
import { useApiKey } from "@/components/providers";
import { GROQ_MODELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Bot, Zap } from "lucide-react";
import type { Message } from "ai";
import { MessageItem } from "./MessageItem";

interface ChatAreaProps {
  conversationId?: string;
  initialMessages?: Message[];
  conversationStatus?: "active" | "cancelled";
  model?: string;
}

export function ChatArea({
  conversationId: initialConvId,
  initialMessages,
  conversationStatus = "active",
  model: initialModel = "llama-3.3-70b-versatile",
}: ChatAreaProps) {
  const router = useRouter();
  const { apiKey } = useApiKey();

  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConvId,
  );
  const conversationIdRef = useRef<string | undefined>(initialConvId);

  const [selectedModel, setSelectedModel] = useState(initialModel);
  const isCancelled = conversationStatus === "cancelled";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNewChat = !conversationId;

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    error,
  } = useChat({
    api: "/api/chat",
    initialMessages,
    body: {
      conversationId,
      model: selectedModel,
      ...(apiKey && { apiKey }),
    },
    onResponse: (response) => {
      // Capture conversation ID from first response header
      const newId = response.headers.get("X-Conversation-Id");
      if (newId && !conversationIdRef.current) {
        conversationIdRef.current = newId;
        setConversationId(newId);
      }
    },
    onFinish: () => {
      if (conversationIdRef.current) {
        router.replace(`/chat/${conversationIdRef.current}`, { scroll: false });
        router.refresh();
      }
    },
    onError: (err) => {
      console.error("[ChatArea] Stream error:", err);
      if (conversationIdRef.current) {
        router.replace(`/chat/${conversationIdRef.current}`, { scroll: false });
        router.refresh();
      }
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleStop = useCallback(() => {
    stop();
    if (conversationIdRef.current) {
      router.replace(`/chat/${conversationIdRef.current}`, { scroll: false });
      router.refresh();
    }
  }, [stop, router]);

  const isCancelledOrDone = isCancelled;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isNewChat ? (
            <span className="text-sm text-muted-foreground">
              New conversation
            </span>
          ) : (
            <span className="text-sm text-muted-foreground font-mono text-xs">
              {conversationId?.slice(0, 12)}…
            </span>
          )}
          {isCancelled && (
            <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full border border-amber-800/50">
              Cancelled
            </span>
          )}
        </div>

        {/* Model selector */}
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-primary" />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!!conversationId} // lock model after first message
            className={cn(
              "text-xs bg-transparent border border-border rounded-lg px-2 py-1.5 text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer",
              "hover:text-foreground transition-colors",
              conversationId && "opacity-60 cursor-not-allowed",
            )}
          >
            {GROQ_MODELS.map((m) => (
              <option key={m.id} value={m.id} className="bg-background">
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState model={selectedModel} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
            {messages.map((msg, i) => (
              <MessageItem
                key={msg.id}
                message={msg}
                isStreaming={
                  isLoading &&
                  i === messages.length - 1 &&
                  msg.role === "assistant"
                }
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <TypingIndicator />
              )}
            {error && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3 mt-2">
                ⚠ {error.message || "Something went wrong. Please try again."}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <MessageInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        isCancelled={isCancelledOrDone}
        onStop={handleStop}
      />
    </div>
  );
}

function EmptyState({ model }: { model: string }) {
  const modelLabel = GROQ_MODELS.find((m) => m.id === model)?.label ?? model;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 pb-24">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20">
        <Bot size={26} className="text-primary" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold mb-1.5">Start a conversation</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Ask anything. Powered by{" "}
          <span className="text-foreground font-medium">{modelLabel}</span> via
          GROQ.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {EXAMPLE_PROMPTS.map((p) => (
          <ExamplePrompt key={p} prompt={p} />
        ))}
      </div>
    </div>
  );
}

function ExamplePrompt({ prompt }: { prompt: string }) {
  return (
    <button className="text-left text-xs text-muted-foreground bg-muted/40 hover:bg-muted/70 border border-border/50 rounded-lg px-3 py-2 transition-colors leading-relaxed">
      {prompt}
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-primary" />
      </div>
      <div className="flex items-center gap-1 pt-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot"
          />
        ))}
      </div>
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "Explain how GROQ's LPU works",
  "Write a Python quicksort",
  "What is RAG in AI?",
  "Pros of event-driven systems",
];
