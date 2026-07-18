'use client'

import { ThemeProvider } from '@/components/providers/theme-provider'
import { useAppStore } from '@/lib/store'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const hue = useAppStore((s) => s.hue)
  return <ThemeProvider hue={hue}>{children}</ThemeProvider>
}
