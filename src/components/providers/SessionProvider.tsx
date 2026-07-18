'use client';

/**
 * Client-side SessionProvider for NextAuth.
 * Wrap the app once (in page.tsx) so `useSession()` works everywhere.
 *
 * مهم: بنـ set refetchInterval false + baseURL علشان نمنع
 * CLIENT_FETCH_ERROR اللي بيحصل لما next-auth يحاول يعمل fetch
 * على endpoint مش متاح أو بيرجع HTML بدل JSON.
 */
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider
      // refetchOnMount=false: ما تعملش fetch تلقائي عند كل mount
      // refetchOnWindowFocus=false: ما تعملش fetch لما المستخدم يرجع للتبويب
      refetchOnMount={false}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
