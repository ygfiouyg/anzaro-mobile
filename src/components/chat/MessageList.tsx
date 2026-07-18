'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useChatStore } from '@/store/chat-store';
import { MessageBubble } from './MessageBubble';
import { WelcomeScreen } from './WelcomeScreen';
import { Button } from '@/components/ui/button';
import { ArrowDown } from 'lucide-react';

export function MessageList() {
  const { conversations, activeConversationId, isStreaming } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  // Track showScrollButton per conversation to auto-reset on conversation switch
  const [scrollButtonVisibleFor, setScrollButtonVisibleFor] = useState<{
    convId: string | null;
    visible: boolean;
  }>({ convId: activeConversationId, visible: false });

  const showScrollButton =
    scrollButtonVisibleFor.convId === activeConversationId &&
    scrollButtonVisibleFor.visible;

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  const messages = activeConversation?.messages || [];

  // Scroll to bottom using requestAnimationFrame
  const scrollToBottom = useCallback((smooth: boolean = true) => {
    requestAnimationFrame(() => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({
          behavior: smooth ? 'smooth' : 'instant',
          block: 'end',
        });
      }
    });
  }, []);

  // Check if user is near the bottom of the scroll container
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 150; // pixels from bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Handle scroll events to detect user scroll position
  const handleScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    // فوراً حدّث الـ ref بدون delay عشان نوقف الـ auto-scroll فوراً
    userScrolledUpRef.current = !nearBottom;
    setScrollButtonVisibleFor({ convId: activeConversationId, visible: !nearBottom });
  }, [isNearBottom, activeConversationId]);

  // Auto-scroll when a NEW message is added (not on content updates)
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastMsgId = lastMsg?.id || null;

    if (lastMsgId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMsgId;
      // New message — scroll ONLY if user is near bottom (didn't scroll up)
      if (!userScrolledUpRef.current && messages.length > 0) {
        scrollToBottom(true);
      }
    }
  }, [messages, scrollToBottom]);

  // During streaming, auto-scroll smoothly ONLY if user hasn't scrolled up
  useEffect(() => {
    if (!isStreaming) return;
    // لو المستخدم scroll لفوق، متعملش auto-scroll خالص
    if (userScrolledUpRef.current) return;

    const interval = setInterval(() => {
      // double-check قبل كل scroll — لو الـ user عمل scroll up، وقّف
      if (userScrolledUpRef.current) {
        clearInterval(interval);
        return;
      }
      scrollToBottom(false);
    }, 500); // بطّأت الـ interval عشان أدي المستخدم فرصة يعمل scroll
    return () => clearInterval(interval);
  }, [isStreaming, scrollToBottom]);

  // Reset scroll state when switching conversations
  useEffect(() => {
    userScrolledUpRef.current = false;
    lastMessageIdRef.current = null;
    // Scroll to bottom after a short delay to allow content to render
    const timer = setTimeout(() => {
      scrollToBottom(false);
      // Reset scroll button visibility after content renders
      setScrollButtonVisibleFor({ convId: activeConversationId, visible: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [activeConversationId, scrollToBottom, activeConversationId]);

  // Show welcome screen if no active conversation or no messages
  if (!activeConversation || messages.length === 0) {
    return <WelcomeScreen />;
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 relative"
      onScroll={handleScroll}
      style={{
        scrollBehavior: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      <div className="max-w-[900px] mx-auto">
        {messages.map((message, index) => {
          const isLastMessage = index === messages.length - 1;
          const isLastAssistantStreaming =
            isLastMessage &&
            message.role === 'assistant' &&
            isStreaming &&
            message.content === '';

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={isLastAssistantStreaming}
            />
          );
        })}
        {/* Scroll anchor */}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll to bottom button — Gemini minimal floating */}
      {showScrollButton && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-10 size-10 rounded-full
            bg-[var(--gemini-surface-2)] border-[var(--gemini-border-soft)] hover:bg-[var(--gemini-surface-3)]
            shadow-lg transition-all duration-300 ios-pressable text-foreground"
          onClick={() => {
            userScrolledUpRef.current = false;
            setScrollButtonVisibleFor({ convId: activeConversationId, visible: false });
            scrollToBottom(true);
          }}
          aria-label="الانتقال للأسفل"
        >
          <ArrowDown className="size-5" />
        </Button>
      )}
    </div>
  );
}
