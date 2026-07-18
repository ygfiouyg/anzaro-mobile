/**
 * Anzaro Mobile — Sentient Chat Screen
 * ===================================
 * V.14: Fluid chat timeline + Context Bar + inline HASS action cards.
 * Reads identityMatrix to adapt tone. Parses [ACTION:] payloads from AI.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Send, Brain, Sparkles, Zap, CheckCircle2, AlertCircle, Bot, User,
} from 'lucide-react-native';
import { useIdentity } from '../mobile/context/IdentityContext';
import { toggleHassDevice } from '../services/hass';
import {
  streamChat, fetchConversationHistory, parseActions, stripActionMarkers,
  getContextModeLabel, type ChatMessage, type ParsedAction,
} from '../services/chatService';
import { ANZARO_API_URL, COLORS } from '../config';

export default function ChatScreen() {
  const { matrix, token } = useIdentity();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [ballState, setBallState] = useState<'idle' | 'processing' | 'speaking'>('idle');

  const flatListRef = useRef<FlatList>(null);
  const ballScale = useRef(new Animated.Value(1)).current;

  // ─── Context mode from identityMatrix ───
  const contextMode = getContextModeLabel(matrix);

  // ─── Ball pulse animation ───
  useEffect(() => {
    if (ballState === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ballScale, { toValue: 1.2, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(ballScale, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      ballScale.setValue(1);
    }
  }, [ballState]);

  // ─── Load conversation history on mount ───
  useEffect(() => {
    const load = async () => {
      setLoadingHistory(true);
      const { conversationId: convId, messages: msgs } = await fetchConversationHistory(token);
      setConversationId(convId);
      setMessages(msgs);
      setLoadingHistory(false);
    };
    load();
  }, [token]);

  // ─── Scroll to bottom on new messages ───
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd?.({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ─── Send message ───
  const handleSend = async () => {
    const text = input?.trim();
    if (!text || isStreaming) return;

    // V.14: Haptic feedback on send
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Add user message
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setBallState('processing');

    // Add placeholder for AI response
    const aiMsgId = `a_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
    ]);

    // Stream chat
    let accumulatedContent = '';
    await streamChat(text, token, null, {
      onChunk: (chunk) => {
        accumulatedContent += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
          )
        );
      },
      onComplete: (fullContent) => {
        // V.14: Haptic feedback on receive
        Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success).catch(() => {});

        // Parse HASS actions from response
        const actions = parseActions(fullContent);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: fullContent, actions, isStreaming: false }
              : m
          )
        );
        setIsStreaming(false);
        setBallState('idle');
      },
      onError: (error) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: error, isStreaming: false, isError: true }
              : m
          )
        );
        setIsStreaming(false);
        setBallState('idle');
      },
    });
  };

  // ─── Execute HASS action from inline card ───
  const executeAction = async (msgId: string, action: ParsedAction, index: number) => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Mark as executed optimistically
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const actions = m.actions?.map((a, i) =>
          i === index ? { ...a, executed: true } : a
        ) ?? [];
        return { ...m, actions };
      })
    );

    try {
      const result = await toggleHassDevice(action.entityId, action.service as any);
      if (!result?.success) {
        // Revert on failure
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            const actions = m.actions?.map((a, i) =>
              i === index ? { ...a, executed: false } : a
            ) ?? [];
            return { ...m, actions };
          })
        );
      }
    } catch {
      // Revert on error
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const actions = m.actions?.map((a, i) =>
            i === index ? { ...a, executed: false } : a
          ) ?? [];
          return { ...m, actions };
        })
      );
    }
  };

  // ─── Render message bubble ───
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const displayContent = isUser ? item.content : stripActionMarkers(item.content);
    const hasActions = !isUser && item.actions && item.actions.length > 0;

    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAI]}>
        {/* Avatar */}
        <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAI]}>
          {isUser ? <User size={14} color={COLORS.textMuted} /> : <Bot size={14} color={COLORS.primary} />}
        </View>

        {/* Bubble */}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI, item.isError && styles.bubbleError]}>
          {item.isStreaming && !displayContent ? (
            <View style={styles.typingDots}>
              <View style={[styles.typingDot, { animationDelay: '0ms' }]} />
              <View style={[styles.typingDot, { animationDelay: '150ms' }]} />
              <View style={[styles.typingDot, { animationDelay: '300ms' }]} />
            </View>
          ) : (
            <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAI]}>
              {displayContent}
            </Text>
          )}

          {/* Inline HASS Action Cards */}
          {hasActions && !item.isStreaming && (
            <View style={styles.actionCards}>
              {item.actions!.map((action, i) => (
                <TouchableOpacity
                  key={`${action.entityId}_${i}`}
                  style={[styles.actionCard, action.executed && styles.actionCardDone]}
                  onPress={() => !action.executed && executeAction(item.id, action, i)}
                  disabled={action.executed}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionCardIcon}>
                    {action.executed ? (
                      <CheckCircle2 size={14} color={COLORS.success} />
                    ) : (
                      <Zap size={14} color={COLORS.primary} />
                    )}
                  </View>
                  <View style={styles.actionCardContent}>
                    <Text style={styles.actionCardLabel}>{action.label}</Text>
                    <Text style={styles.actionCardEntity}>{action.entityId}</Text>
                  </View>
                  <Text style={[styles.actionBtn, action.executed && styles.actionBtnDone]}>
                    {action.executed ? 'تم' : 'تأكيد الأمر'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Context Bar (AI emotional alignment) ─── */}
      <View style={styles.contextBar}>
        <Animated.View
          style={[
            styles.contextOrb,
            { transform: [{ scale: ballScale }] },
            { backgroundColor: ballState === 'processing' ? COLORS.warning : contextMode.color },
          ]}
        />
        <View style={styles.contextInfo}>
          <Text style={styles.contextLabel}>{contextMode.labelAr}</Text>
          <Text style={styles.contextSublabel}>
            {ballState === 'processing' ? 'بفكّر...' : ballState === 'speaking' ? 'بتكلم...' : 'Mode: ' + contextMode.label}
          </Text>
        </View>
        {matrix && (
          <View style={styles.matrixBadge}>
            <Brain size={12} color={COLORS.primaryLight} />
            <Text style={styles.matrixBadgeText}>{matrix?.primaryArchetype ?? '—'}</Text>
          </View>
        )}
      </View>

      {/* ─── Messages ─── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[styles.messagesList, { paddingBottom: insets.bottom + 70 }]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToBottom}
        ListEmptyComponent={
          loadingHistory ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.emptyText}>جاري تحميل المحادثات...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Sparkles size={32} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>أنظاره جاهز</Text>
              <Text style={styles.emptyText}>اكتب أي حاجة — أنا معاك</Text>
            </View>
          )
        }
      />

      {/* ─── Input Bar ─── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="اكتب لـ Anzaro..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={2000}
            editable={!isStreaming}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input?.trim() || isStreaming) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input?.trim() || isStreaming}
            activeOpacity={0.7}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Context Bar
  contextBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  contextOrb: {
    width: 12, height: 12, borderRadius: 6,
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  contextInfo: { flex: 1 },
  contextLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  contextSublabel: { color: COLORS.textMuted, fontSize: 10 },
  matrixBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(124,58,237,0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  matrixBadgeText: { color: COLORS.primaryLight, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  // Messages
  messagesList: { padding: 16, gap: 12 },
  messageRow: { flexDirection: 'row', gap: 8, maxWidth: '85%' },
  messageRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  messageRowAI: { alignSelf: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarUser: { backgroundColor: 'rgba(255,255,255,0.05)' },
  avatarAI: { backgroundColor: 'rgba(124,58,237,0.15)' },
  bubble: { borderRadius: 14, padding: 12, gap: 8 },
  bubbleUser: { backgroundColor: COLORS.primary },
  bubbleAI: { backgroundColor: COLORS.card },
  bubbleError: { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageTextUser: { color: '#fff' },
  messageTextAI: { color: COLORS.text },
  // Typing dots
  typingDots: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
  // Action cards
  actionCards: { gap: 6, marginTop: 4 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)',
  },
  actionCardDone: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' },
  actionCardIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(124,58,237,0.12)', alignItems: 'center', justifyContent: 'center' },
  actionCardContent: { flex: 1 },
  actionCardLabel: { color: COLORS.text, fontSize: 11, fontWeight: '600' },
  actionCardEntity: { color: COLORS.textMuted, fontSize: 9, fontFamily: 'monospace' },
  actionBtn: { color: COLORS.primary, fontSize: 10, fontWeight: '700' },
  actionBtnDone: { color: COLORS.success },
  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
  // Input
  inputBar: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.card,
  },
  input: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: COLORS.text, fontSize: 14,
    maxHeight: 80, borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
