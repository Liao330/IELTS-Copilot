"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, sendMessageSSE, retryMessageSSE, editMessageSSE } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Menu, X } from "lucide-react";
import type { Message, SSEEvent } from "@/types";
import { useToast } from "@/hooks/use-toast";

// 子助手名称和图标映射（主助手路由模式下使用）
const AGENT_LABEL_MAP: Record<string, { icon: string; name: string }> = {
  "writing-assistant": { icon: "✍️", name: "写作笔记整理" },
  "writing-coach": { icon: "📝", name: "写作辅导" },
  "speaking-assistant": { icon: "🎤", name: "口语优化" },
  "speaking-feedback": { icon: "📋", name: "口语反馈整理" },
  "reading-assistant": { icon: "📖", name: "阅读分析" },
  "listening-assistant": { icon: "🎧", name: "听力分析" },
};

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;
  const { toast } = useToast();

  const {
    currentConversation,
    setCurrentConversation,
    messages,
    addMessage,
    setMessages,
    removeMessages,
    isStreaming,
    setIsStreaming,
    streamingContent,
    setStreamingContent,
    appendStreamingContent,
    streamingRoutedInfo,
    setStreamingRoutedInfo,
  } = useChatStore();

  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  // 检测用户是否主动上滚（忽略程序触发的滚动）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      // 如果是程序触发的滚动，跳过检测
      if (programmaticScrollRef.current) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (!atBottom) {
        userScrolledUpRef.current = true;
      } else {
        // 用户手动滚回底部，恢复自动跟随
        userScrolledUpRef.current = false;
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    api
      .getConversation(conversationId)
      .then((conv) => {
        setCurrentConversation(conv);
      })
      .catch((err) => {
        console.error(err);
        toast({ variant: "destructive", description: "加载对话失败" });
        router.push("/");
      })
      .finally(() => setLoading(false));

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [conversationId, router, setCurrentConversation, toast]);

  // 只在用户没有主动上滚时自动滚到底部
  useEffect(() => {
    if (!userScrolledUpRef.current && scrollRef.current) {
      programmaticScrollRef.current = true;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      // 用 requestAnimationFrame 确保 scroll 事件处理完后再解除标记
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, [messages, streamingContent]);

  const showError = useCallback((errorMessage: string) => {
    const errorMsg: Message = {
      id: `error-${Date.now()}`,
      conversation_id: conversationId,
      role: "assistant",
      content: errorMessage,
      attachments: null,
      token_count: null,
      created_at: new Date().toISOString(),
      isError: true,
    };
    addMessage(errorMsg);
  }, [conversationId, addMessage]);

  // SSE 事件处理器（发送和重试共用）
  const makeSSEHandlers = useCallback(() => ({
    onEvent: (event: SSEEvent) => {
      if (event.type === "start" && event.routed_agent_id) {
        setStreamingRoutedInfo({
          routed_agent_id: event.routed_agent_id,
          routed_agent_icon: event.routed_agent_icon || "🤖",
          routed_agent_name: event.routed_agent_name || "助手",
        });
      } else if (event.type === "delta" && event.content) {
        appendStreamingContent(event.content);
      } else if (event.type === "done") {
        setIsStreaming(false);
        setStreamingRoutedInfo(null);
        api.getConversation(conversationId).then((conv) => {
          setCurrentConversation(conv);
        });
      } else if (event.type === "error") {
        setIsStreaming(false);
        setStreamingRoutedInfo(null);
        showError(event.message || "消息发送失败");
      }
    },
    onError: (error: Error) => {
      setIsStreaming(false);
      setStreamingRoutedInfo(null);
      showError(error.message || "网络错误");
    },
  }), [conversationId, appendStreamingContent, setIsStreaming, setCurrentConversation, setStreamingRoutedInfo, showError]);

  const handleSend = (content: string, attachments?: string[]) => {
    if (isStreaming) return;

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content,
      attachments: attachments
        ? JSON.stringify(attachments.map((id) => ({ file_id: id })))
        : null,
      token_count: null,
      created_at: new Date().toISOString(),
    };
    addMessage(userMsg);
    setIsStreaming(true);
    setStreamingContent("");
    userScrolledUpRef.current = false;

    const { onEvent, onError } = makeSSEHandlers();
    abortRef.current = sendMessageSSE(conversationId, { content, attachments }, onEvent, onError);
  };

  const handleRetry = useCallback(() => {
    if (isStreaming) return;

    // 移除所有错误消息
    setMessages(messages.filter((m) => !m.isError));
    setIsStreaming(true);
    setStreamingContent("");
    userScrolledUpRef.current = false;

    const { onEvent, onError } = makeSSEHandlers();
    abortRef.current = retryMessageSSE(conversationId, onEvent, onError);
  }, [conversationId, isStreaming, messages, setMessages, setIsStreaming, setStreamingContent, makeSSEHandlers]);

  const handleEdit = useCallback((messageId: string, newContent: string) => {
    if (isStreaming) return;

    // 找到被编辑的消息索引，移除其后的所有消息
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const updatedMessages = messages.slice(0, idx + 1).map((m) =>
      m.id === messageId ? { ...m, content: newContent } : m
    );
    setMessages(updatedMessages);
    setIsStreaming(true);
    setStreamingContent("");
    userScrolledUpRef.current = false;

    const { onEvent, onError } = makeSSEHandlers();
    abortRef.current = editMessageSSE(
      conversationId,
      { message_id: messageId, content: newContent },
      onEvent,
      onError,
    );
  }, [conversationId, isStreaming, messages, setMessages, setIsStreaming, setStreamingContent, makeSSEHandlers]);

  const handleStop = useCallback(() => {
    if (!isStreaming) return;

    // 中断 SSE 连接
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // 将已生成的流式内容保存为助手消息
    if (streamingContent.trim()) {
      const partialMsg: Message = {
        id: `stopped-${Date.now()}`,
        conversation_id: conversationId,
        role: "assistant",
        content: streamingContent,
        attachments: null,
        token_count: null,
        created_at: new Date().toISOString(),
      };
      addMessage(partialMsg);
    }

    setIsStreaming(false);
    setStreamingContent("");
  }, [isStreaming, streamingContent, conversationId, addMessage, setIsStreaming, setStreamingContent]);

  const handleDelete = useCallback(async (messageId: string) => {
    if (isStreaming) return;
    try {
      const result = await api.deleteMessage(conversationId, messageId);
      removeMessages(result.deleted_ids);
      toast({ description: "已删除" });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "删除失败" });
    }
  }, [conversationId, isStreaming, removeMessages, toast]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const streamingMessage: Message | null = isStreaming
    ? {
        id: "streaming",
        conversation_id: conversationId,
        role: "assistant",
        content: streamingContent,
        attachments: null,
        token_count: null,
        routed_agent_id: streamingRoutedInfo?.routed_agent_id,
        routed_agent_icon: streamingRoutedInfo?.routed_agent_icon,
        routed_agent_name: streamingRoutedInfo?.routed_agent_name,
        created_at: new Date().toISOString(),
      }
    : null;

  // 找到最后一条用户消息的 ID
  const lastUserMessageId = [...messages].reverse().find((m) => m.role === "user" && !m.isError)?.id;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-background h-14 flex items-center px-4 gap-3 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden flex-shrink-0"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg">{currentConversation?.agent_icon}</span>
          <span className="font-medium truncate">
            {currentConversation?.agent_name}
          </span>
          <span className="text-muted-foreground text-sm hidden sm:inline">
            — {currentConversation?.title || "新对话"}
          </span>
        </div>
        {currentConversation?.model_name && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">
            {currentConversation.model_name}
          </span>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "block" : "hidden"
          } md:block absolute md:relative z-40 h-[calc(100vh-3.5rem)] bg-background`}
        >
          {currentConversation && (
            <ChatSidebar
              agentId={currentConversation.agent_id}
              currentConversationId={conversationId}
            />
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
            <div className="max-w-3xl mx-auto py-4">
              {messages.map((msg) => {
                // 为从数据库加载的消息补充路由标签
                const enrichedMsg = msg.routed_agent_id && !msg.routed_agent_name
                  ? {
                      ...msg,
                      routed_agent_icon: AGENT_LABEL_MAP[msg.routed_agent_id]?.icon || "🤖",
                      routed_agent_name: AGENT_LABEL_MAP[msg.routed_agent_id]?.name || msg.routed_agent_id,
                    }
                  : msg;
                return (
                  <ChatMessage
                    key={enrichedMsg.id}
                    message={enrichedMsg}
                    onRetry={enrichedMsg.isError ? handleRetry : undefined}
                    isLastUserMessage={enrichedMsg.id === lastUserMessageId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    conversationId={conversationId}
                  />
                );
              })}
              {streamingMessage && (
                <ChatMessage message={streamingMessage} isStreaming />
              )}
            </div>
          </div>
          <div className="max-w-3xl mx-auto w-full">
            <ChatInput onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} conversationId={conversationId} />
          </div>
        </div>
      </div>
    </div>
  );
}
