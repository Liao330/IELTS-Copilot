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
  speech_providers?: SpeechProviders;
}

export interface SSEEvent {
  type: "start" | "delta" | "done" | "error";
  content?: string;
  message_id?: string;
  user_message_id?: string;
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
  feedback_type: "ai_report" | "teacher_text" | "teacher_audio" | "teacher_image" | "review_note" | "auto_scores";
  content: string | null;
  file_id: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  scores: {
    dimensions: {
      key: string;
      label: string;
      label_en: string;
      score: number;
    }[];
    overall: number;
    category: string;
  } | null;
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

// ========== Reports (学习日报 & 趋势总结) ==========

export interface HomeworkSummaryAI {
  overview: string;
  strengths: string[];
  weaknesses: string[];
  repeated_issues: string[];
  next_actions: string[];
  trend: string;
  parse_error?: boolean;
}

export interface HomeworkSummaryStats {
  total_homeworks: number;
  categories: Record<string, number>;
  total_feedbacks: number;
  date_range: { start: string; end: string } | null;
}

export interface HomeworkSummaryResponse {
  ai_summary: HomeworkSummaryAI;
  stats: HomeworkSummaryStats;
  source_homework_ids: string[];
  source_count: number;
}

export interface DailyReportAI {
  overview: string;
  today_focus: string[];
  today_issues: string[];
  comparison_to_recent: string;
  tomorrow_actions: string[];
  parse_error?: boolean;
}

export interface DailyReportStats {
  date: string;
  homework_count: number;
  categories: string[];
  feedback_count: number;
  has_data: boolean;
}

export interface DailyReportResponse {
  ai_report: DailyReportAI;
  stats: DailyReportStats;
  date: string;
}


// ========== Listening Practice (听力精听复盘) ==========

export type ListeningDifficultyType =
  | "连读"
  | "弱读"
  | "不熟词"
  | "吞音"
  | "相近发音"
  | "其他";

export interface ListeningBlockerWord {
  word: string;
  start: number;
  end: number;
  vocab_word_id?: string | null;
}

export interface ListeningGeneratedExample {
  text: string;
  translation: string;
  difficulty_level: 1 | 2 | 3;
  hint: string;
}

export interface ListeningGeneratedBlock {
  id: string;
  sentence_id: string;
  blocker_word: string;
  difficulty_type: ListeningDifficultyType | string;
  explanation: string;
  examples: ListeningGeneratedExample[];
  created_at: string;
  latest_attempts?: Record<string, DictationAttempt> | null;
}

export interface ListeningSentence {
  id: string;
  session_id: string;
  original_text: string;
  order_index: number;
  note: string | null;
  blocker_words: ListeningBlockerWord[];
  generated_blocks: ListeningGeneratedBlock[];
  created_at: string;
  updated_at: string;
}

export interface ListeningSessionSummary {
  id: string;
  title: string;
  note: string | null;
  sentence_count: number;
  blocker_count: number;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface ListeningSessionDetail {
  id: string;
  title: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  sentences: ListeningSentence[];
  is_demo?: boolean;
}

export interface ListeningSentenceInput {
  text: string;
  note?: string | null;
  blocker_words?: ListeningBlockerWord[];
}

export interface ListeningSessionCreate {
  title: string;
  note?: string;
  sentences?: string[];
  sentences_with_context?: ListeningSentenceInput[];
}

export interface ListeningSessionUpdate {
  title?: string;
  note?: string;
}

export interface ListeningGenerateResponse {
  sentence_id: string;
  blocks: ListeningGeneratedBlock[];
}

// AI 整理笔记
export interface ListeningCleanupItem {
  text: string;
  note: string | null;
  target_words: string[];
  prefilled_blockers: ListeningBlockerWord[];
}

export interface ListeningCleanupResponse {
  sentences: ListeningCleanupItem[];
}

// ========== 听写记录 ==========

export interface DictationAttempt {
  id: string;
  generated_block_id: string;
  example_index: number;
  play_count: number;
  correct_count: number;
  total_count: number;
  accuracy_pct: number;
  missed_words: string[];
  user_answers: string[];
  created_at: string;
}

export interface DictationAttemptCreate {
  generated_block_id: string;
  example_index: number;
  play_count: number;
  correct_count: number;
  total_count: number;
  accuracy_pct: number;
  missed_words: string[];
  user_answers: string[];
}

export interface DiscoveredWord {
  id: string;
  session_id: string;
  word: string;
  note: string | null;
  source: string;
  created_at: string;
}


// ========== Speech (TTS / ASR) ==========

export interface VoicePreset {
  id: string;
  label: string;
  accent: string;
}

export interface VoiceListResponse {
  voices: VoicePreset[];
  default_voice: string;
  configured: boolean;
  asr_configured?: boolean;
}

export interface SpeechProviders {
  asr?: {
    model?: string;
    // 历史字段（可能用户旧数据带着），保留兼容
    api_key?: string;
    api_base?: string;
    provider?: string;
  };
  tts?: {
    // 腾讯云
    secret_id?: string;
    secret_key?: string;
    region?: string;
    default_voice?: string;
    default_rate?: string;
    // 历史字段，保留兼容
    provider?: string;
    api_key?: string;
  };
}


// ========== Dictation 听写 ==========

export interface DictationMonthCheckResult {
  correct: boolean;
  expected: string;
  mastery_level: number;
  next_review_at: string | null;
  interval_days: number;
}

export interface DictationNumberQuestion {
  kind:
    | "phone" | "postcode" | "flight_no" | "card_no" | "room_no"
    | "price" | "year"
    | "time" | "date" | "percent" | "fraction" | "measurement"
    | string;
  text: string;      // 展示用的正确答案
  read_text: string; // 送 TTS 的朗读文本
  hint: string;
}

export interface DictationNumberCheckResult {
  correct: boolean;
  expected: string;
}

export interface DictationDateQuestion {
  kind: string;
  text: string;
  read_text: string;
  hint: string;
}

export interface DictationDateCheckResult {
  correct: boolean;
  expected: string;
}
