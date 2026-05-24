"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  Plus,
  LayoutDashboard,
  Key,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn, relativeTime, truncate } from "@/lib/utils";
import { useApiKey } from "@/components/providers";

interface Conversation {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  messageCount: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { apiKey, setApiKey, hasCustomKey, clearApiKey } = useApiKey();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [draftKey, setDraftKey] = useState(apiKey);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations?limit=50");
      const json = await res.json();
      if (json.ok) setConversations(json.data.conversations);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConversations();
  }, [fetchConversations, pathname]);


  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    fetchConversations();
    if (pathname === `/chat/${id}`) router.push("/chat");
  };

  const saveApiKey = () => {
    setApiKey(draftKey.trim());
    setShowApiModal(false);
  };

  if (collapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-4 gap-3 border-r border-sidebar-border bg-sidebar shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>
        <Link
          href="/chat"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="New chat"
        >
          <Plus size={16} />
        </Link>
        <Link
          href="/dashboard"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Dashboard"
        >
          <LayoutDashboard size={16} />
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="w-64 flex flex-col border-r border-sidebar-border bg-sidebar shrink-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
          <span className="font-semibold text-sm tracking-tight text-foreground">
            LLM Logger
          </span>
          <div className="flex items-center gap-1">
            <Link
              href="/chat"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="New chat"
            >
              <Plus size={15} />
            </Link>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        </div>

        {/* Nav links */}
        <div className="px-2 py-2 border-b border-sidebar-border">
          <NavItem
            href="/chat"
            icon={<Plus size={14} />}
            label="New Chat"
            active={pathname === "/chat"}
          />
          <NavItem
            href="/dashboard"
            icon={<LayoutDashboard size={14} />}
            label="Dashboard"
            active={pathname === "/dashboard"}
          />
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <p className="text-xs text-muted-foreground px-2 mb-2 uppercase tracking-wider font-medium">
            Conversations
          </p>
          {loading ? (
            <div className="space-y-1.5 px-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 rounded-md bg-muted/50 animate-pulse"
                />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">
              No conversations yet
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conv) => {
                const isActive = pathname === `/chat/${conv.id}`;
                const isCancelled = conv.status === "cancelled";
                return (
                  <li key={conv.id} className="group relative">
                    <Link
                      href={`/chat/${conv.id}`}
                      className={cn(
                        "flex items-start gap-2 px-2.5 py-2 rounded-md text-sm transition-colors w-full",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        isCancelled && "opacity-50",
                      )}
                    >
                      <MessageSquare size={13} className="mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate leading-tight">
                          {truncate(conv.title, 38)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {relativeTime(conv.updatedAt)} · {conv.messageCount}{" "}
                          msg{conv.messageCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </Link>
                    {/* Action buttons on hover */}
                    <div
                      className={cn(
                        "absolute right-1 top-1/2 -translate-y-1/2 items-center gap-0.5 hidden group-hover:flex",
                        isActive && "flex",
                      )}
                    >

                      <button
                        onClick={(e) => deleteConversation(e, conv.id)}
                        title="Delete conversation"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-2 py-2 border-t border-sidebar-border space-y-0.5">
          <button
            onClick={() => {
              setDraftKey(apiKey);
              setShowApiModal(true);
            }}
            className={cn(
              "flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm transition-colors",
              hasCustomKey
                ? "text-emerald-400 hover:bg-muted"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Key size={14} />
            <span>{hasCustomKey ? "Custom API Key ✓" : "Set API Key"}</span>
          </button>
        </div>
      </div>

      {/* API Key Modal */}
      {showApiModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[hsl(0,0%,8%)] border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <Key size={18} className="text-primary" />
              <h2 className="font-semibold text-base">GROQ API Key</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Your key is stored locally and sent with each request. It
              overrides the server-side key.{" "}
              <a
                href="https://console.groq.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Get a key →
              </a>
            </p>
            <input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring mb-4"
              onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {hasCustomKey && (
                <button
                  onClick={() => {
                    clearApiKey();
                    setDraftKey("");
                    setShowApiModal(false);
                  }}
                  className="px-3 py-1.5 text-sm text-red-400 hover:bg-muted rounded-lg transition-colors"
                >
                  Remove key
                </button>
              )}
              <button
                onClick={() => setShowApiModal(false)}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveApiKey}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
