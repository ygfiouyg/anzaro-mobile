'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Trash2,
  Archive,
  FolderOpen,
  X,
  Settings,
  HelpCircle,
  Activity,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/store/chat-store';
import { getModelById } from '@/lib/models';

interface ConversationSidebarProps {
  onToggleFilesPanel?: () => void;
}

export function ConversationSidebar({ onToggleFilesPanel }: ConversationSidebarProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createConversation,
    deleteConversation,
    archiveConversation,
    clearConversations,
    searchQuery,
    setSearchQuery,
    generatedFiles,
  } = useChatStore();

  // Filter conversations
  const filteredConversations = useMemo(() => {
    let result = conversations.filter((c) => !c.isArchived);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          (c.title && c.title.toLowerCase().includes(q)) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    }

    return result;
  }, [conversations, searchQuery]);

  // Format relative time — Gemini style (Today, Yesterday, date)
  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays === 0) return 'اليوم';
      if (diffDays === 1) return 'أمس';
      if (diffDays < 7) return `منذ ${diffDays} أيام`;
      return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleNewConversation = () => {
    createConversation();
  };

  return (
    <div
      className="flex flex-col h-full text-foreground border-r border-border/60 dark:border-white/10 shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40"
      style={{ background: 'linear-gradient(135deg, var(--gemini-sidebar) 0%, var(--gemini-sidebar) 60%, color-mix(in srgb, var(--gemini-sidebar) 90%, var(--muted)) 100%)' }}
      dir="rtl"
    >
      {/* ── Top: New Chat + Search ── */}
      <div className="p-3 pb-2">
        {/* New Chat button — Gemini pill style */}
        <button
          onClick={handleNewConversation}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all duration-200 ios-pressable text-[14px] font-medium text-foreground hover:bg-[var(--gemini-hover)]"
          style={{
            border: '1px solid var(--gemini-border)',
            background: 'var(--gemini-surface)',
          }}
        >
          <Plus className="size-5 text-[hsl(var(--primary))]" />
          <span>محادثة جديدة</span>
        </button>

        {/* Search — Gemini minimal */}
        <div className="relative mt-2.5">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-[var(--gemini-text-tertiary)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث"
            className="pr-10 pl-10 h-9 text-[14px] bg-transparent border-0 focus-visible:ring-0 placeholder:text-[var(--gemini-text-tertiary)]"
            dir="rtl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gemini-text-tertiary)] hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Middle: Recent Chats — clean text list, no boxes ── */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          <AnimatePresence initial={false}>
            {filteredConversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const model = getModelById(conversation.model);
              const preview =
                conversation.title ||
                (conversation.messages.length > 0
                  ? conversation.messages[0].content.slice(0, 40) +
                    (conversation.messages[0].content.length > 40 ? '...' : '')
                  : 'محادثة جديدة');

              return (
                <motion.div
                  key={conversation.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  className="group"
                >
                  <div
                    onClick={() => setActiveConversation(conversation.id)}
                    data-active={isActive}
                    className="gemini-sidebar-item !justify-start !text-[14px] !px-3 !py-2.5 !rounded-[12px] min-h-[44px] cursor-pointer relative"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveConversation(conversation.id);
                      }
                    }}
                  >
                    {/* Action buttons on hover — Gemini style */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity absolute left-1 top-1/2 -translate-y-1/2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveConversation(conversation.id);
                        }}
                        className="p-1.5 rounded-full hover:bg-[var(--gemini-hover)] text-[var(--gemini-text-tertiary)] hover:text-foreground min-h-[28px] min-w-[28px] flex items-center justify-center"
                        aria-label="أرشيف"
                      >
                        <Archive className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conversation.id);
                        }}
                        className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-[var(--gemini-text-tertiary)] hover:text-red-500 min-h-[28px] min-w-[28px] flex items-center justify-center"
                        aria-label="حذف"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {/* Preview text — main content */}
                    <p
                      className={cn(
                        'truncate flex-1 transition-[padding] duration-200 group-hover:pl-12',
                        isActive ? 'text-[hsl(var(--primary))]' : 'text-[var(--gemini-text)]'
                      )}
                    >
                      {preview}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredConversations.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-[14px] text-[var(--gemini-text-tertiary)]">
                {searchQuery ? 'لا توجد نتائج' : 'لا توجد محادثات بعد'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Bottom: Settings, Help, Activity — Gemini minimal line icons ── */}
      <div className="px-2 py-2 border-t border-[var(--gemini-border-soft)]">
        {onToggleFilesPanel && (
          <button
            onClick={onToggleFilesPanel}
            className="gemini-sidebar-item !justify-start !text-[14px] relative"
            aria-label="ملفاتي"
          >
            <FolderOpen className="size-5 text-[var(--gemini-text-tertiary)]" />
            <span>ملفاتي</span>
            {generatedFiles.length > 0 && (
              <span className="absolute left-3 text-[11px] text-[var(--gemini-text-tertiary)] bg-[var(--gemini-surface-3)] rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {generatedFiles.length}
              </span>
            )}
          </button>
        )}
        <button className="gemini-sidebar-item !justify-start !text-[14px]">
          <Activity className="size-5 text-[var(--gemini-text-tertiary)]" />
          <span>النشاط</span>
        </button>
        <button className="gemini-sidebar-item !justify-start !text-[14px]">
          <HelpCircle className="size-5 text-[var(--gemini-text-tertiary)]" />
          <span>المساعدة</span>
        </button>
        <button className="gemini-sidebar-item !justify-start !text-[14px]">
          <Settings className="size-5 text-[var(--gemini-text-tertiary)]" />
          <span>الإعدادات</span>
        </button>

        {/* Clear all — subtle */}
        {conversations.length > 0 && (
          <button
            onClick={clearConversations}
            className="gemini-sidebar-item !justify-start !text-[14px] hover:!text-red-500"
          >
            <Trash2 className="size-5 text-[var(--gemini-text-tertiary)]" />
            <span>مسح الكل</span>
          </button>
        )}
      </div>
    </div>
  );
}
