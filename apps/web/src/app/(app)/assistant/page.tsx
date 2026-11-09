import type { Metadata } from "next";
import { ChatView } from "@/features/chat/components/chat-view";

export const metadata: Metadata = { title: "Ask Assistant" };

export default function AssistantPage() {
  return <ChatView />;
}
