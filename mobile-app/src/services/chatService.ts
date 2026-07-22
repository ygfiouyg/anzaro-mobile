/**
 * Anzaro Mobile — Secure Chat Service
 * ==================================
 * V.14: All calls guarded with try/catch + AbortSignal.timeout(7000).
 * Falls back to safe error messages if Cloud Brain is unreachable.
 * Parses [ACTION: entity_id:service] payloads from AI responses for inline HASS triggers.
 */

import { ANZARO_API_URL, COLORS } from '../config';

// ─── Types ───
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actions?: ParsedAction[];
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ParsedAction {
  entityId: string;
  service: string;  // turn_on, turn_off, toggle
  label: string;    // Human-readable label
  executed?: boolean;
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: string) => void;
}

// ─── Parse [ACTION: entity_id:service] from AI response ───
export function parseActions(content: string): ParsedAction[] {
  if (!content) return [];
  const actions: ParsedAction[] = [];
  // Match [ACTION: light.living_room:toggle] or [ACTION: switch.phone_dnd:turn_on]
  const regex = /\[ACTION:\s*([a-z_]+\.[a-z_]+):(turn_on|turn_off|toggle)\s*\]/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const entityId = match[1];
    const service = match[2];
    const domain = entityId?.split('.')?.[0] ?? 'device';
    const friendlyDomain = domain.charAt(0).toUpperCase() + domain.slice(1);
    actions.push({
      entityId,
      service,
      label: `${friendlyDomain} — ${service === 'turn_on' ? 'تشغيل' : service === 'turn_off' ? 'إيقاف' : 'تبديل'}`,
    });
  }
  return actions;
}

// ─── Strip action markers from display text ───
export function stripActionMarkers(content: string): string {
  if (!content) return '';
  return content.replace(/\[ACTION:\s*[a-z_]+\.[a-z_]+:(turn_on|turn_off|toggle)\s*\]/gi, '').trim();
}

// ─── Stream chat via SSE ───
export async function streamChat(
  message: string,
  token: string | null,
  model: string | null,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  if (!token) {
    callbacks.onError('غير مصرح — سجل دخول الأول');
    return;
  }

  // V.14: Use model or fallback to delta-general (NOT hardcoded ZAI/GLM)
  const safeModel = model ?? 'delta-general';

  try {
    const res = await fetch(`${ANZARO_API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        model: safeModel,
        language: 'ar',
      }),
      signal: AbortSignal.timeout(120000), // 2 min for streaming
    });

    if (!res?.ok) {
      // V.14: Safe error parsing
      let errorMsg = 'فشل الاتصال بـ Anzaro';
      try {
        const errData = await res.json();
        errorMsg = errData?.error ?? errData?.message ?? errorMsg;
      } catch {}
      callbacks.onError(errorMsg);
      return;
    }

    // Read SSE stream
    const reader = res.body?.getReader?.();
    if (!reader) {
      callbacks.onError('Stream not available');
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk?.split('\n') ?? [];

      for (const line of lines) {
        if (!line || !line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed?.content) {
            fullContent += parsed.content;
            callbacks.onChunk(parsed.content);
          }
        } catch {
          // V.14: Skip malformed chunks silently
        }
      }
    }

    callbacks.onComplete(fullContent);
  } catch (err: any) {
    // V.14: Network error / timeout
    const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';
    const errorMsg = isTimeout
      ? 'Anzaro بطيء دلوقتي — حاول تاني بكرة'
      : 'مش قادر أوصل للـ Cloud Brain — اتأكد من النت';
    callbacks.onError(errorMsg);
  }
}

// ─── Fetch conversation history ───
export async function fetchConversationHistory(
  token: string | null
): Promise<{ conversationId: string | null; messages: ChatMessage[] }> {
  if (!token) return { conversationId: null, messages: [] };

  try {
    // Get conversations list
    const convRes = await fetch(`${ANZARO_API_URL}/api/anzaro/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000),
    });

    if (!convRes?.ok) return { conversationId: null, messages: [] };

    const convData = await convRes.json();
    const conversations = Array.isArray(convData?.conversations) ? convData.conversations : [];

    if (conversations.length === 0) {
      return { conversationId: null, messages: [] };
    }

    // Load messages from most recent conversation
    const convId = conversations[0]?.id;
    if (!convId) return { conversationId: null, messages: [] };

    const msgRes = await fetch(`${ANZARO_API_URL}/api/anzaro/conversations/list-messages?id=${convId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000),
    });

    if (!msgRes?.ok) return { conversationId: convId, messages: [] };

    const msgData = await msgRes.json();
    const rawMessages = Array.isArray(msgData?.messages) ? msgData.messages : [];

    // Convert to ChatMessage format
    const messages: ChatMessage[] = rawMessages.map((m: any) => ({
      id: m?.id ?? String(Math.random()),
      role: m?.role === 'user' ? 'user' : 'assistant',
      content: m?.content ?? '',
      timestamp: m?.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      actions: parseActions(m?.content ?? ''),
    }));

    return { conversationId: convId, messages };
  } catch (err) {
    // V.14: Silent fail — return empty
    return { conversationId: null, messages: [] };
  }
}

// ─── Get AI context mode label from identityMatrix ───
export function getContextModeLabel(matrix: any): { label: string; labelAr: string; color: string } {
  if (!matrix) {
    return { label: 'Standard', labelAr: 'وضع قياسي', color: COLORS.textMuted };
  }

  const archetype = matrix?.primaryArchetype ?? 'unknown';
  const cognitiveStyle = matrix?.cognitiveStyle ?? 'pragmatic';
  const friction = matrix?.growthFrictionLevel ?? 'none';

  // Determine mode based on archetype + cognitive style + friction
  if (friction === 'aggressive') {
    return { label: 'Strategic Anchor', labelAr: 'مرساة استراتيجية', color: '#f59e0b' };
  }
  if (friction === 'moderate') {
    return { label: 'Critical Mentor', labelAr: 'مرشد نقدي', color: '#3b82f6' };
  }

  switch (cognitiveStyle) {
    case 'analytical':
      return { label: 'Data Partner', labelAr: 'شريك بيانات', color: '#06b6d4' };
    case 'creative':
      return { label: 'Creative Muse', labelAr: 'إلهام إبداعي', color: '#ec4899' };
    case 'philosophical':
      return { label: 'Grounding Guide', labelAr: 'مرشد تأريض', color: '#10b981' };
    default:
      return { label: 'Brotherly Companion', labelAr: 'رفيق أخوي', color: COLORS.primary };
  }
}
