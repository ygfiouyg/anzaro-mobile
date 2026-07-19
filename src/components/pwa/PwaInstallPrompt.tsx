'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'anzaro-pwa-install-dismissed';
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * PwaInstallPrompt — shows an install banner when:
 * 1. The browser fires `beforeinstallprompt` (Chrome/Edge/Android)
 * 2. The app is NOT already in standalone mode
 * 3. The user hasn't dismissed it within the last 7 days
 *
 * On iOS Safari, `beforeinstallprompt` doesn't fire — we detect iOS + !standalone
 * and show iOS-specific instructions instead.
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already installed (standalone) → never show
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    // Check dismissal
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL) return;
    } catch {
      // ignore
    }

    // iOS detection (Safari doesn't support beforeinstallprompt)
    const ua = window.navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
    if (ios && isSafari) {
      setIsIOS(true);
      // Show iOS instructions after a short delay (let user see the app first)
      const t = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(t);
    }

    // Android/Chrome/Edge — listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a short delay so the user isn't bombarded immediately
      setTimeout(() => setVisible(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setVisible(false);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setVisible(false);
      }
      setDeferredPrompt(null);
    } catch (e) {
      console.error('[pwa] install failed', e);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md"
          role="dialog"
          aria-label="تثبيت التطبيق"
        >
          <div className="relative rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/20 p-4 overflow-hidden">
            {/* Decorative glow */}
            <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/20 blur-2xl" />

            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3 pr-8">
              {/* Icon */}
              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                <Smartphone className="w-6 h-6 text-white" />
                <Sparkles className="absolute -top-1 -right-1 w-3.5 h-3.5 text-amber-400" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm mb-0.5">
                  ثبّت Anzaro على موبايلك
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isIOS ? (
                    <>
                      اضغط زر المشاركة <span className="font-semibold">⎋</span> في Safari،
                      بعدين «إضافة إلى الشاشة الرئيسية»
                    </>
                  ) : (
                    <>
                      افتح Anzaro كأي تطبيق — من غير متجر، وكل ميزاتك تشتغل على الموبايل.
                    </>
                  )}
                </p>

                <div className="flex gap-2 mt-3">
                  {!isIOS && (
                    <Button
                      onClick={handleInstall}
                      size="sm"
                      className="h-8 text-xs gap-1.5 shadow-md shadow-primary/25"
                    >
                      <Download className="w-3.5 h-3.5" />
                      تثبيت
                    </Button>
                  )}
                  <Button
                    onClick={handleDismiss}
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                  >
                    بعدين
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
