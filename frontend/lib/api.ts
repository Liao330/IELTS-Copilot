const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Request failed");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export const api = {
  // Agents
  getAgents: () => request<import("@/types").Agent[]>("/api/agents"),
  getAgent: (id: string) => request<import("@/types").AgentDetail>(`/api/agents/${id}`),

  // Conversations
  createConversation: (data: { agent_id: string; model_name?: string }) =>
    request<import("@/types").Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getConversations: (params?: { page?: number; page_size?: number; agent_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    if (params?.agent_id) searchParams.set("agent_id", params.agent_id);
    return request<import("@/types").ConversationListResponse>(`/api/conversations?${searchParams}`);
  },
  getConversation: (id: string) =>
    request<import("@/types").ConversationDetail>(`/api/conversations/${id}`),
  updateConversation: (id: string, data: { title?: string }) =>
    request<import("@/types").Conversation>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteConversation: (id: string) =>
    request<void>(`/api/conversations/${id}`, { method: "DELETE" }),
  deleteMessage: (conversationId: string, messageId: string) =>
    request<{ deleted_ids: string[] }>(`/api/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }),

  // Files
  uploadFile: async (file: File): Promise<import("@/types").FileUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || "Upload failed");
    }
    return res.json();
  },

  // Settings
  getSettings: () => request<import("@/types").Settings>("/api/settings"),
  updateSettings: (data: Partial<import("@/types").Settings>) =>
    request<import("@/types").Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Notes
  getNotes: (params?: { category?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.search) searchParams.set("search", params.search);
    return request<import("@/types").Note[]>(`/api/notes?${searchParams}`);
  },
  createNote: (data: import("@/types").NoteCreate) =>
    request<import("@/types").Note>("/api/notes", { method: "POST", body: JSON.stringify(data) }),
  updateNote: (id: string, data: import("@/types").NoteUpdate) =>
    request<import("@/types").Note>(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    request<void>(`/api/notes/${id}`, { method: "DELETE" }),
  generateNoteTitle: (content: string) =>
    request<{ title: string }>("/api/notes/generate-title", {
      method: "POST", body: JSON.stringify({ content }),
    }),

  // Homeworks
  getHomeworks: (params?: { category?: string; start_date?: string; end_date?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.start_date) searchParams.set("start_date", params.start_date);
    if (params?.end_date) searchParams.set("end_date", params.end_date);
    return request<import("@/types").Homework[]>(`/api/homeworks?${searchParams}`);
  },
  getHomeworkCalendar: (year: number, month: number) =>
    request<import("@/types").HomeworkDateGroup[]>(`/api/homeworks/calendar?year=${year}&month=${month}`),
  getHomework: (id: string) =>
    request<import("@/types").Homework>(`/api/homeworks/${id}`),
  createHomework: (data: import("@/types").HomeworkCreate) =>
    request<import("@/types").Homework>("/api/homeworks", { method: "POST", body: JSON.stringify(data) }),
  updateHomework: (id: string, data: import("@/types").HomeworkUpdate) =>
    request<import("@/types").Homework>(`/api/homeworks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteHomework: (id: string) =>
    request<void>(`/api/homeworks/${id}`, { method: "DELETE" }),
  addFeedback: (homeworkId: string, data: import("@/types").FeedbackCreate) =>
    request<import("@/types").HomeworkFeedback>(`/api/homeworks/${homeworkId}/feedbacks`, {
      method: "POST", body: JSON.stringify(data),
    }),
  updateFeedback: (homeworkId: string, feedbackId: string, data: import("@/types").FeedbackUpdate) =>
    request<import("@/types").HomeworkFeedback>(`/api/homeworks/${homeworkId}/feedbacks/${feedbackId}`, {
      method: "PUT", body: JSON.stringify(data),
    }),
  deleteFeedback: (homeworkId: string, feedbackId: string) =>
    request<void>(`/api/homeworks/${homeworkId}/feedbacks/${feedbackId}`, { method: "DELETE" }),
  addHomeworkFile: (homeworkId: string, fileId: string) =>
    request<import("@/types").Homework>(`/api/homeworks/${homeworkId}/files?file_id=${fileId}`, { method: "POST" }),
  removeHomeworkFile: (homeworkId: string, fileId: string) =>
    request<import("@/types").Homework>(`/api/homeworks/${homeworkId}/files/${fileId}`, { method: "DELETE" }),
  getFileDownloadUrl: (fileId: string) => `${API_BASE}/api/homeworks/files/${fileId}/download`,
  getFilePreviewUrl: (fileId: string) => `${API_BASE}/api/homeworks/files/${fileId}/preview`,

  // Vocabulary - Words
  getWords: (params?: { category?: string; search?: string; mastery_level?: number; due_only?: boolean; page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.mastery_level !== undefined) searchParams.set("mastery_level", String(params.mastery_level));
    if (params?.due_only) searchParams.set("due_only", "true");
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    return request<import("@/types").VocabularyWord[]>(`/api/vocabulary/words?${searchParams}`);
  },
  createWord: (data: import("@/types").WordCreate) =>
    request<import("@/types").VocabularyWord>("/api/vocabulary/words", { method: "POST", body: JSON.stringify(data) }),
  updateWord: (id: string, data: import("@/types").WordUpdate) =>
    request<import("@/types").VocabularyWord>(`/api/vocabulary/words/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWord: (id: string) =>
    request<void>(`/api/vocabulary/words/${id}`, { method: "DELETE" }),

  // Vocabulary - Review
  getDueWords: (limit?: number) => {
    const searchParams = new URLSearchParams();
    if (limit) searchParams.set("limit", String(limit));
    return request<import("@/types").VocabularyWord[]>(`/api/vocabulary/words/review/due?${searchParams}`);
  },
  reviewWord: (id: string, quality: number) =>
    request<import("@/types").VocabularyWord>(`/api/vocabulary/words/${id}/review`, {
      method: "POST", body: JSON.stringify({ quality }),
    }),

  // Vocabulary - Sentences
  getSentences: (params?: { category?: string; search?: string; page?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));
    return request<import("@/types").FavoriteSentence[]>(`/api/vocabulary/sentences?${searchParams}`);
  },
  createSentence: (data: import("@/types").SentenceCreate) =>
    request<import("@/types").FavoriteSentence>("/api/vocabulary/sentences", { method: "POST", body: JSON.stringify(data) }),
  updateSentence: (id: string, data: import("@/types").SentenceUpdate) =>
    request<import("@/types").FavoriteSentence>(`/api/vocabulary/sentences/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSentence: (id: string) =>
    request<void>(`/api/vocabulary/sentences/${id}`, { method: "DELETE" }),

  // Vocabulary - Translate
  translateText: (text: string) =>
    request<import("@/types").TranslateResult>("/api/vocabulary/translate", {
      method: "POST", body: JSON.stringify({ text }),
    }),

  // Vocabulary - Stats
  getVocabularyStats: () =>
    request<import("@/types").VocabularyStats>("/api/vocabulary/stats"),
};

// SSE helper
export function sendMessageSSE(
  conversationId: string,
  data: { content: string; attachments?: string[] },
  onEvent: (event: import("@/types").SSEEvent) => void,
  onError: (error: Error) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        onError(new Error(err.detail || "Request failed"));
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        onEvent({ type: "start", message_id: json.id });
        onEvent({ type: "delta", content: json.content });
        onEvent({ type: "done", message_id: json.id });
      } else {
        await _readSSEStream(res, onEvent);
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err);
      }
    });

  return controller;
}

