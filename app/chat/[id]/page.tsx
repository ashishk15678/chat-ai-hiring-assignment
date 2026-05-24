import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChatArea } from "@/components/chat/ChatArea";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const conv = await db.conversation.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: conv ? `${conv.title} — LLM Logger` : "Chat — LLM Logger" };
}

/**
 * /chat/[id] — Resume an existing conversation.
 * Loads the message history server-side and passes it to ChatArea
 * so the useChat hook is pre-populated (no loading flash).
 */
export default async function ConversationPage({ params }: Props) {
  const { id } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) notFound();

  // Map DB messages to the shape useChat expects
  const initialMessages = conversation.messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    createdAt: m.createdAt,
  }));

  return (
    <ChatArea
      key={conversation.id}
      conversationId={conversation.id}
      initialMessages={initialMessages}
      conversationStatus={conversation.status as "active" | "cancelled"}
      model={conversation.model}
    />
  );
}
