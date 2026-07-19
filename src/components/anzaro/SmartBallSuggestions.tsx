'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Suggestion {
  text: string;
  icon?: string;
}

interface SmartBallSuggestionsProps {
  onFire: (cmd: string) => void;
}

// Time-aware suggestions — no API call needed, instant render
function getTimeBasedSuggestions(): Suggestion[] {
  const hour = new Date().getHours();
  const suggestions: Suggestion[] = [];

  if (hour >= 5 && hour < 11) {
    suggestions.push({ text: 'صباح الخير! عايز ملخص أخبار الصباح؟', icon: 'sun' });
    suggestions.push({ text: 'شغّل قرآن صباحي', icon: 'quran' });
    suggestions.push({ text: 'إيه جدولي النهاردة؟', icon: 'calendar' });
  } else if (hour >= 11 && hour < 15) {
    suggestions.push({ text: 'اقترح وصفة غداء سريعة', icon: 'food' });
    suggestions.push({ text: 'نفّذ وضع التركيز', icon: 'focus' });
  } else if (hour >= 15 && hour < 19) {
    suggestions.push({ text: 'إيه أخبار السوق؟', icon: 'market' });
    suggestions.push({ text: 'ذكّرني بمهامي المعلقة', icon: 'tasks' });
  } else if (hour >= 19 && hour < 23) {
    suggestions.push({ text: 'شغّل راديو هادئ', icon: 'radio' });
    suggestions.push({ text: 'اقترح فيلم للمساء', icon: 'movie' });
  } else {
    suggestions.push({ text: 'تصبح على خير — نفّذ وضع النوم', icon: 'sleep' });
    suggestions.push({ text: 'شغّل أصوات طبيعة للنوم', icon: 'nature' });
  }

  return suggestions;
}

/**
 * SmartBallSuggestions — context-aware quick suggestion chips.
 * Renders instantly based on time of day (no network call).
 */
export function SmartBallSuggestions({ onFire }: SmartBallSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSuggestions(getTimeBasedSuggestions());
  }, []);

  if (dismissed || suggestions.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-border/40">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1 text-[10px] font-bold text-primary">
          <Sparkles className="w-3 h-3" />
          اقتراحات ذكية
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="إغلاق"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        <AnimatePresence>
          {suggestions.map((s, i) => (
            <motion.button
              key={s.text}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => onFire(s.text)}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all whitespace-nowrap border border-primary/20"
            >
              {s.text}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
