"use client";

import React, { useState } from "react";
import type { Message } from "ai";
import { Bot, User, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageItem({ message, isStreaming = false }: MessageItemProps) {
  const isAssistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

  return (
    <div
      className={cn(
        "group flex gap-4 py-6 border-b border-border/40 last:border-0 hover:bg-muted/10 px-4 rounded-xl transition-all duration-200 animate-slide-up",
        !isAssistant && "flex-row-reverse"
      )}
    >
      {/* Avatar Container */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border select-none shadow-sm",
          isAssistant
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-muted/80 border-border text-muted-foreground"
        )}
      >
        {isAssistant ? <Bot size={15} /> : <User size={15} />}
      </div>

      {/* Message content container */}
      <div className={cn("flex-1 space-y-1.5 overflow-hidden", !isAssistant && "text-right max-w-[80%]")}>
        <div className="flex items-center gap-2 mb-1 justify-between">
          <span className="text-xs font-semibold text-foreground/80 tracking-wide select-none">
            {isAssistant ? "LLM Assistant" : "You"}
          </span>
          
          {/* Actions toolbar (Copy) */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1">
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
              title="Copy message"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Message body with Markdown format */}
        <div className={cn(
          "text-left select-text",
          !isAssistant && "bg-muted/40 border border-border/50 px-4 py-3 rounded-2xl rounded-tr-none inline-block text-foreground shadow-sm"
        )}>
          {isAssistant ? (
            renderMessageContent(message.content, isStreaming)
          ) : (
            <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function renderMessageContent(content: string, isStreaming: boolean) {
  if (!content) {
    return (
      <div className="flex items-center gap-1.5 py-2">
        <span className="streaming-cursor" />
      </div>
    );
  }

  // Regex to split code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      const language = match ? match[1] : "";
      const code = match ? match[2] : part.slice(3, -3);
      return (
        <div key={index} className="my-3 rounded-xl border border-border overflow-hidden bg-muted/20 font-mono text-sm leading-relaxed shadow-sm">
          {language && (
            <div className="flex items-center justify-between px-4 py-2 bg-muted/40 text-xs text-muted-foreground border-b border-border select-none uppercase font-semibold tracking-wider">
              <span>{language}</span>
            </div>
          )}
          <pre className="p-4 overflow-x-auto text-xs md:text-sm text-foreground bg-[hsl(0,0%,6%)]">
            <code>{code}</code>
          </pre>
        </div>
      );
    } else {
      // Inline markdown
      return (
        <div key={index} className="message-content leading-relaxed">
          {part.split("\n").map((line, lineIdx) => {
            const trimmedLine = line.trim();
            
            // Check for list items
            if (trimmedLine.startsWith("* ") || trimmedLine.startsWith("- ")) {
              const item = line.substring(line.indexOf(trimmedLine.charAt(0)) + 2);
              return (
                <ul key={lineIdx} className="list-disc pl-5 my-1 space-y-0.5 text-sm md:text-base text-foreground/90">
                  <li className="leading-relaxed">{renderInlineStyles(item)}</li>
                </ul>
              );
            }
            
            // Check for ordered lists
            const numMatch = trimmedLine.match(/^(\d+)\.\s(.*)/);
            if (numMatch) {
              const item = numMatch[2];
              return (
                <ol key={lineIdx} className="list-decimal pl-5 my-1 space-y-0.5 text-sm md:text-base text-foreground/90">
                  <li className="leading-relaxed">{renderInlineStyles(item)}</li>
                </ol>
              );
            }

            // Normal paragraph
            return (
              <p key={lineIdx} className="mb-3 text-sm md:text-base text-foreground/95 leading-relaxed last:mb-0">
                {renderInlineStyles(line)}
                {isStreaming && index === parts.length - 1 && lineIdx === part.split("\n").length - 1 && (
                  <span className="streaming-cursor ml-0.5" />
                )}
              </p>
            );
          })}
        </div>
      );
    }
  });
}

function renderInlineStyles(text: string) {
  if (!text) return "";
  
  // Split by bold (**bold**) and inline code (`code`)
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="bg-muted px-1.5 py-0.5 rounded text-xs md:text-sm font-mono border border-border/40 text-primary-foreground font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
