"use client";

import React, { useRef, useEffect } from "react";
import { Send, Square, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  isCancelled: boolean;
  onStop: () => void;
}

export function MessageInput({
  input = "",
  handleInputChange,
  handleSubmit,
  isLoading,
  isCancelled,
  onStop,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea heights based on input length
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to compute scrollHeight
    textarea.style.height = "auto";
    const computedHeight = textarea.scrollHeight;
    // Cap height at 200px
    textarea.style.height = `${Math.min(computedHeight, 200)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) {
        onStop();
      } else if ((input || "").trim() && !isCancelled) {
        const form = e.currentTarget.form;
        if (form) {
          const event = new Event("submit", {
            cancelable: true,
            bubbles: true,
          });
          form.dispatchEvent(event);
        }
      }
    }
  };

  return (
    <div className="border-t border-border bg-background p-4 shrink-0">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Keyboard helpers */}
        <div className="flex items-center justify-end text-xs text-muted-foreground px-1">
          <div className="text-right">
            <span className="text-[10px] opacity-70">
              {isLoading
                ? "Enter to stop generation"
                : "Enter to send · Shift+Enter for newline"}
            </span>
          </div>
        </div>

        {/* Input Form container */}
        {isCancelled ? (
          <div className="flex items-center justify-center p-4 bg-amber-950/20 border border-amber-900/30 rounded-xl text-amber-300 text-sm gap-2">
            <Ban size={16} />
            <span>
              This conversation is cancelled. Start a new chat to continue.
            </span>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="relative flex items-end gap-2 border border-border bg-muted/30 focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/50 rounded-xl overflow-hidden px-3 py-2.5 transition-all duration-200"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message LLM Logger..."
              className="flex-1 bg-transparent resize-none border-0 outline-none focus:ring-0 text-sm leading-relaxed max-h-[200px] min-h-[20px] text-foreground placeholder:text-muted-foreground py-0.5"
            />

            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="p-2 rounded-lg transition-all duration-200 shrink-0 bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-md"
                title="Stop generating"
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!(input || "").trim()}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 shrink-0",
                  (input || "").trim()
                    ? "bg-primary text-primary-foreground hover:opacity-90 cursor-pointer shadow-md shadow-primary/20"
                    : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed",
                )}
                title="Send message"
              >
                <Send size={15} />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
