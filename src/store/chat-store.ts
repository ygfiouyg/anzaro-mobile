'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './auth-store';

// Types
export interface SearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  date?: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  model?: string;
  emotion?: string;
  quoteUsed?: string;
  language?: string;
  attachments?: string;
  pdfUrl?: string;
  isEdited?: boolean;
  /** Search results from auto web search (shown in collapsible card above response) */
  searchResults?: SearchResult[];
  /** Generated images from inline image generation */
  generatedImages?: Array<{ dataUrl: string; prompt: string }>;
  /** Image generation status: 'generating' | 'failed' | null */
  imageGenStatus?: string | null;
  /** Generated video from inline video generation */
  generatedVideo?: { videoUrl: string; prompt: string } | null;
  /** Video generation status: 'generating' | 'failed' | null */
  videoGenStatus?: string | null;
  /** File generation status: 'generating' | 'ready' | 'failed' | null */
  fileGenStatus?: string | null;
  /** Asset ID for file generation polling */
  fileAssetId?: string;
  /** Generated files from inline file generation (PDFs etc.) */
  generatedFiles?: Array<{ id: string; name: string; url: string; fileSize?: number; driveLink?: string }>;
  /** Media widget for inline audio/video playback (radio, spotify, youtube, tts) */
  mediaWidget?: {
    type: 'audio' | 'video';
    source: 'radio' | 'spotify' | 'youtube' | 'tts';
    title: string;
    streamUrl?: string;
    audioData?: string;
    mimeType?: string;
    autoPlay?: boolean;
    duration?: number;
    thumbnail?: string;
  } | null;
  /** Backend status — يظهر للمستخدم لما الـ AI بيشتغل */
  backendStatus?: string | null;
  backendPhase?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  model: string;
  language: string;
  context?: string;
  isArchived: boolean;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface StreamingProgress {
  stage: string;
  detail: string;
  history: Array<{ stage: string; detail: string; timestamp: number }>;
}

// ─── Batch Processing Types ─────────────────────────────────────────
export interface BatchFileResult {
  fileName: string;
  summary: string;
  keyConcepts: string[];
  diagrams: Array<{
    description: string;
    data: Record<string, unknown>;
    type: 'chart' | 'diagram' | 'table';
  }>;
  questions: string[];
  connections: string[];
}

export interface BatchProgress {
  stage: string;
  detail: string;
  current: number;
  total: number;
  partialResult?: BatchFileResult;
}

// ─── Model Arena Types ────────────────────────────────────────────────
export interface ArenaResult {
  modelId: string;
  content: string;
  done: boolean;
  vote?: number;
}

// ─── Document Generation Progress Types ──────────────────────────────
export interface DocumentGenProgress {
  /** Current stage identifier (e.g. 'analyzing', 'generating-content') */
  stage: string;
  /** Progress percentage 0-100 */
  progress: number;
  /** Human-readable detail message */
  detail: string;
  /** History of completed stages */
  history: Array<{ stage: string; detail: string; timestamp: number }>;
}

export interface DocumentGenResult {
  /** URL to download the generated document */
  fileUrl: string;
  /** File name */
  fileName: string;
  /** Document type (pdf, pptx, etc.) */
  docType: string;
  /** File size in bytes (if known) */
  fileSize?: number;
  /** Google Drive URL (if uploaded) */
  driveUrl?: string;
  /** Time taken in ms */
  durationMs?: number;
  /** Design style used (from the design reasoning) */
  designStyleUsed?: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeModel: string;
  activeLanguage: 'ar' | 'en' | 'egyptian';
  isStreaming: boolean;
  streamingProgress: StreamingProgress | null;
  sidebarOpen: boolean;
  searchQuery: string;

  // ── Global Active Media (Now Playing) ──
  // When the AI sends a mediaWidget via SSE, this holds the active widget
  // so a floating NowPlayingBar can render + auto-play across the whole app.
  activeMedia: Message['mediaWidget'] | null;
  setActiveMedia: (widget: NonNullable<Message['mediaWidget']>) => void;
  clearActiveMedia: () => void;

  // Auto Web Search Toggle
  autoWebSearch: boolean;
  setAutoWebSearch: (value: boolean) => void;

  // System Prompt Mode: 'full' = normal restricted mode, 'open' = unrestricted open mode
  systemPromptMode: 'full' | 'open';
  setSystemPromptMode: (mode: 'full' | 'open') => void;

  // Batch Processing State
  isBatchProcessing: boolean;
  batchProgress: BatchProgress | null;
  batchResults: BatchFileResult[];
  batchCrossAnalysis: string;

  // Document Generation State
  documentGenProgress: DocumentGenProgress | null;
  documentGenResult: DocumentGenResult | null;
  isGeneratingDocument: boolean;

  // Model Arena State
  arenaOpen: boolean;
  arenaResults: ArenaResult[];
  arenaStreaming: boolean;
  arenaVoted: boolean;

  // Quiz State
  quizOpen: boolean;
  /** Pre-generated quiz data from chat (auto-triggered quiz) */
  quizAutoData: { title: string; questions: Array<{ id: string; type: 'mcq' | 'true-false' | 'short-answer'; question: string; options?: string[]; correctAnswer: string; explanation?: string; difficulty: 'easy' | 'medium' | 'hard'; points: number }>; source?: 'chat' | 'files' } | null;
  quizGenStatus: string | null;
  /** Topic from slash command (e.g. /اختبار الذكاء الاصطناعي) to pre-fill in QuizGenerator */
  quizTopic: string;