// SSE helper for retry (no new user message)
export function retryMessageSSE(
  conversationId: string,
  onEvent: (event: import("@/types").SSEEvent) => void,
  onError: (error: Error) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/conversations/${conversationId}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        onError(new Error(err.detail || "Request failed"));
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        onEvent({ type: "start", message_id: json.id });
        onEvent({ type: "delta", content: json.content });
        onEvent({ type: "done", message_id: json.id });
      } else {
        await _readSSEStream(res, onEvent);
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err);
      }
    });

  return controller;
}

// SSE helper for edit (edit user message and regenerate)
export function editMessageSSE(
  conversationId: string,
  data: { message_id: string; content: string },
  onEvent: (event: import("@/types").SSEEvent) => void,
  onError: (error: Error) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/conversations/${conversationId}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        onError(new Error(err.detail || "Request failed"));
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        onEvent({ type: "start", message_id: json.id });
        onEvent({ type: "delta", content: json.content });
        onEvent({ type: "done", message_id: json.id });
      } else {
        await _readSSEStream(res, onEvent);
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err);
      }
    });

  return controller;
}

async function _readSSEStream(
  res: Response,
  onEvent: (event: import("@/types").SSEEvent) => void,
) {
  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr) {
          try {
            const event = JSON.parse(jsonStr);
            onEvent(event);
            if (event.type === "done" || event.type === "error") {
              receivedDone = true;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  }

  // 处理 buffer 中可能残留的最后一个事件
  if (buffer.trim()) {
    const remaining = buffer.trim();
    if (remaining.startsWith("data: ")) {
      const jsonStr = remaining.slice(6).trim();
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr);
          onEvent(event);
          if (event.type === "done" || event.type === "error") {
            receivedDone = true;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // 安全兜底：如果流已结束但没收到 done 事件，手动触发 done
  if (!receivedDone) {
    onEvent({ type: "done" });
  }
}
