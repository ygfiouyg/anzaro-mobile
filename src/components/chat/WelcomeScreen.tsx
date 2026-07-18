'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  PenLine,
  Code2,
  Lightbulb,
  GraduationCap,
  Sparkle,
} from 'lucide-react';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';

// Gemini-style suggestions — 4 horizontal glass cards
const SUGGESTIONS = [
  {
    icon: PenLine,
    title: 'اكتب قصة إبداعية',
    prompt: 'اكتب لي قصة قصيرة ممتعة عن مغامرة في الصحراء',
    model: 'delta-creative',
  },
  {
    icon: Code2,
    title: 'ساعدني في كود',
    prompt: 'اكتب لي كود Python لحساب متتالية فيبوناتشي',
    model: 'delta-code',
  },
  {
    icon: Lightbulb,
    title: 'أعطني نصيحة',
    prompt: 'محتاج نصيحة تحفيزية تساعدني أحقق أهدافي',
    model: 'delta-psychology',
  },
  {
    icon: GraduationCap,
    title: 'فسر لي موضوع',
    prompt: 'فسر لي مفهوم الذكاء الاصطناعي بطريقة مبسطة',
    model: 'delta-teacher',
  },
];

export function WelcomeScreen() {
  const { setActiveModel, sendMessage } = useChatStore();
  const { user } = useAuthStore();

  // ── Hydration-safe greeting ──
  // new Date().getHours() runs during SSR AND client render.
  // If server timezone != client timezone, or if the render crosses
  // a second boundary, the greeting changes → hydration mismatch.
  // Fix: Initialize with empty string, set greeting in useEffect (client-only).
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('صباح الخير');
    else if (hour < 18) setGreeting('مساء الخير');
    else setGreeting('أهلاً');
  }, []);

  const handleSuggestionClick = (prompt: string, modelId: string) => {
    setActiveModel(modelId);
    sendMessage(prompt);
  };

  const userName = user?.name?.split(' ')[0] || '';

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
    },
  };

  return (
    <div
      className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto relative"
      dir="rtl"
    >
      {/* ── Main Content — Gemini centered, ample whitespace ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-3xl relative z-10 px-6 py-8 flex flex-col items-center"
      >
        {/* Gemini Sparkle Logo — subtle, elegant */}
        <motion.div variants={itemVariants} className="mb-6">
          <div className="relative flex items-center justify-center">
            {/* Soft glow behind logo */}
            <div
              className="absolute inset-0 blur-2xl opacity-30 rounded-full"
              style={{ background: 'var(--gemini-gradient-1)' }}
            />
            <div
              className="relative flex items-center justify-center w-14 h-14 rounded-full"
              style={{
                background: 'var(--gemini-surface-2)',
                border: '1px solid var(--gemini-border-soft)',
              }}
            >
              <Sparkle
                className="size-7"
                style={{ color: 'var(--gemini-blue)' }}
              />
            </div>
          </div>
        </motion.div>

        {/* ── Gemini Greeting — large, bold, gradient typography ── */}
        <motion.div variants={itemVariants} className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight leading-tight">
            <span className="gemini-gradient-text">
              {greeting || 'مرحباً'}
              {userName ? `, ${userName}` : ''}
            </span>
          </h1>
          <p className="text-2xl sm:text-3xl font-medium mt-2 text-foreground">
            كيف أقدر أساعدك النهاردة؟
          </p>
        </motion.div>

        {/* ── Gemini Quick Action Cards — 4 horizontal glassmorphic cards ── */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full"
        >
          {SUGGESTIONS.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <motion.button
                key={index}
                onClick={() => handleSuggestionClick(suggestion.prompt, suggestion.model)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="p-4 text-start flex flex-col gap-3 min-h-[120px] justify-between rounded-2xl bg-[var(--gemini-surface-2)] hover:bg-[var(--gemini-surface-3)] border border-transparent hover:border-[var(--gemini-border-soft)] transition-all duration-200"
              >
                <Icon className="size-5 text-[hsl(var(--primary))]" />
                <span className="text-[13px] font-medium text-foreground leading-snug">
                  {suggestion.title}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
}
