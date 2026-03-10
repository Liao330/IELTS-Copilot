"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, MessageSquare } from "lucide-react";

interface ChatSidebarProps {
  agentId: string;
  currentConversationId: string;
}

export function ChatSidebar({ agentId, currentConversationId }: ChatSidebarProps) {
  const router = useRouter();
  const { conversations, setConversations, removeConversation } = useChatStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getConversations({ agent_id: agentId, page_size: 50 })
      .then((res) => setConversations(res.conversations))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentId, setConversations]);

  const handleNewChat = async () => {
    try {
      const conv = await api.createConversation({ agent_id: agentId });
      setConversations([conv, ...conversations]);
      router.push(`/chat/${conv.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!confirm("确定删除此对话？")) return;
    try {
      await api.deleteConversation(convId);
      removeConversation(convId);
      if (convId === currentConversationId) {
        router.push("/");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-64 border-r flex flex-col h-full bg-muted/30">
      <div className="p-3 border-b">
        <Button onClick={handleNewChat} variant="outline" className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          新对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-4">加载中...</div>
          ) : conversations.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">暂无对话</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => router.push(`/chat/${conv.id}`)}
                className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 group transition-colors ${
                  conv.id === currentConversationId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="truncate flex-1">{conv.title || "新对话"}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
