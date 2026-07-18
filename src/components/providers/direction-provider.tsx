'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';

export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const language = useAuthStore((state) => state.language);

  useEffect(() => {
    const dir = language === 'en' ? 'ltr' : 'rtl';
    const lang = language === 'egyptian' ? 'ar' : language;

    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [language]);

  return <>{children}</>;
}
