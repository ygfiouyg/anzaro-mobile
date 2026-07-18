'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { useEffect } from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
  hue?: number
}

export function ThemeProvider({ children, hue }: ThemeProviderProps) {
  useEffect(() => {
    if (typeof hue === 'number') {
      document.documentElement.style.setProperty('--hue', String(hue))
    }
  }, [hue])

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}
