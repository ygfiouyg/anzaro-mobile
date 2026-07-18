'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { ChatApp } from '@/components/chat/ChatApp';
import { PdfCreatorApp } from '@/components/pdf/PdfCreatorApp';
import AuthPage from '@/components/auth/AuthPage';
import { SessionProvider } from '@/components/providers/SessionProvider';

type AppView = 'chat' | 'pdf-creator';

export default function DeltaAIApp() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [appView, setAppView] = useState<AppView>('chat');
  const [initializing, setInitializing] = useState(true);

  // Check auth on mount — with timeout fallback to prevent stuck loading
  useEffect(() => {
    const init = async () => {
      try {
        // Race checkAuth against a 3s timeout — if API is slow/unreachable, proceed anyway
        await Promise.race([
          checkAuth(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch (e) {
        // Ignore auth errors — proceed to show auth page
        console.warn('Auth check failed:', e);
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [checkAuth]);

  // Loading screen — minimal, fast, respects theme
  if (initializing) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        dir="rtl"
      >
        <div className="relative flex flex-col items-center gap-8">
          {/* Logo */}
          <div className="relative animate-[fadeIn_0.4s_ease-out]">
            <div className="absolute inset-0 rounded-[22px] blur-2xl bg-muted" />
            <div
              className="relative w-[72px] h-[72px] rounded-[22px] flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                boxShadow: "0 8px 24px rgb(37 99 235 / 0.3)",
              }}
            >
              <svg viewBox="0 0 32 32" className="w-[36px] h-[36px]" fill="none">
                <path
                  d="M16 3L28 16L16 29L4 16L16 3Z"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path d="M16 11L21 16L16 21L11 16L16 11Z" fill="#ffffff" />
              </svg>
            </div>
          </div>

          {/* Brand */}
          <div className="flex flex-col items-center gap-1.5 animate-[fadeIn_0.5s_ease-out_0.1s_both]">
            <h1
              className="text-[24px] font-semibold tracking-tight text-foreground"
              style={{ letterSpacing: "-0.03em" }}
            >
              Anzaro AI
            </h1>
            <p className="text-muted-foreground text-[12px] font-medium tracking-wider">
              يتم التحميل
            </p>
          </div>

          {/* Progress bar — blue on light gray track, visible in both themes */}
          <div className="w-[160px] h-[3px] rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                animation: "bootProgress 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
              }}
            />
          </div>
        </div>

        <style>{`
          @keyframes bootProgress {
            0% { width: 0%; }
            100% { width: 100%; }
          }
        `}</style>
      </div>
    );
  }

  // Not authenticated → show login page
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  // Authenticated → show main app
  if (appView === 'pdf-creator') {
    return (
      <SessionProvider>
        <PdfCreatorApp onBackToChat={() => setAppView('chat')} />
      </SessionProvider>
    );
  }

  return (
    <SessionProvider>
      <ChatApp onSwitchToPdfCreator={() => setAppView('pdf-creator')} />
    </SessionProvider>
  );
}
