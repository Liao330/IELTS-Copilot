import { create } from "zustand";
import type { Conversation, Message, ConversationDetail } from "@/types";

interface ChatState {
  conversations: Conversation[];
  currentConversation: ConversationDetail | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;

  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (conv: ConversationDetail | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setIsStreaming: (val: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  removeConversation: (id: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isStreaming: false,
  streamingContent: "",

  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (conv) =>
    set({ currentConversation: conv, messages: conv?.messages || [] }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setIsStreaming: (val) => set({ isStreaming: val }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),
  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    })),
}));
