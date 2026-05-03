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
  getHomeworks: (params?: { category?: string; start_date?: string; end_date?: string; min_score?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.start_date) searchParams.set("start_date", params.start_date);
    if (params?.end_date) searchParams.set("end_date", params.end_date);
    if (params?.min_score !== undefined) searchParams.set("min_score", String(params.min_score));
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
  generateReviewNote: (homeworkId: string) =>
    request<import("@/types").HomeworkFeedback>(`/api/homeworks/${homeworkId}/generate-review-note`, { method: "POST" }),
  // 摘要 & 搜索
  generateHomeworkSummary: (homeworkId: string) =>
    request<{ homework_id: string; summary: string }>(`/api/homeworks/${homeworkId}/generate-summary`, { method: "POST" }),
  // 延伸练习（后端自动匹配来源句）
  previewExtensionSession: (sessionId: string) =>
    request<{ title: string; total_words: number; matched_sentences: number; orphan_words: string[]; sentences: { text: string; blocker_words: { word: string; start: number; end: number }[]; note: string }[] }>(
      `/api/listening-practice/sessions/${sessionId}/preview-extension`,
    ),
  createExtensionSession: (sessionId: string) =>
    request<import("@/types").ListeningSessionDetail>(`/api/listening-practice/sessions/${sessionId}/create-extension`, { method: "POST" }),
  // 按作业查精听练习
  getListeningSessionsByHomework: (homeworkId: string) =>
    request<import("@/types").ListeningSessionSummary[]>(`/api/listening-practice/sessions/by-homework/${homeworkId}`),
  // 生成/重新生成精听复盘总结
  generateSessionSummary: (sessionId: string) =>
    request<{ session_id: string; cleanup_summary: string }>(`/api/listening-practice/sessions/${sessionId}/generate-summary`, { method: "POST" }),
  addStudyTime: (sessionId: string, seconds: number) =>
    request<{ ok: boolean; total_seconds: number }>(`/api/listening-practice/sessions/${sessionId}/study-time`, {
      method: "POST", body: JSON.stringify({ seconds }),
    }),
  batchGenerateSummaries: () =>
    request<{ message: string; generated: number; errors: number; total: number }>("/api/homeworks/batch-generate-summaries", { method: "POST" }),
  searchHomeworks: (query: string, category?: string) =>
    request<{ results: { homework_id: string; title: string; category: string; homework_date: string; relevance_reason: string }[]; total_searched: number }>(
      "/api/homeworks/search",
      { method: "POST", body: JSON.stringify({ query, category: category || undefined }) },
    ),
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

  // Reports
  getHomeworkSummary: (params?: { limit?: number; category?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.category) searchParams.set("category", params.category);
    return request<import("@/types").HomeworkSummaryResponse>(`/api/reports/homework-summary?${searchParams}`);
  },
  getDailyReport: (params?: { date?: string; include_notes?: boolean; force?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.date) searchParams.set("date", params.date);
    if (params?.include_notes) searchParams.set("include_notes", "true");
    if (params?.force) searchParams.set("force", "true");
    return request<import("@/types").DailyReportResponse>(`/api/reports/daily?${searchParams}`);
  },

  // Listening Practice (精听复盘)
  listListeningSessions: () =>
    request<import("@/types").ListeningSessionSummary[]>("/api/listening-practice/sessions"),
  createListeningSession: (data: import("@/types").ListeningSessionCreate) =>
    request<import("@/types").ListeningSessionDetail>("/api/listening-practice/sessions", {
      method: "POST", body: JSON.stringify(data),
    }),
  getListeningSession: (id: string) =>
    request<import("@/types").ListeningSessionDetail>(`/api/listening-practice/sessions/${id}`),
  updateListeningSession: (id: string, data: import("@/types").ListeningSessionUpdate) =>
    request<import("@/types").ListeningSessionDetail>(`/api/listening-practice/sessions/${id}`, {
      method: "PUT", body: JSON.stringify(data),
    }),
  deleteListeningSession: (id: string) =>
    request<void>(`/api/listening-practice/sessions/${id}`, { method: "DELETE" }),
  addListeningSentences: (sessionId: string, sentences: string[]) =>
    request<import("@/types").ListeningSessionDetail>(
      `/api/listening-practice/sessions/${sessionId}/sentences`,
      { method: "POST", body: JSON.stringify({ sentences }) },
    ),
  deleteListeningSentence: (sentenceId: string) =>
    request<void>(`/api/listening-practice/sentences/${sentenceId}`, { method: "DELETE" }),
  updateListeningBlockers: (
    sentenceId: string,
    blocker_words: import("@/types").ListeningBlockerWord[],
  ) =>
    request<import("@/types").ListeningSentence>(
      `/api/listening-practice/sentences/${sentenceId}/blockers`,
      { method: "PUT", body: JSON.stringify({ blocker_words }) },
    ),
  generateListeningPractice: (
    sentenceId: string,
    data?: { words?: string[]; force_refresh?: boolean; max_examples?: number },
  ) =>
    request<import("@/types").ListeningGenerateResponse>(
      `/api/listening-practice/sentences/${sentenceId}/generate`,
      { method: "POST", body: JSON.stringify(data ?? {}) },
    ),
  /** AI 整理粘贴的听力笔记，返回结构化的答案句列表（不落库） */
  cleanupListeningNote: (raw_text: string) =>
    request<import("@/types").ListeningCleanupResponse>(
      `/api/listening-practice/cleanup`,
      { method: "POST", body: JSON.stringify({ raw_text }) },
    ),
  updateListeningSentenceNote: (sentenceId: string, note: string | null) =>
    request<import("@/types").ListeningSentence>(
      `/api/listening-practice/sentences/${sentenceId}/note`,
      { method: "PUT", body: JSON.stringify({ note }) },
    ),
  updateListeningSentenceText: (sentenceId: string, original_text: string) =>
    request<import("@/types").ListeningSentence>(
      `/api/listening-practice/sentences/${sentenceId}/text`,
      { method: "PUT", body: JSON.stringify({ original_text }) },
    ),

  // 听写记录
  saveDictationAttempt: (data: import("@/types").DictationAttemptCreate) =>
    request<import("@/types").DictationAttempt>("/api/listening-practice/dictation-attempts", {
      method: "POST", body: JSON.stringify(data),
    }),
  getDictationAttempts: (blockId: string, exampleIndex?: number) => {
    const params = exampleIndex !== undefined ? `?example_index=${exampleIndex}` : "";
    return request<{ attempts: import("@/types").DictationAttempt[] }>(
      `/api/listening-practice/generated/${blockId}/attempts${params}`,
    );
  },

  // 延伸障碍词
  getDiscoveredWords: (sessionId: string) =>
    request<{ words: import("@/types").DiscoveredWord[] }>(
      `/api/listening-practice/sessions/${sessionId}/discovered-words`,
    ),
  addDiscoveredWord: (sessionId: string, data: { word: string; note?: string; source?: string }) =>
    request<import("@/types").DiscoveredWord>(
      `/api/listening-practice/sessions/${sessionId}/discovered-words`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  deleteDiscoveredWord: (wordId: string) =>
    request<{ ok: boolean }>(
      `/api/listening-practice/discovered-words/${wordId}`,
      { method: "DELETE" },
    ),
  // AI 分析错词
  analyzeMissedWords: (data: { original_text: string; user_answers: string[]; missed_words: string[]; missed_indices: number[] }) =>
    request<{ analyzed_words: { word: string; note: string }[] }>(
      `/api/listening-practice/analyze-missed-words`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  // AI 障碍词分级
  prioritizeBlockers: (data: { sentences: { text: string; blocker_words: string[]; note?: string | null }[] }) =>
    request<{ priorities: { word: string; priority: "must" | "recommended" | "skip"; reason: string }[]; stats: { must: number; recommended: number; skip: number }; estimated_minutes: number }>(
      `/api/listening-practice/prioritize-blockers`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  // Speech (TTS / ASR)
  getVoices: () => request<import("@/types").VoiceListResponse>("/api/speech/voices"),
  /** 一次 TTS 请求，返回音频 Blob（mp3）；前端可用 URL.createObjectURL 播放 */
  ttsFetchBlob: async (text: string, voice?: string, rate?: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/api/speech/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, rate }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "TTS 请求失败");
    }
    return res.blob();
  },
  transcribeFile: (fileId: string) =>
    request<{ id: string; text_content: string }>(
      `/api/files/${fileId}/transcribe`,
      { method: "POST" },
    ),

  // Dictation 听写模块
  listDueMonths: (limit = 50) =>
    request<import("@/types").VocabularyWord[]>(`/api/dictation/months/due?limit=${limit}`),
  checkMonth: (wordId: string, answer: string) =>
    request<import("@/types").DictationMonthCheckResult>(
      `/api/dictation/months/${wordId}/check`,
      { method: "POST", body: JSON.stringify({ answer }) },
    ),
  randomDateQuestion: () =>
    request<import("@/types").DictationDateQuestion>(`/api/dictation/dates/random`),
  checkDate: (expected: string, answer: string) =>
    request<import("@/types").DictationDateCheckResult>(
      `/api/dictation/dates/check`,
      { method: "POST", body: JSON.stringify({ expected, answer }) },
    ),
  randomNumberQuestion: (kind?: string) =>
    request<import("@/types").DictationNumberQuestion>(
      `/api/dictation/numbers/random${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`,
    ),
  checkNumber: (expected: string, answer: string, kind?: string) =>
    request<import("@/types").DictationNumberCheckResult>(
      `/api/dictation/numbers/check`,
      { method: "POST", body: JSON.stringify({ expected, answer, kind }) },
    ),
  listDueListeningWords: (limit = 50) =>
    request<import("@/types").VocabularyWord[]>(`/api/dictation/listening-words/due?limit=${limit}`),
  checkListeningWord: (wordId: string, answer: string) =>
    request<import("@/types").DictationMonthCheckResult>(
      `/api/dictation/listening-words/${wordId}/check`,
      { method: "POST", body: JSON.stringify({ answer }) },
    ),

  // Schedule (日程计划)
  getScheduleTasks: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<import("@/types").ScheduleTask[]>(`/api/schedule/?${params}`);
  },
  createScheduleTask: (data: import("@/types").ScheduleTaskCreate) =>
    request<import("@/types").ScheduleTask>("/api/schedule/", {
      method: "POST", body: JSON.stringify(data),
    }),
  updateScheduleTask: (id: string, data: Partial<import("@/types").ScheduleTaskCreate> & { done?: boolean }) =>
    request<import("@/types").ScheduleTask>(`/api/schedule/${id}`, {
      method: "PATCH", body: JSON.stringify(data),
    }),
  deleteScheduleTask: (id: string) =>
    request<{ ok: boolean }>(`/api/schedule/${id}`, { method: "DELETE" }),

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
