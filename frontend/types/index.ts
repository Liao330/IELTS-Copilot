export interface Agent {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AgentDetail extends Agent {
  system_prompt: string;
  welcome_message: string | null;
}

export interface Conversation {
  id: string;
  agent_id: string;
  title: string | null;
  model_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments: string | null;
  token_count: number | null;
  routed_agent_id?: string | null;
  routed_agent_icon?: string;
  routed_agent_name?: string;
  created_at: string;
  isError?: boolean;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
  agent_name: string | null;
  agent_icon: string | null;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  page_size: number;
}

export interface FileUploadResponse {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  text_content: string | null;
}

export interface LLMProvider {
  name: string;
  api_key: string;
  api_base: string;
  models: string[];
}

export interface Settings {
  llm_providers: Record<string, LLMProvider>;
  default_model: string;
  context_window_size: number;
  stream_enabled: boolean;
}

export interface SSEEvent {
  type: "start" | "delta" | "done" | "error";
  content?: string;
  message_id?: string;
  message?: string;
  token_count?: number;
  routed_agent_id?: string;
  routed_agent_icon?: string;
  routed_agent_name?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  category: "writing" | "speaking" | "reading" | "listening" | "general";
  tags: string | null;
  source_conversation_id: string | null;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title: string;
  content: string;
  category: string;
  tags?: string[];
  source_conversation_id?: string;
  source_message_id?: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
}

// Homework types
export interface HomeworkFileInfo {
  id: string;
  name: string;
  mime_type: string;
}

export interface HomeworkFeedback {
  id: string;
  homework_id: string;
  feedback_type: "ai_report" | "teacher_text" | "teacher_audio" | "teacher_image";
  content: string | null;
  file_id: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  created_at: string;
}

export interface Homework {
  id: string;
  title: string;
  category: "writing" | "speaking" | "reading" | "listening";
  homework_date: string;
  description: string | null;
  file_id: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  files: HomeworkFileInfo[];
  feedbacks: HomeworkFeedback[];
  created_at: string;
  updated_at: string;
}

export interface HomeworkCreate {
  title: string;
  category: string;
  homework_date: string;
  description?: string;
  file_id?: string;
  file_ids?: string[];
}

export interface HomeworkUpdate {
  title?: string;
  category?: string;
  homework_date?: string;
  description?: string;
  file_id?: string;
  file_ids?: string[];
}

export interface FeedbackCreate {
  feedback_type: string;
  content?: string;
  file_id?: string;
}

export interface FeedbackUpdate {
  content?: string;
  file_id?: string;
}

export interface HomeworkDateGroup {
  date: string;
  categories: Record<string, number>;
  total: number;
}

// ========== Vocabulary (单词本) ==========

export interface VocabularyWord {
  id: string;
  word: string;
  phonetic: string | null;
  pos: string | null;
  meaning: string;
  example: string | null;
  example_cn: string | null;
  synonyms: string | null; // JSON string
  note: string | null;
  category: "writing" | "speaking" | "reading" | "listening" | "general";
  tags: string | null; // JSON string
  source_conversation_id: string | null;
  source_message_id: string | null;
  mastery_level: number; // 0=新词, 1=模糊, 2=认识, 3=熟练
  review_count: number;
  correct_count: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WordCreate {
  word: string;
  phonetic?: string;
  pos?: string;
  meaning: string;
  example?: string;
  example_cn?: string;
  synonyms?: string[];
  note?: string;
  category?: string;
  tags?: string[];
  source_conversation_id?: string;
  source_message_id?: string;
}

export interface WordUpdate {
  word?: string;
  phonetic?: string;
  pos?: string;
  meaning?: string;
  example?: string;
  example_cn?: string;
  synonyms?: string[];
  note?: string;
  category?: string;
  tags?: string[];
}

export interface FavoriteSentence {
  id: string;
  content: string;
  translation: string | null;
  note: string | null;
  category: "writing" | "speaking" | "reading" | "listening" | "general";
  tags: string | null;
  source_conversation_id: string | null;
  source_message_id: string | null;
  mastery_level: number;
  review_count: number;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SentenceCreate {
  content: string;
  translation?: string;
  note?: string;
  category?: string;
  tags?: string[];
  source_conversation_id?: string;
  source_message_id?: string;
}

export interface SentenceUpdate {
  content?: string;
  translation?: string;
  note?: string;
  category?: string;
  tags?: string[];
}

export interface TranslateResult {
  type: "word" | "sentence";
  word: string;
  phonetic?: string;
  pos?: string;
  meaning: string;
  example?: string;
  example_cn?: string;
  synonyms?: string[];
  note?: string;
}

export interface VocabularyStats {
  total_words: number;
  total_sentences: number;
  mastered_words: number;
  learning_words: number;
  new_words: number;
  due_review_count: number;
}
