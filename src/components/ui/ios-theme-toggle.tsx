'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IOSThemeToggleProps {
  className?: string;
  compact?: boolean;
}

/**
 * iOS-style segmented control for theme selection (Light / System / Dark).
 * Mirrors the appearance of UISegmentedControl in iOS Settings.
 */
export function IOSThemeToggle({ className, compact = false }: IOSThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "ios-segmented h-[32px] w-[180px] items-center",
          compact && "w-[140px]",
          className
        )}
        aria-hidden
      />
    );
  }

  const current = theme === 'system' ? 'system' : resolvedTheme === 'dark' ? 'dark' : 'light';
  const options = [
    { id: 'light', label: compact ? 'فاتح' : 'فاتح', icon: Sun },
    { id: 'system', label: compact ? 'تلقائي' : 'تلقائي', icon: Monitor },
    { id: 'dark', label: compact ? 'داكن' : 'داكن', icon: Moon },
  ] as const;

  return (
    <div
      role="radiogroup"
      aria-label="اختيار المظهر"
      className={cn(
        "ios-segmented h-[32px] items-center",
        compact ? "w-[150px]" : "w-[190px]",
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = current === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-active={isActive}
            onClick={() => setTheme(opt.id)}
            className={cn(
              "ios-segmented-item flex items-center justify-center gap-1 h-[28px] text-[12px]",
              isActive && "font-semibold"
            )}
          >
            <Icon className="w-[14px] h-[14px]" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