  // Actions
  setActiveModel: (model: string) => void;
  setActiveLanguage: (lang: 'ar' | 'en' | 'egyptian') => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  createConversation: (title?: string) => Conversation;
  setActiveConversation: (id: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  updateMessageSearchResults: (conversationId: string, messageId: string, searchResults: SearchResult[]) => void;
  updateMessageWithImageGenStatus: (conversationId: string, messageId: string, status: string) => void;
  updateMessageWithGeneratedImage: (conversationId: string, messageId: string, images: Array<{ dataUrl: string; prompt: string }>) => void;
  updateMessageWithVideoGenStatus: (conversationId: string, messageId: string, status: string) => void;
  updateMessageWithGeneratedVideo: (conversationId: string, messageId: string, video: { videoUrl: string; prompt: string } | null) => void;
  updateMessageWithFileGenStatus: (conversationId: string, messageId: string, status: string) => void;
  updateMessageWithGeneratedFiles: (conversationId: string, messageId: string, files: Array<{ id: string; name: string; url: string; fileSize?: number; driveLink?: string }>) => void;
  deleteConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  clearConversations: () => void;
  setStreamingProgress: (progress: { stage: string; detail: string } | null) => void;
  sendMessage: (content: string, attachments?: File[], forceSearch?: boolean) => Promise<void>;
  loadConversations: () => Promise<void>;
  generatedFiles: Array<{ id: string; name: string; url: string; type: string; createdAt: string; size: number }>;
  addGeneratedFile: (file: { id: string; name: string; url: string; type: string; createdAt: string; size: number }) => void;
  removeGeneratedFile: (id: string) => void;

  // Batch Processing Actions
  processBatchFiles: (files: Array<{ name: string; content: string; type: string }>, language?: string) => Promise<void>;
  setBatchProgress: (progress: BatchProgress | null) => void;
  clearBatchResults: () => void;

  // Document Generation Actions
  setDocumentGenProgress: (progress: { stage: string; progress: number; detail: string } | null) => void;
  setDocumentGenResult: (result: DocumentGenResult | null) => void;
  clearDocumentGenState: () => void;

  // Model Arena Actions
  setArenaOpen: (open: boolean) => void;
  addArenaResult: (result: ArenaResult) => void;
  updateArenaResult: (modelId: string, content: string, done: boolean) => void;
  voteArenaResult: (modelId: string, vote: number) => void;
  clearArenaState: () => void;

  // Quiz Actions
  setQuizOpen: (open: boolean) => void;
  setQuizAutoData: (data: { title: string; questions: Array<{ id: string; type: 'mcq' | 'true-false' | 'short-answer'; question: string; options?: string[]; correctAnswer: string; explanation?: string; difficulty: 'easy' | 'medium' | 'hard'; points: number }>; source?: 'chat' | 'files' } | null) => void;
  setQuizGenStatus: (status: string | null) => void;
  setQuizTopic: (topic: string) => void;
}

const generateId = () => `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// ─── Module-level stream AbortController tracking ────────────────────
// This allows us to abort a previous stream when a new message is sent,
// preventing resource leaks and race conditions from stuck streams.
let activeStreamAbortController: AbortController | null = null;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get): ChatState => ({
      conversations: [],
      activeConversationId: null,
      activeModel: 'glm-4-flash-zai' as string | null, // V.19: Default to free ZAI model (عبس)
      activeLanguage: 'egyptian',
      isStreaming: false,
      streamingProgress: null,
      sidebarOpen: true,
      searchQuery: '',
      autoWebSearch: true, // البحث التلقائي في الويب — مُفعّل افتراضياً
      systemPromptMode: 'full', // وضع البرومبت — كامل افتراضياً
      generatedFiles: [],

      // ── Global Active Media (Now Playing) ──
      activeMedia: null,
      setActiveMedia: (widget) => set({ activeMedia: widget }),
      clearActiveMedia: () => set({ activeMedia: null }),

      // Batch Processing Initial State
      isBatchProcessing: false,
      batchProgress: null,
      batchResults: [],
      batchCrossAnalysis: '',

      // Document Generation Initial State
      documentGenProgress: null,
      documentGenResult: null,
      isGeneratingDocument: false,

      // Model Arena Initial State
      arenaOpen: false,
      arenaResults: [],
      arenaStreaming: false,
      arenaVoted: false,

      // Quiz Initial State
      quizOpen: false,
      quizAutoData: null,
      quizGenStatus: null,
      quizTopic: '',

      setActiveModel: (model: string) => {
        set({ activeModel: model });
      },

      setActiveLanguage: (lang: 'ar' | 'en' | 'egyptian') => {
        set({ activeLanguage: lang });
      },

      setSidebarOpen: (open: boolean) => {
        set({ sidebarOpen: open });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      createConversation: (title?: string) => {
        const { activeModel, activeLanguage } = get();
        const now = new Date().toISOString();
        const conversation: Conversation = {
          id: generateId(),
          title: title || null,
          model: activeModel,
          language: activeLanguage,
          isArchived: false,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
        }));
        return conversation;
      },

      setActiveConversation: (id: string) => {
        // When switching conversations, make sure we're not stuck in streaming
        // from a previous conversation that failed to complete
        // Also abort any active stream to prevent resource leaks
        if (activeStreamAbortController) {
          try {
            activeStreamAbortController.abort();
          } catch { /* ignore */ }
          activeStreamAbortController = null;
        }
        set((state) => ({
          activeConversationId: id,
          // Reset streaming if we're switching away from a streaming conversation
          ...(state.isStreaming ? { isStreaming: false, streamingProgress: null } : {}),
        }));
      },

      addMessage: (conversationId: string, message: Message) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, messages: [...conv.messages, message], updatedAt: new Date().toISOString() }
              : conv
          ),
        }));
      },

      updateMessage: (conversationId: string, messageId: string, content: string) => {
        // V.18: Fast streaming update — avoid full conversations.map for every chunk
        // Instead, find the conversation + message by index and mutate in place.
        // This prevents React from batching all chunks into a single render.
        set((state) => {
          const convIdx = state.conversations.findIndex((c) => c.id === conversationId);
          if (convIdx === -1) return state;
          const conv = state.conversations[convIdx];
          const msgIdx = conv.messages.findIndex((m) => m.id === messageId);
          if (msgIdx === -1) return state;

          // Create new arrays only for the affected conversation (shallow copy others)
          const newConversations = state.conversations.slice();
          const newMessages = conv.messages.slice();
          newMessages[msgIdx] = {
            ...newMessages[msgIdx],
            content: content ?? newMessages[msgIdx].content,
            updatedAt: new Date().toISOString(),
          };
          newConversations[convIdx] = {
            ...conv,
            messages: newMessages,
            updatedAt: new Date().toISOString(),
          };
          return { conversations: newConversations };
        });
      },

      // ─── Update message search results (from auto web search) ────────
      updateMessageSearchResults: (conversationId: string, messageId: string, searchResults: SearchResult[]) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) => {
                    if (msg.id !== messageId) return msg;
                    return {
                      ...msg,
                      searchResults,
                      updatedAt: new Date().toISOString(),
                    };
                  }),
                  updatedAt: new Date().toISOString(),
                }
              : conv
          ),
        }));
      },

      // ─── Update message with image generation status ────────
      updateMessageWithImageGenStatus: (conversationId: string, messageId: string, status: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, imageGenStatus: status } : msg
                  ),
                }
              : conv
          ),
        }));
      },

      // ─── Update message with generated images ────────
      updateMessageWithGeneratedImage: (conversationId: string, messageId: string, images: Array<{ dataUrl: string; prompt: string }>) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, generatedImages: images, imageGenStatus: null } : msg
                  ),
                }
              : conv
          ),
        }));
      },

      // ─── Update message with video generation status ────────
      updateMessageWithVideoGenStatus: (conversationId: string, messageId: string, status: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, videoGenStatus: status } : msg
                  ),
                }
              : conv
          ),
        }));
      },

      // ─── Update message with generated video ────────
      updateMessageWithGeneratedVideo: (conversationId: string, messageId: string, video: { videoUrl: string; prompt: string } | null) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, generatedVideo: video, videoGenStatus: null } : msg
                  ),
                }
              : conv
          ),
        }));
      },

      // ─── Update message with file generation status ────────
      updateMessageWithFileGenStatus: (conversationId: string, messageId: string, status: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, fileGenStatus: status } : msg
                  ),
                }
              : conv
          ),
        }));
      },

      // ─── Update message with generated files ────────
      updateMessageWithGeneratedFiles: (conversationId: string, messageId: string, files: Array<{ id: string; name: string; url: string; fileSize?: number; driveLink?: string }>) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, generatedFiles: files, fileGenStatus: files.length > 0 ? 'ready' : 'failed' } : msg
                  ),
                }
              : conv
          ),
        }));
      },

      // ─── Auto Web Search Toggle ──────────────────────────────────────
      setAutoWebSearch: (value: boolean) => {
        set({ autoWebSearch: value });
      },

      // ─── System Prompt Mode Toggle ────────────────────────────────────
      setSystemPromptMode: (mode: 'full' | 'open') => {
        set({ systemPromptMode: mode });
      },

      deleteConversation: (id: string) => {
        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
          activeConversationId:
            state.activeConversationId === id ? null : state.activeConversationId,
        }));
      },

      archiveConversation: (id: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, isArchived: !conv.isArchived } : conv
          ),
        }));
      },

      clearConversations: () => {
        set({ conversations: [], activeConversationId: null });
      },

      setStreamingProgress: (progress: { stage: string; detail: string } | null) => {
        if (!progress) {
          set({ streamingProgress: null });
          return;
        }
        set((state) => {
          const prev = state.streamingProgress;
          // If same stage, just update detail
          if (prev && prev.stage === progress.stage) {
            return {
              streamingProgress: {
                stage: progress.stage,
                detail: progress.detail,
                history: prev.history,
              },
            };
          }
          // New stage — add previous stage to history
          const newHistory = prev
            ? [...prev.history, { stage: prev.stage, detail: prev.detail, timestamp: Date.now() }]
            : [];
          return {
            streamingProgress: {
              stage: progress.stage,
              detail: progress.detail,
              history: newHistory,
            },
          };
        });
      },

      addGeneratedFile: (file) => {
        set((state) => ({ generatedFiles: [file, ...state.generatedFiles] }));
      },

      removeGeneratedFile: (id) => {
        set((state) => ({ generatedFiles: state.generatedFiles.filter((f) => f.id !== id) }));
      },

      sendMessage: async (content: string, attachments?: File[], forceSearch?: boolean) => {
        const {
          activeConversationId,
          activeModel,
          activeLanguage,
          autoWebSearch,
          systemPromptMode,
          createConversation,
          addMessage,
        } = get();

        // ─── Safety guard: Reset stuck isStreaming AND abort previous stream ────
        // If isStreaming was left true from a previous failed attempt, force-reset it
        // Also abort any in-flight stream to prevent resource leaks and race conditions
        if (get().isStreaming) {
          console.warn('[Chat] isStreaming was stuck — force resetting before new message');
          // Abort the previous stream's fetch so its reader stops consuming
          if (activeStreamAbortController) {
            try {
              activeStreamAbortController.abort();
              console.warn('[Chat] Aborted previous stream AbortController');
            } catch { /* ignore */ }
            activeStreamAbortController = null;
          }
          set({ isStreaming: false, streamingProgress: null });
        }

        // Get or create conversation
        let conversationId = activeConversationId;
        if (!conversationId) {
          const conv = createConversation();
          conversationId = conv.id;
        }

        const now = new Date().toISOString();

        // Strip large base64 data from content for local storage to prevent
        // localStorage overflow. Keep the full content for the API request.
        const stripBase64ForStorage = (msg: string): string => {
          let cleaned = msg;
          // Strip [DELTA_IMAGE:...] markers (keep the header line)
          cleaned = cleaned.replace(
            /📷 صورة مرفقة: (.+?) \((.+?)\)\n\[DELTA_IMAGE:[^\]]+\]/g,
            '📷 صورة مرفقة: $1 ($2)'
          );
          // Strip [DELTA_PDF:...] markers (keep the header line)
          cleaned = cleaned.replace(
            /📄 ملف PDF مرفق: (.+?) \((.+?)\)\n\[DELTA_PDF:[^\]]+\]/g,
            '📄 ملف PDF مرفق: $1 ($2)'
          );
          return cleaned;
        };

        // Add user message (with base64 stripped for storage)
        const displayContent = stripBase64ForStorage(content);
        const userMessage: Message = {
          id: generateId(),
          content: displayContent,
          role: 'user',
          language: activeLanguage,
          createdAt: now,
          updatedAt: now,
        };
        addMessage(conversationId, userMessage);

        // Create placeholder assistant message
        const assistantMessage: Message = {
          id: generateId(),
          content: '',
          role: 'assistant',
          model: activeModel,
          language: activeLanguage,
          createdAt: now,
          updatedAt: now,
        };
        addMessage(conversationId, assistantMessage);

        set({ isStreaming: true });

        // ─── Safety net: Auto-reset isStreaming after 20 minutes ──────────
        // This prevents the chat from getting permanently stuck if the stream
        // fails silently or the connection drops without proper cleanup.
        // 20 minutes matches the backend inactivity timeout — only triggers
        // after 20 minutes of ZERO activity (tokens, heartbeats, etc.)
        const safetyNetId = setTimeout(() => {
          if (get().isStreaming) {
            console.error('[Chat] Safety net: isStreaming stuck for 20min — force resetting');
            // Also abort the stream controller
            if (activeStreamAbortController) {
              try { activeStreamAbortController.abort(); } catch { /* ignore */ }
              activeStreamAbortController = null;
            }
            set({ isStreaming: false, streamingProgress: null });
          }
        }, 20 * 60 * 1000);

        // ─── AbortController for fetch timeout ────────────────────────────
        // Track this as the active stream controller so we can abort it later
        const abortController = new AbortController();
        activeStreamAbortController = abortController;
        // 10min timeout for INITIAL connection — cancelled once response headers arrive
        // كان 90s بس الـ pre-scan + tool-calling + PDF gen + Drive upload بياخدوا أكتر من كده
        const fetchTimeoutId = setTimeout(() => {
          abortController.abort();
        }, 600_000);

        try {
          const token = useAuthStore.getState().token;

          const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              message: content,
              model: activeModel,
              language: activeLanguage,
              conversationId,
              autoSearch: forceSearch ? true : autoWebSearch,
              forceSearch: forceSearch || false,
              systemPromptMode,
            }),
            signal: abortController.signal,
          });

          // Clear the fetch timeout once we get a response
          clearTimeout(fetchTimeoutId);

          if (!response.ok) {
            // Try to read the actual error message from the response body
            let errorMsg = `خطأ في الاتصال (${response.status})`;
            try {
              const errorData = await response.json();
              if (errorData.error) {
                errorMsg = errorData.error;
              } else if (errorData.details) {
                errorMsg = errorData.details;
              }
            } catch {
              // Can't parse JSON — try reading as text
              try {
                const text = await response.text();
                if (text && text.length < 200) {
                  errorMsg = text;
                }
              } catch {
                // Can't read response body either
              }
            }
            throw new Error(errorMsg);
          }

          // Capture the server-assigned conversation ID from the response header
          const serverConversationId = response.headers.get('X-Conversation-Id');
          if (serverConversationId && serverConversationId !== conversationId) {
            // Update the local conversation ID to match the server's ID
            // This ensures subsequent messages use the correct DB conversation ID
            set((state) => ({
              conversations: state.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, id: serverConversationId }
                  : c
              ),
              activeConversationId: serverConversationId,
            }));
            conversationId = serverConversationId;
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulatedContent = '';
          // ─── SSE buffer for handling data split across chunks ───────────
          let sseBuffer = '';
          // ─── Stream activity tracker ────────────────────────────────────
          // If no data (tokens OR heartbeats) arrives for 20 minutes, assume the stream is dead.
          // Heartbeats from the backend arrive every 15s, so even if the model pauses
          // to think, the activity timer keeps getting reset. Only 20min of true silence
          // (no tokens AND no heartbeats) triggers the watchdog.
          let lastActivityTime = Date.now();
          const streamWatchdog = setInterval(() => {
            if (Date.now() - lastActivityTime > 20 * 60 * 1000) {
              console.error('[Chat] Stream watchdog: No data for 20min — closing stream');
              clearInterval(streamWatchdog);
              try { reader.cancel(); } catch { /* ignore */ }
            }
          }, 30_000); // Check every 30 seconds instead of every 5s

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              lastActivityTime = Date.now(); // Track activity

              const chunk = decoder.decode(value, { stream: true });
              sseBuffer += chunk;

              // Process complete SSE lines from the buffer
              const lines = sseBuffer.split('\n');
              // Keep the last incomplete line in the buffer
              sseBuffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();

                  if (data === '[DONE]') {
                    continue; // Don't break — process remaining lines
                  }

                  try {
                    const parsed = JSON.parse(data);
                    // Progress events removed — no longer sent from backend for speed
                    // Handle document generation progress events from chat stream
                    if (parsed.docProgress) {
                      get().setDocumentGenProgress(parsed.docProgress);
                    }
                    // Handle document generation result from chat stream
                    if (parsed.docResult) {
                      get().setDocumentGenResult(parsed.docResult);
                    }
                    // Handle search results from auto web search
                    if (parsed.searchResults) {
                      get().updateMessageSearchResults(conversationId, assistantMessage.id, parsed.searchResults);
                    }
                    // Handle media widget (radio, spotify, youtube, tts)
                    if (parsed.mediaWidget) {
                      set((state) => ({
                        conversations: state.conversations.map((conv) =>
                          conv.id === conversationId
                            ? {
                                ...conv,
                                messages: conv.messages.map((msg) =>
                                  msg.id === assistantMessage.id
                                    ? { ...msg, mediaWidget: parsed.mediaWidget }
                                    : msg
                                ),
                              }
                            : conv
                        ),
                      }));
                      // ── V.15: Also set as global active media ──
                      // This triggers the floating NowPlayingBar to render
                      // and auto-play the media across the whole app.
                      get().setActiveMedia(parsed.mediaWidget);
                      // Dispatch a global event so SmartBall + other listeners react
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('anzaro-media-play', { detail: parsed.mediaWidget }));
                      }
                    }
                    // ── V.15: STOP media — clear the active media + stop all audio ──
                    if (parsed.stopMedia) {
                      get().clearActiveMedia();
                      if (typeof window !== 'undefined') {
                        // Pause ALL audio/video elements on the page
                        document.querySelectorAll('audio, video').forEach((el) => {
                          try { (el as HTMLMediaElement).pause(); } catch {}
                        });
                        window.dispatchEvent(new CustomEvent('anzaro-media-stop'));
                      }
                    }
                    // Handle inline image generation status
                    if (parsed.imageGenStatus) {
                      // Update the message with image generation status
                      get().updateMessageWithImageGenStatus(conversationId, assistantMessage.id, parsed.imageGenStatus);
                    }
                    // Handle inline generated image
                    if (parsed.generatedImage) {
                      const currentConv = get().conversations.find(c => c.id === conversationId);
                      const currentMsg = currentConv?.messages.find(m => m.id === assistantMessage.id);
                      const existingImages = currentMsg?.generatedImages || [];
                      get().updateMessageWithGeneratedImage(conversationId, assistantMessage.id, [...existingImages, parsed.generatedImage]);
                    }
                    // Handle inline video generation status
                    if (parsed.videoGenStatus) {
                      get().updateMessageWithVideoGenStatus(conversationId, assistantMessage.id, parsed.videoGenStatus);
                    }
                    // Handle inline generated video
                    if (parsed.generatedVideo) {
                      get().updateMessageWithGeneratedVideo(conversationId, assistantMessage.id, parsed.generatedVideo);
                    }
                    // Handle file generation status (PDF etc.)
                    if (parsed.fileGenStatus) {
                      get().updateMessageWithFileGenStatus(conversationId, assistantMessage.id, parsed.fileGenStatus);
                    }
                    // Handle fileAssetId — the backend created a pending DB record
                    // We'll use this to poll for the specific asset
                    if (parsed.fileAssetId) {
                      // Store the asset ID on the message for polling
                      set((state) => ({
                        conversations: state.conversations.map((conv) =>
                          conv.id === conversationId
                            ? {
                                ...conv,
                                messages: conv.messages.map((msg) =>
                                  msg.id === assistantMessage.id
                                    ? { ...msg, fileAssetId: parsed.fileAssetId }
                                    : msg
                                ),
                              }
                            : conv
                        ),
                      }));
                      console.log(`[Chat Store] File asset ID received: ${parsed.fileAssetId}`);
                    }
                    // Handle fileReady event — file generated directly in-stream (no polling needed)
                    if (parsed.fileReady) {
                      const file = parsed.fileReady;
                      get().updateMessageWithGeneratedFiles(conversationId, assistantMessage.id, [{
                        id: file.id || `file-${Date.now()}`,
                        name: file.name || 'مستند',
                        url: file.url,
                        fileSize: file.fileSize,
                        driveLink: file.driveLink,
                      }]);
                      console.log(`[Chat Store] File received via SSE: ${file.name}`);
                    }
                    // Handle smart document pipeline progress events
                    if (parsed.smartDocStatus) {
                      const status = parsed.smartDocStatus;
                      if (status === 'started') {
                        get().setDocumentGenProgress({ stage: 'analyzing', progress: 5, detail: parsed.message || 'جاري تحليل الملفات...' });
                      } else if (status === 'failed' || status === 'error') {
                        get().setDocumentGenProgress({ stage: 'error', progress: 0, detail: parsed.message || 'حدث خطأ' });
                      }
                    }
                    if (parsed.smartDocProgress) {
                      const { stage, progress, message, detail } = parsed.smartDocProgress;
                      get().setDocumentGenProgress({ stage, progress, detail: message || detail || '' });
                    }
                    if (parsed.smartDocResult) {
                      const result = parsed.smartDocResult;
                      if (result.success) {
                        get().setDocumentGenResult({
                          fileUrl: result.fileUrl,
                          fileName: result.fileName,
                          docType: result.docType || 'pdf',
                          durationMs: result.durationMs,
                        });
                        // Add to generated files
                        get().addGeneratedFile({
                          id: `smart-doc-${Date.now()}`,
                          name: result.fileName || 'مستند',
                          url: result.fileUrl,
                          type: 'document',
                          createdAt: new Date().toISOString(),
                          size: 0,
                        });
                        get().setDocumentGenProgress({ stage: 'completed', progress: 100, detail: 'تم إنشاء المستند بنجاح!' });
                        // Auto-open PDF in new tab
                        if (result.fileUrl) {
                          const serveUrl = result.fileUrl.includes('/api/pdf/serve/')
                            ? result.fileUrl
                            : `/api/pdf/serve/${result.fileUrl.split('/').pop()}`;
                          window.open(serveUrl, '_blank', 'noopener,noreferrer');
                        }
                      }
                    }
                    // Handle content replacement (HTML stripped to markdown)
                    if (parsed.contentReplace) {
                      accumulatedContent = parsed.contentReplace;
                      get().updateMessage(conversationId, assistantMessage.id, accumulatedContent);
                    }
                    // Handle quiz generation status
                    if (parsed.quizGenStatus) {
                      get().setQuizGenStatus(parsed.quizGenStatus);
                    }
                    // Handle auto-generated quiz data from chat
                    if (parsed.quizData) {
                      get().setQuizAutoData(parsed.quizData);
                    }
                    if (parsed.content) {
                      accumulatedContent += parsed.content;
                      get().updateMessage(conversationId, assistantMessage.id, accumulatedContent);
                    }
                    // Backend status (tool-calling UX) — يظهر فوق الرد
                    if (parsed.backendStatus) {
                      const msgs = get().conversations.find(c => c.id === conversationId)?.messages ?? [];
                      msgs.map((m) => m.id === assistantMessage.id ? { ...m, backendStatus: parsed.backendStatus, backendPhase: parsed.phase ?? null } : m);
                      // Use direct state update
                      set((state) => ({
                        conversations: state.conversations.map((conv) =>
                          conv.id === conversationId
                            ? { ...conv, messages: conv.messages.map((msg) =>
                                msg.id === assistantMessage.id ? { ...msg, backendStatus: parsed.backendStatus, backendPhase: parsed.phase ?? null } : msg
                              )}
                            : conv
                        ),
                      }));
                    }
                    if (parsed.error) {
                      accumulatedContent += `\n\n❌ ${parsed.error}`;
                      get().updateMessage(conversationId, assistantMessage.id, accumulatedContent);
                    }
                  } catch {
                    // If not JSON, treat as plain text content
                    if (data && data !== '[DONE]') {
                      accumulatedContent += data;
                      get().updateMessage(conversationId, assistantMessage.id, accumulatedContent);
                    }
                  }
                }
              }
            }
          } finally {
            clearInterval(streamWatchdog);
          }

          // If no content was received, set a fallback
          if (!accumulatedContent) {
            get().updateMessage(
              conversationId,
              assistantMessage.id,
              'الموديل ده مش متاح حالياً. جرّب موديل تاني من القائمة اللي فوق — عبس (GLM-5) أو GLM-4-Flash مجانيين وشغالين. ✅'
            );
          }

          // Auto-generate title from first message if no title
          const conv = get().conversations.find((c) => c.id === conversationId);
          if (conv && !conv.title && conv.messages.length >= 2) {
            set((state) => ({
              conversations: state.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, title: displayContent.slice(0, 50) + (displayContent.length > 50 ? '...' : '') }
                  : c
              ),
            }));
          }

          // ── Poll for generated files if file generation was requested ──
          // The backend creates a "pending" DB record and sends the asset ID via SSE.
          // We poll for that specific asset until it's ready or failed.
          const currentMsg = conv?.messages.find(m => m.id === assistantMessage.id);
          if (currentMsg?.fileGenStatus === 'generating' && token) {
            // Check if files were already received via SSE (fileReady event)
            const updatedMsg = get().conversations.find(c => c.id === conversationId)?.messages.find(m => m.id === assistantMessage.id);
            if (updatedMsg?.generatedFiles && updatedMsg.generatedFiles.length > 0) {
              console.log('[Chat Store] Files already received via SSE, skipping polling');
            } else {
              // Get the asset ID that was sent via SSE
              const assetId = updatedMsg?.fileAssetId;
              // Poll up to 30 times with 5-second intervals (max ~150s wait)
              let foundFiles = false;
              for (let attempt = 0; attempt < 30; attempt++) {
                await new Promise(r => setTimeout(r, 5000));
                // Re-check if files arrived via SSE in the meantime
                const latestMsg = get().conversations.find(c => c.id === conversationId)?.messages.find(m => m.id === assistantMessage.id);
                if (latestMsg?.generatedFiles && latestMsg.generatedFiles.length > 0) {
                  foundFiles = true;
                  break;
                }
                try {
                  // If we have the specific asset ID, poll for that asset
                  if (assetId) {
                    const assetRes = await fetch(`/api/chat/files?assetId=${assetId}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (assetRes.ok) {
                      const assetData = await assetRes.json();
                      if (assetData.success && assetData.asset) {
                        const asset = assetData.asset;
                        const metadata = asset.metadata ? JSON.parse(asset.metadata) : {};
                        if (metadata.status === 'ready' && metadata.fileUrl) {
                          get().updateMessageWithGeneratedFiles(conversationId, assistantMessage.id, [{
                            id: asset.id,
                            name: asset.title || 'ملف',
                            url: metadata.fileUrl,
                            fileSize: asset.fileSize,
                            driveLink: metadata.driveLink,
                          }]);
                          foundFiles = true;
                          break;
                        } else if (metadata.status === 'failed' || asset.type === 'failed') {
                          get().updateMessageWithFileGenStatus(conversationId, assistantMessage.id, 'failed');
                          foundFiles = false;
                          break;
                        }
                        // Otherwise status is 'generating' — keep polling
                      }
                    }
                  } else {
                    // Fallback: poll all files (timestamp-based)
                    const filesRes = await fetch('/api/chat/files', {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (filesRes.ok) {
                      const filesData = await filesRes.json();
                      if (filesData.success && filesData.files?.length > 0) {
                        const msgTime = new Date(assistantMessage.createdAt).getTime();
                        const newFiles = filesData.files
                          .filter((f: { id: string; title?: string; filePath?: string; fileUrl?: string; fileSize?: number; driveLink?: string; createdAt: string; type?: string }) =>
                            f.type !== 'pending' && f.type !== 'failed' && new Date(f.createdAt).getTime() >= msgTime - 2000)
                          .map((f: { id: string; title?: string; filePath?: string; fileUrl?: string; fileSize?: number; driveLink?: string }) => ({
                            id: f.id,
                            name: f.title || f.filePath?.split('/').pop() || 'ملف',
                            url: f.fileUrl || `/api/pdf/serve/${encodeURIComponent(f.filePath?.split('/').pop() || '')}`,
                            fileSize: f.fileSize,
                            driveLink: f.driveLink,
                          }));
                        if (newFiles.length > 0) {
                          get().updateMessageWithGeneratedFiles(conversationId, assistantMessage.id, newFiles);
                          foundFiles = true;
                          break;
                        }
                      }
                    }
                  }
                } catch {
                  // Poll failed — try again
                }
              }
              if (!foundFiles) {
                get().updateMessageWithFileGenStatus(conversationId, assistantMessage.id, 'failed');
              }
            }
          }
        } catch (error) {
          // Fallback response on error
          const isAbort = error instanceof Error && error.name === 'AbortError';
          const fallbackContent = isAbort
            ? '⚠️ انتهت مهلة الاتصال. حاول مرة أخرى! 🔄'
            : error instanceof Error
              ? `❌ حصلت مشكلة: ${error.message}. حاول تاني! 🔄`
              : '❌ حصلت مشكلة غير متوقعة. حاول تاني! 🔄';

          get().updateMessage(conversationId, assistantMessage.id, fallbackContent);
        } finally {
          clearTimeout(safetyNetId);
          clearTimeout(fetchTimeoutId);
          // Clear the active stream reference if it's still ours
          if (activeStreamAbortController === abortController) {
            activeStreamAbortController = null;
          }
          set({ isStreaming: false, streamingProgress: null });
        }
      },

      // ─── Batch Processing Actions ────────────────────────────────────
      setBatchProgress: (progress: BatchProgress | null) => {
        set({ batchProgress: progress });
      },

      clearBatchResults: () => {
        set({ batchResults: [], batchCrossAnalysis: '', batchProgress: null, isBatchProcessing: false });
      },

      // ─── Document Generation Actions ──────────────────────────────────
      setDocumentGenProgress: (progress) => {
        if (!progress) {
          set({ documentGenProgress: null, isGeneratingDocument: false });
          return;
        }
        set((state) => {
          const prev = state.documentGenProgress;
          // If same stage, just update detail and progress
          if (prev && prev.stage === progress.stage) {
            return {
              documentGenProgress: {
                ...prev,
                progress: progress.progress,
                detail: progress.detail,
              },
              isGeneratingDocument: true,
            };
          }
          // New stage — add previous stage to history
          const newHistory = prev
            ? [...prev.history, { stage: prev.stage, detail: prev.detail, timestamp: Date.now() }]
            : [];
          return {
            documentGenProgress: {
              stage: progress.stage,
              progress: progress.progress,
              detail: progress.detail,
              history: newHistory,
            },
            isGeneratingDocument: true,
          };
        });
      },

      setDocumentGenResult: (result) => {
        set({
          documentGenResult: result,
          isGeneratingDocument: false,
        });
      },

      clearDocumentGenState: () => {
        set({
          documentGenProgress: null,
          documentGenResult: null,
          isGeneratingDocument: false,
        });
      },

      // ─── Model Arena Actions ────────────────────────────────────────────
      setArenaOpen: (open: boolean) => {
        set({ arenaOpen: open });
      },

      addArenaResult: (result: ArenaResult) => {
        set((state) => ({
          arenaResults: [...state.arenaResults, result],
        }));
      },

      updateArenaResult: (modelId: string, content: string, done: boolean) => {
        set((state) => ({
          arenaResults: state.arenaResults.map((r) =>
            r.modelId === modelId ? { ...r, content, done } : r
          ),
        }));
      },

      voteArenaResult: (modelId: string, vote: number) => {
        set((state) => ({
          arenaResults: state.arenaResults.map((r) =>
            r.modelId === modelId ? { ...r, vote } : r
          ),
          arenaVoted: true,
        }));
      },

      clearArenaState: () => {
        set({
          arenaResults: [],
          arenaStreaming: false,
          arenaVoted: false,
        });
      },

      // ─── Quiz Actions ────────────────────────────────────────────────
      setQuizOpen: (open: boolean) => {
        set({ quizOpen: open });
      },
      setQuizAutoData: (data) => {
        set({ quizAutoData: data, quizOpen: true, quizGenStatus: null });
      },
      setQuizGenStatus: (status: string | null) => {
        set({ quizGenStatus: status });
      },
      setQuizTopic: (topic: string) => {
        set({ quizTopic: topic });
      },

      processBatchFiles: async (
        files: Array<{ name: string; content: string; type: string }>,
        language?: string
      ) => {
        const { activeConversationId, activeLanguage, createConversation, addMessage } = get();

        // Get or create conversation
        let conversationId = activeConversationId;
        if (!conversationId) {
          const conv = createConversation();
          conversationId = conv.id;
        }

        const now = new Date().toISOString();

        // Add user message showing the batch
        const fileNames = files.map((f) => f.name).join('، ');
        const userContent = `🔍 تحليل شامل وملف مجمع لـ ${files.length} ملفات:\n${fileNames}`;
        const userMessage: Message = {
          id: generateId(),
          content: userContent,
          role: 'user',
          language: activeLanguage,
          createdAt: now,
          updatedAt: now,
        };
        addMessage(conversationId, userMessage);

        // Create placeholder assistant message for batch results
        const assistantMessage: Message = {
          id: generateId(),
          content: '',
          role: 'assistant',
          model: 'delta-batch-analyzer',
          language: activeLanguage,
          createdAt: now,
          updatedAt: now,
        };
        addMessage(conversationId, assistantMessage);

        set({ isBatchProcessing: true, isStreaming: true, batchProgress: { stage: 'initializing', detail: 'جاري تحضير التحليل الشامل...', current: 0, total: files.length }, streamingProgress: { stage: 'initializing', detail: 'جاري تحضير التحليل الشامل...', history: [] } });

        try {
          const token = useAuthStore.getState().token;
          const resolvedLanguage = language || activeLanguage;

          // ═══════════════════════════════════════════════════════════════════
          // PHASE 0: Extract text from PDF files via multipart upload
          // This avoids sending huge base64 JSON payloads that exceed server limits.
          // Multipart form data handles large files without body size issues.
          // ═══════════════════════════════════════════════════════════════════
          set({ batchProgress: { stage: 'extracting', detail: 'جاري استخراج النص من الملفات...', current: 0, total: files.length }, streamingProgress: { stage: 'extracting', detail: 'جاري استخراج النص من الملفات...', history: [] } });

          let extractedFiles = files;
          const hasPdfFiles = files.some(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

          if (hasPdfFiles) {
            try {
              // Convert base64 data URIs back to File objects for multipart upload
              const formData = new FormData();
              for (const f of files) {
                if (f.content && f.content.startsWith('data:')) {
                  // Base64 data URI → File object
                  const [meta, base64Data] = f.content.split(',');
                  const mimeMatch = meta.match(/data:([^;]+)/);
                  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                  const byteChars = atob(base64Data);
                  const byteArrays: Uint8Array[] = [];
                  const sliceSize = 8192;
                  for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
                    const slice = byteChars.slice(offset, offset + sliceSize);
                    const byteNumbers = new Array(slice.length);
                    for (let i = 0; i < slice.length; i++) {
                      byteNumbers[i] = slice.charCodeAt(i);
                    }
                    byteArrays.push(new Uint8Array(byteNumbers));
                  }
                  const blob = new Blob(byteArrays, { type: mime });
                  formData.append('files', blob, f.name);
                } else {
                  // Plain text content → File object
                  const blob = new Blob([f.content], { type: f.type || 'text/plain' });
                  formData.append('files', blob, f.name);
                }
              }

              const extractResponse = await fetch('/api/files/extract-batch', {
                method: 'POST',
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: formData,
              });

              if (extractResponse.ok) {
                const extractData = await extractResponse.json();
                if (extractData.success && extractData.files) {
                  // Replace files with extracted text versions
                  extractedFiles = extractData.files.map((ef: { name: string; content: string; type: string; size: number }) => ({
                    name: ef.name,
                    content: ef.content,
                    type: ef.type || 'text/plain',
                    size: ef.size,
                  }));
                  console.log(`[BatchStore] Text extraction: ${extractedFiles.length} files, total ${extractData.totalChars} chars`);
                }
              } else {
                console.warn('[BatchStore] Text extraction failed, using original files');
              }
            } catch (extractErr) {
              console.warn('[BatchStore] Text extraction error:', extractErr);
              // Continue with original files as fallback
            }
          }

          // ═══════════════════════════════════════════════════════════════════
          // PHASE 1: Run batch analysis (quick LLM-based summary per file)
          // ═══════════════════════════════════════════════════════════════════
          const response = await fetch('/api/chat/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              files: extractedFiles,
              language: resolvedLanguage === 'egyptian' ? 'ar' : resolvedLanguage,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'فشل في معالجة الدفعة');
          }

          if (!response.body) throw new Error('No response body');

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulatedResults: BatchFileResult[] = [];
          let crossAnalysis = '';

          let streamDone = false;
          while (!streamDone) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') { streamDone = true; break; }

                try {
                  const parsed = JSON.parse(data);

                  // Update progress
                  if (parsed.stage) {
                    set({
                      batchProgress: {
                        stage: parsed.stage,
                        detail: parsed.detail || '',
                        current: parsed.current || 0,
                        total: parsed.total || files.length,
                        partialResult: parsed.partialResult,
                      },
                    });

                    // Also update streaming progress for the ProgressIndicator
                    get().setStreamingProgress({
                      stage: parsed.stage,
                      detail: parsed.detail || '',
                    });
                  }

                  // Collect partial results
                  if (parsed.partialResult) {
                    accumulatedResults = accumulatedResults.filter(
                      (r) => r.fileName !== parsed.partialResult.fileName
                    );
                    accumulatedResults.push(parsed.partialResult);
                    set({ batchResults: [...accumulatedResults] });
                  }

                  // Final results
                  if (parsed.results) {
                    set({ batchResults: parsed.results });
                    accumulatedResults = parsed.results;
                  }

                  // Cross analysis
                  if (parsed.crossAnalysis) {
                    crossAnalysis = parsed.crossAnalysis;
                    set({ batchCrossAnalysis: crossAnalysis });
                  }
                } catch {
                  // Skip unparseable lines
                }
              }
            }
          }

          // Build final formatted message from batch results
          const formattedParts: string[] = [];
          formattedParts.push(`# 🔬 تحليل شامل لـ ${files.length} ملفات\n`);

          for (const result of accumulatedResults) {
            formattedParts.push(`---\n## 📄 ${result.fileName}\n`);
            formattedParts.push(result.summary);
            if (result.keyConcepts.length > 0) {
              formattedParts.push(`\n**المفاهيم الرئيسية:** ${result.keyConcepts.join(' • ')}`);
            }
            if (result.questions.length > 0) {
              formattedParts.push(`\n**أسئلة بحثية:**`);
              result.questions.forEach((q, i) => {
                formattedParts.push(`${i + 1}. ${q}`);
              });
            }
            if (result.connections.length > 0) {
              formattedParts.push(`\n**الروابط:** ${result.connections.join(' • ')}`);
            }
          }

          if (crossAnalysis) {
            formattedParts.push(`\n---\n## 🔗 التحليل الشامل للروابط\n`);
            formattedParts.push(crossAnalysis);
          }

          const analysisContent = formattedParts.join('\n');
          get().updateMessage(conversationId, assistantMessage.id, analysisContent || '⚠️ لم يتم إنتاج تحليل.');

          // ═══════════════════════════════════════════════════════════════════
          // PHASE 2: Auto-generate compiled PDF document from the uploaded files
          // ═══════════════════════════════════════════════════════════════════
          const previousHistory = get().streamingProgress?.history || [];
          const previousDocHistory = get().documentGenProgress?.history || [];
          set({
            isBatchProcessing: true,
            isStreaming: true,
            batchProgress: {
              stage: 'generating-document',
              detail: 'جاري إنشاء المستند المجمع من الملفات...',
              current: 0,
              total: files.length,
            },
            streamingProgress: {
              stage: 'generating-document',
              detail: 'جاري إنشاء المستند المجمع من الملفات...',
              history: [...previousHistory],
            },
            isGeneratingDocument: true,
            documentGenProgress: {
              stage: 'generating-document',
              progress: 5,
              detail: 'جاري إنشاء المستند المجمع من الملفات...',
              history: [...previousDocHistory],
            },
          });

          // FIX #1: Use already-extracted text from Phase 1 instead of raw base64 content
          // Phase 1 (batch analysis) already extracted and summarized the content.
          // Sending raw base64 PDFs would create 50-100+ MB request bodies causing timeouts.
          const lectures = files.map((f) => {
            const extracted = accumulatedResults.find((r) => r.fileName === f.name);
            return {
              title: f.name.replace(/\.[^.]+$/, ''),
              content: extracted?.summary
                ? `## ملخص التحليل\n${extracted.summary}\n\n**المفاهيم الرئيسية:** ${extracted.keyConcepts?.join(' • ') || 'لا يوجد'}\n\n**الروابط:** ${extracted.connections?.join(' • ') || 'لا يوجد'}\n\n${extracted.questions?.length ? '**أسئلة بحثية:**\n' + extracted.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') : ''}`
                : f.content,
            };
          });

          const docResponse = await fetch('/api/ai/hf/document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              mode: 'batch',
              topic: files.map(f => f.name.replace(/\.[^.]+$/, '')).join(' + ') || 'ملخص محاضرات',
              lectures,
              language: resolvedLanguage === 'egyptian' ? 'ar' : resolvedLanguage,
              channelName: 'بعقل هادي',
              includeAiImages: false,
            }),
          });

          if (docResponse.ok) {
            const docData = await docResponse.json();

            if (docData.success && docData.fileUrl) {
              // Document generated successfully — add download link to the message
              const serveUrl = docData.fileUrl.includes('/api/pdf/serve/')
                ? docData.fileUrl
                : `/api/pdf/serve/${docData.fileUrl.split('/').pop()}`;

              const docLink = `\n\n---\n## 📥 الملف المجمع جاهز!\n\n**[${docData.fileName || 'ملخص_محاضرات.pdf'}](${serveUrl})**\n\n> ✅ تم إنشاء مستند PDF مجمع من ${files.length} ملفات. اضغط على الرابط لفتح أو تحميل الملف.\n`;

              get().updateMessage(conversationId, assistantMessage.id, analysisContent + docLink);

              // Store the generated file
              get().addGeneratedFile({
                id: `batch-doc-${Date.now()}`,
                name: docData.fileName || 'ملخص_محاضرات.pdf',
                url: serveUrl,
                type: 'document',
                createdAt: new Date().toISOString(),
                size: 0,
              });

              // Update document gen state for UI display
              set({
                documentGenProgress: {
                  stage: 'completed',
                  progress: 100,
                  detail: 'تم إنشاء المستند المجمع بنجاح!',
                  history: [],
                },
                documentGenResult: {
                  fileUrl: serveUrl,
                  fileName: docData.fileName || 'ملخص_محاضرات.pdf',
                  docType: 'pdf',
                  durationMs: docData.durationMs,
                },
              });

              // Update message with generated file metadata for file card display
              get().updateMessageWithGeneratedFiles(
                conversationId,
                assistantMessage.id,
                [{
                  id: `batch-doc-${Date.now()}`,
                  name: docData.fileName || 'ملخص_محاضرات.pdf',
                  url: serveUrl,
                  fileSize: docData.fileSize,
                }]
              );
            } else {
              // Document generation returned but no file — show warning
              const warnMsg = docData.error
                ? `\n\n---\n⚠️ **تعذر إنشاء المستند المجمع:** ${docData.error}`
                : '\n\n---\n⚠️ **تعذر إنشاء المستند المجمع. يرجى المحاولة لاحقاً.**';
              get().updateMessage(conversationId, assistantMessage.id, analysisContent + warnMsg);
            }
          } else {
            // Document generation API error — non-fatal, just warn
            let errorDetail = `خطأ في الخادم (${docResponse.status})`;
            try {
              const errData = await docResponse.json();
              errorDetail = errData.error || errorDetail;
            } catch { /* ignore */ }
            const warnMsg = `\n\n---\n⚠️ **تعذر إنشاء المستند المجمع:** ${errorDetail}`;
            get().updateMessage(conversationId, assistantMessage.id, analysisContent + warnMsg);
          }

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'خطأ غير متوقع';
          console.error('[ChatStore] Batch processing error:', errorMsg);
          
          // FIX #3: Don't completely wipe the message on error — show partial results if available
          const { batchResults } = get();
          if (batchResults && batchResults.length > 0) {
            // We have partial results — show them with the error warning
            const partialParts: string[] = [];
            partialParts.push(`# 🔬 تحليل جزئي لـ ${batchResults.length} ملفات\n`);
            partialParts.push(`> ⚠️ لم يكتمل التحليل بالكامل: ${errorMsg}\n\n`);
            for (const result of batchResults) {
              partialParts.push(`---\n## 📄 ${result.fileName}\n`);
              partialParts.push(result.summary || 'لم يتم تحليل هذا الملف بعد.');
              if (result.keyConcepts.length > 0) {
                partialParts.push(`\n**المفاهيم الرئيسية:** ${result.keyConcepts.join(' • ')}`);
              }
            }
            get().updateMessage(conversationId, assistantMessage.id, partialParts.join('\n'));
          } else {
            get().updateMessage(
              conversationId,
              assistantMessage.id,
              `❌ فشل التحليل الشامل: ${errorMsg}`
            );
          }
        } finally {
          set({
            isBatchProcessing: false,
            isStreaming: false,
            streamingProgress: null,
            batchProgress: null,
            isGeneratingDocument: false,
          });
        }
      },

      loadConversations: async () => {
        const token = useAuthStore.getState().token;
        if (!token) return;

        try {
          const response = await fetch('/api/chat/conversations', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) return;

          const data = await response.json();
          if (data.conversations) {
            const serverConversations: Conversation[] = data.conversations;

            set((state) => {
              // Deep-merge server conversations with local conversations to
              // prevent data loss. For each conversation, merge messages by ID
              // so that local-only messages (e.g. from streaming) are preserved.
              const mergeMessages = (localMsgs: Message[], serverMsgs: Message[]): Message[] => {
                const msgMap = new Map<string, Message>();
                for (const msg of serverMsgs) {
                  msgMap.set(msg.id, msg);
                }
                for (const msg of localMsgs) {
                  const existing = msgMap.get(msg.id);
                  if (!existing) {
                    msgMap.set(msg.id, msg);
                  } else {
                    // Keep the version with more content or more recent update
                    const existingLen = existing.content?.length || 0;
                    const localLen = msg.content?.length || 0;
                    const existingTime = new Date(existing.updatedAt || 0).getTime();
                    const localTime = new Date(msg.updatedAt || 0).getTime();
                    if (localLen > existingLen || (localLen === existingLen && localTime > existingTime)) {
                      msgMap.set(msg.id, msg);
                    }
                  }
                }
                return [...msgMap.values()].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
              };

              const convMap = new Map<string, Conversation>();

              // Add server conversations first (authoritative source)
              for (const conv of serverConversations) {
                convMap.set(conv.id, { ...conv, messages: conv.messages || [] });
              }

              // Deep merge local conversations into the map
              for (const localConv of state.conversations) {
                const serverConv = convMap.get(localConv.id);
                if (!serverConv) {
                  // Local-only conversation (not on server yet) — keep it
                  convMap.set(localConv.id, { ...localConv, messages: localConv.messages || [] });
                } else {
                  // Conversation exists on both — deep merge messages
                  const mergedMessages = mergeMessages(
                    localConv.messages || [],
                    serverConv.messages || []
                  );
                  const localTime = new Date(localConv.updatedAt || 0).getTime();
                  const serverTime = new Date(serverConv.updatedAt || 0).getTime();
                  const base = localTime > serverTime ? localConv : serverConv;
                  convMap.set(localConv.id, {
                    ...base,
                    messages: mergedMessages,
                  });
                }
              }

              // Determine active conversation ID
              let newActiveId = state.activeConversationId;
              if (newActiveId && !convMap.has(newActiveId)) {
                // Active conversation no longer exists — pick the first available
                newActiveId = convMap.size > 0 ? [...convMap.values()][0].id : null;
              }

              return {
                conversations: [...convMap.values()],
                activeConversationId: newActiveId,
              };
            });
          }
        } catch {
          // Silently fail — local conversations remain available
        }
      },
    }),
    {
      name: 'delta-chat-storage',
      partialize: (state) => {
        // ─── Strip large data from conversations before persisting ─────────
        // This prevents localStorage overflow (5MB limit) from large base64
        // image data, search results, and video data stored in messages.
        // We keep the conversation structure but remove the heavy payload fields.
        const MAX_CONVERSATIONS = 200; // Keep up to 200 conversations
        const MAX_MESSAGES_PER_CONV = 500; // Keep up to 500 messages per conversation

        const strippedConversations = state.conversations
          .slice(0, MAX_CONVERSATIONS)
          .map(conv => ({
            ...conv,
            messages: conv.messages.slice(-MAX_MESSAGES_PER_CONV).map(msg => {
              // Create a lightweight version of each message for storage
              const light: Partial<Message> = {
                id: msg.id,
                content: msg.content,
                role: msg.role,
                model: msg.model,
                emotion: msg.emotion,
                quoteUsed: msg.quoteUsed,
                language: msg.language,
                attachments: msg.attachments,
                pdfUrl: msg.pdfUrl,
                isEdited: msg.isEdited,
                createdAt: msg.createdAt,
                updatedAt: msg.updatedAt,
              };
              // Keep search results but only if small (strip large snippets)
              if (msg.searchResults && msg.searchResults.length > 0) {
                light.searchResults = msg.searchResults.map(sr => ({
                  url: sr.url,
                  name: sr.name,
                  snippet: sr.snippet?.slice(0, 200) || '',
                  host_name: sr.host_name,
                }));
              }
              // Keep generated images but strip the base64 dataUrl (can be 1MB+ per image)
              // Keep only the prompt so the UI can show "image was generated"
              if (msg.generatedImages && msg.generatedImages.length > 0) {
                light.generatedImages = msg.generatedImages.map(img => ({
                  dataUrl: '', // Stripped — too large for localStorage
                  prompt: img.prompt,
                }));
              }
              // Strip video data
              if (msg.generatedVideo) {
                light.generatedVideo = {
                  videoUrl: msg.generatedVideo.videoUrl,
                  prompt: msg.generatedVideo.prompt,
                };
              }
              // Keep status fields
              if (msg.imageGenStatus) light.imageGenStatus = msg.imageGenStatus;
              if (msg.videoGenStatus) light.videoGenStatus = msg.videoGenStatus;
              return light as Message;
            }),
          }));

        return {
          conversations: strippedConversations,
          activeConversationId: state.activeConversationId,
          activeModel: state.activeModel,
          activeLanguage: state.activeLanguage,
          sidebarOpen: state.sidebarOpen,
          generatedFiles: state.generatedFiles,
          autoWebSearch: state.autoWebSearch,
          systemPromptMode: state.systemPromptMode,
        };
      },
      // Custom merge strategy to prevent data loss during hydration
      merge: (persistedState: unknown, currentState: ChatState) => {
        const ps = (persistedState ?? {}) as Partial<ChatState>;
        const persistedConversations = ps.conversations;
        const currentConversations = currentState.conversations;

        // Deep-merge conversations: for each conversation that exists in both
        // persisted and current state, merge messages by ID so that no message
        // is lost. For the same message ID, keep the version with more content
        // or the more recent updatedAt.
        const mergeMessages = (existingMsgs: Message[], newMsgs: Message[]): Message[] => {
          const msgMap = new Map<string, Message>();

          // Add all existing messages first
          for (const msg of existingMsgs) {
            msgMap.set(msg.id, msg);
          }

          // Overlay new messages, merging by ID
          for (const msg of newMsgs) {
            const existing = msgMap.get(msg.id);
            if (!existing) {
              // New message not in existing — add it
              msgMap.set(msg.id, msg);
            } else {
              // Same message ID exists — keep the version with more content
              // or the one that was updated more recently
              const existingLen = existing.content?.length || 0;
              const newLen = msg.content?.length || 0;
              const existingTime = new Date(existing.updatedAt || 0).getTime();
              const newTime = new Date(msg.updatedAt || 0).getTime();

              if (newLen > existingLen || (newLen === existingLen && newTime > existingTime)) {
                msgMap.set(msg.id, msg);
              }
              // Otherwise keep existing (which is already in the map)
            }
          }

          // Sort by createdAt to maintain order
          return [...msgMap.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        };

        let mergedConversations: Conversation[];

        if (
          !persistedConversations ||
          !Array.isArray(persistedConversations) ||
          persistedConversations.length === 0
        ) {
          // No persisted data — use current conversations
          mergedConversations = currentConversations || [];
        } else if (
          !currentConversations ||
          !Array.isArray(currentConversations) ||
          currentConversations.length === 0
        ) {
          // No current data — use persisted conversations
          mergedConversations = persistedConversations;
        } else {
          // Both exist — deep merge
          const convMap = new Map<string, Conversation>();

          // Add all persisted conversations first
          for (const conv of persistedConversations) {
            convMap.set(conv.id, { ...conv, messages: conv.messages || [] });
          }

          // Deep merge current conversations into the map
          for (const conv of currentConversations) {
            const existing = convMap.get(conv.id);
            if (!existing) {
              // New conversation not in persisted — add it
              convMap.set(conv.id, { ...conv, messages: conv.messages || [] });
            } else {
              // Same conversation ID — deep merge messages
              const mergedMessages = mergeMessages(
                existing.messages || [],
                conv.messages || []
              );
              // Use the conversation with the more recent updatedAt as the base,
              // but always use the merged messages
              const existingTime = new Date(existing.updatedAt || 0).getTime();
              const currentTime = new Date(conv.updatedAt || 0).getTime();
              const base = currentTime > existingTime ? conv : existing;
              convMap.set(conv.id, {
                ...base,
                messages: mergedMessages,
              });
            }
          }

          mergedConversations = [...convMap.values()];
        }

        // Only spread the specific persisted properties we actually persist
        // (defined in partialize) instead of blindly spreading all of persistedState
        return {
          ...currentState,
          activeConversationId: ps.activeConversationId ?? currentState.activeConversationId,
          activeModel: ps.activeModel ?? currentState.activeModel,
          activeLanguage: ps.activeLanguage ?? currentState.activeLanguage,
          sidebarOpen: ps.sidebarOpen ?? currentState.sidebarOpen,
          generatedFiles: ps.generatedFiles ?? currentState.generatedFiles,
          // Use deep-merged conversations
          conversations: mergedConversations,
          // Always reset streaming state (shouldn't be streaming on load)
          isStreaming: false,
          streamingProgress: null,
          // Always reset batch processing state (shouldn't be processing on load)
          isBatchProcessing: false,
          batchProgress: null,
          batchResults: [],
          batchCrossAnalysis: '',
          // Always reset document generation state
          documentGenProgress: null,
          documentGenResult: null,
          isGeneratingDocument: false,
          // Always reset arena state
          arenaOpen: false,
          arenaResults: [],
          arenaStreaming: false,
          arenaVoted: false,
          // Always reset quiz state
          quizOpen: false,
          quizAutoData: null,
          quizGenStatus: null,
          quizTopic: '',
          searchQuery: currentState.searchQuery || '',
          // Preserve autoWebSearch from persisted state
          autoWebSearch: ps.autoWebSearch ?? currentState.autoWebSearch ?? true,
          // Preserve systemPromptMode from persisted state
          systemPromptMode: ps.systemPromptMode ?? currentState.systemPromptMode,
        };
      },
    }
  )
);
