"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Agent, Conversation } from "@/types";
import { AgentCard } from "@/components/agent/AgentCard";
import { Settings, BookMarked, Library, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAgents(),
      api.getConversations({ page_size: 5 }),
    ])
      .then(([agentsData, convsData]) => {
        setAgents(agentsData);
        setRecentConversations(convsData.conversations);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleStartChat = async (agentId: string) => {
    try {
      const conv = await api.createConversation({ agent_id: agentId });
      router.push(`/chat/${conv.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            🎓 IELTS Copilot
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/settings")}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* 主助手统一入口 */}
        <div className="mb-8">
          <button
            onClick={() => handleStartChat("ielts-copilot")}
            className="w-full rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/20 transition-all duration-300 p-6 text-left group"
          >
            <div className="flex items-center gap-4">
              <span className="text-4xl">🎓</span>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors">
                  IELTS Copilot
                </h2>
                <p className="text-sm text-muted-foreground">
                  智能全能助手 — 直接提问或发送材料，自动调用最合适的专项助手为你解答
                </p>
              </div>
              <div className="text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">
                →
              </div>
            </div>
          </button>
        </div>

        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">或选择专项助手</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {agents.filter(a => a.id !== "ielts-copilot").map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={() => handleStartChat(agent.id)}
            />
          ))}
        </div>

        {recentConversations.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-5 bg-primary rounded-full" />
              最近对话
            </h3>
            <div className="space-y-2">
              {recentConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">📝</span>
                    <span className="truncate text-sm font-medium">
                      {conv.title || "新对话"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(conv.updated_at).toLocaleDateString("zh-CN")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/vocabulary")}
          >
            <BookOpen className="h-5 w-5" />
            📖 单词本
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/homeworks")}
          >
            <Library className="h-5 w-5" />
            📚 作业库
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/notes")}
          >
            <BookMarked className="h-5 w-5" />
            📒 我的笔记
          </Button>
        </div>
      </main>
    </div>
  );
}
