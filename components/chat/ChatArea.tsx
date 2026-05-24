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
import { ALL_MODELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => !conversationId && setIsDropdownOpen(!isDropdownOpen)}
            disabled={!!conversationId}
            className={cn(
              "flex items-center gap-2 text-xs bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-muted-foreground select-none",
              "focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer hover:bg-muted/80",
              "hover:text-foreground transition-all duration-200",
              conversationId && "opacity-60 cursor-not-allowed hover:bg-muted/40"
            )}
          >
            {getProviderLogo(ALL_MODELS.find(m => m.id === selectedModel)?.provider ?? "groq")}
            <span className="font-medium text-foreground">
              {ALL_MODELS.find(m => m.id === selectedModel)?.label ?? selectedModel}
            </span>
            {!conversationId && (
              <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100">
              <div className="px-2.5 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Select Inference Model
              </div>
              <div className="max-h-60 overflow-y-auto">
                {ALL_MODELS.map((m) => {
                  const isSelected = m.id === selectedModel;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setIsDropdownOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between w-full text-left px-3 py-2.5 text-xs transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        isSelected ? "bg-accent/40 font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {getProviderLogo(m.provider)}
                        <span>{m.label}</span>
                      </div>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

function OpenAIResetIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-emerald-500 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.3 10.7a5.4 5.4 0 0 0-2-3.8 5.6 5.6 0 0 0-5.7-.9 5.5 5.5 0 0 0-4.6-2.5A5.6 5.6 0 0 0 3.7 8a5.5 5.5 0 0 0-.8 5 5.6 5.6 0 0 0 2 3.8 5.6 5.6 0 0 0 5.7.9 5.5 5.5 0 0 0 4.6 2.5 5.6 5.6 0 0 0 5.3-4.6 5.5 5.5 0 0 0 .8-5zm-11.4 8a3.7 3.7 0 0 1-1.8-.5l3.2-1.9a1 1 0 0 0 .5-.8V11l2.5 1.4v2.9a3.7 3.7 0 0 1-4.4 3.4zm-6.2-4.7a3.7 3.7 0 0 1 0-1.8l3.2 1.8a1 1 0 0 0 .9 0L10.3 12.8v-2.8L7.8 8.6a3.7 3.7 0 0 1-4.1 6.8zm.8-6.9a3.7 3.7 0 0 1 1.8-1.3l1.3 3.3a1 1 0 0 0 .4.5l2.5-1.4v-2.9a3.7 3.7 0 0 1-6 1.8zm11.3 1.8L13.7 11a1 1 0 0 0-.5-.8L10.7 8.8v-2.8a3.7 3.7 0 0 1 6 1.8zm2.4 4.7a3.7 3.7 0 0 1-1.8 1.3l-1.3-3.3a1 1 0 0 0-.4-.5L13.7 11.2v-2.8a3.7 3.7 0 0 1 4.4 3.4zm-7.6 1.4v-2.8l-2.5-1.4v-2.9a3.7 3.7 0 0 1 4.3-3.4 3.7 3.7 0 0 1 1.8.5l-3.2 1.9a1 1 0 0 0-.4.8z"/>
    </svg>
  );
}

function AnthropicResetIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-amber-600 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.82 20.38h-2.51L15.1 16.7h-6.2l-1.21 3.68H5.18L10.72 4.2h2.56zm-4.32-6.08L12 6.87l-2.5 7.43z"/>
    </svg>
  );
}

function GroqResetIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-orange-500 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 10h-6.5l2-8h-3l-5 12h5.5l-2 8z"/>
    </svg>
  );
}

function getProviderLogo(provider: "groq" | "openai" | "anthropic") {
  if (provider === "openai") return <OpenAIResetIcon />;
  if (provider === "anthropic") return <AnthropicResetIcon />;
  return <GroqResetIcon />;
}

function EmptyState({ model }: { model: string }) {
  const modelLabel = ALL_MODELS.find((m) => m.id === model)?.label ?? model;
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
