'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { ChatApp } from '@/components/chat/ChatApp';
import { PdfCreatorApp } from '@/components/pdf/PdfCreatorApp';
import { AuthScreen } from '@/components/anzaro/AuthScreen';
import { OnboardingFlow } from '@/components/anzaro/OnboardingFlow';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { authFetch } from '@/lib/auth-fetch';

type AppView = 'chat' | 'pdf-creator';

export default function DeltaAIApp() {
  const { isAuthenticated, checkAuth, setGoogleSession } = useAuthStore();
  const [appView, setAppView] = useState<AppView>('chat');
  const [initializing, setInitializing] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Check auth on mount — handle Google OAuth redirect + normal auth
  useEffect(() => {
    const init = async () => {
      try {
        // V.14: Check for Google OAuth redirect (?google_login=TOKEN in URL)
        const urlParams = new URLSearchParams(window.location.search);
        const googleToken = urlParams.get('google_login');
        const googleName = urlParams.get('google_name') || '';

        if (googleToken) {
          // Google OAuth redirect detected — inject session token into store
          console.log('[Auth] Google OAuth redirect detected, injecting session...');
          await setGoogleSession(googleToken, googleName);
          // Clean the URL (remove query params) without reload
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // Normal auth check — read from persisted store
          await Promise.race([
            checkAuth(),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        }
      } catch (e) {
        console.warn('Auth check failed:', e);
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [checkAuth, setGoogleSession]);

  // V.101: Check if user needs Identity Matrix onboarding
  useEffect(() => {
    if (!isAuthenticated || initializing) return;

    const checkOnboarding = async () => {
      try {
        // Check if the user has a PersonalityProfile (Identity Matrix)
        const res = await authFetch('/api/anzaro/personality/profile');
        if (res.ok) {
          const data = await res.json();
          // If no profile exists, show the onboarding wizard
          if (!data.profile) {
            console.log('[Auth] No Identity Matrix found — showing OnboardingQuiz');
            setNeedsOnboarding(true);
          } else {
            setNeedsOnboarding(false);
          }
        } else {
          // If the API fails, don't block the user
          setNeedsOnboarding(false);
        }
      } catch {
        setNeedsOnboarding(false);
      }
    };
    checkOnboarding();
  }, [isAuthenticated, initializing]);

  // Loading screen — Smart Ball premium design
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aurora bg-grid relative overflow-hidden" dir="rtl">
        <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />
        <div className="relative flex flex-col items-center gap-6 z-10">
          <div className="relative w-20 h-20 rounded-full animate-ball-breathe"
            style={{
              background: 'radial-gradient(circle at 32% 28%, hsl(0 0% 100% / 30%), hsl(var(--primary)) 35%, hsl(var(--primary) / 0.7) 70%, hsl(var(--primary) / 0.5) 100%)',
              boxShadow: 'inset 0 2px 8px hsl(0 0% 100% / 40%), inset 0 -8px 24px hsl(0 0% 0% / 40%), 0 0 40px -4px hsl(var(--primary) / 0.5)',
            }}
          >
            <div className="absolute rounded-full" style={{ top: '18%', left: '24%', width: '28%', height: '22%', background: 'radial-gradient(ellipse, hsl(0 0% 100% / 70%), transparent 70%)', filter: 'blur(2px)' }} />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-2xl font-bold text-gradient">Anzaro AI</h1>
            <p className="text-muted-foreground text-xs">Anzaro بيستعد...</p>
          </div>
          <div className="w-[140px] h-[2px] rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ animation: "bootProgress 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards" }} />
          </div>
        </div>
        <style>{`@keyframes bootProgress { 0% { width: 0%; } 100% { width: 100%; } }`}</style>
      </div>
    );
  }

  // Not authenticated → show Smart Ball AuthScreen
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // V.101: Authenticated but no Identity Matrix → block with OnboardingQuiz
  if (isAuthenticated && needsOnboarding) {
    return (
      <OnboardingFlow
        onComplete={() => {
          setNeedsOnboarding(false);
          // Update auth state dynamically — no hard reload
        }}
      />
    );
  }

  // Authenticated + has Identity Matrix → show main app
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
