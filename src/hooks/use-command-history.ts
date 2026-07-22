'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const STORAGE_KEY = 'anzaro-command-history'
const MAX_HISTORY = 50

export function useCommandHistory() {
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setHistory(parsed)
      }
    } catch {}
  }, [])

  const addCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return
    setHistory((prev) => {
      // Don't add duplicates of the last command
      if (prev[0] === cmd) return prev
      const newHistory = [cmd, ...prev.filter((c) => c !== cmd)].slice(0, MAX_HISTORY)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
      } catch {}
      return newHistory
    })
    setHistoryIndex(-1)
  }, [])

  const navigateHistory = useCallback((direction: 'up' | 'down', currentValue: string) => {
    if (history.length === 0) return null

    if (direction === 'up') {
      // Go back in history (older commands)
      const newIndex = historyIndex === -1 ? 0 : Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(newIndex)
      return history[newIndex]
    } else {
      // Go forward in history (newer commands)
      if (historyIndex === -1) return null
      const newIndex = historyIndex - 1
      if (newIndex === -1) {
        setHistoryIndex(-1)
        return currentValue // Return to what user was typing
      }
      setHistoryIndex(newIndex)
      return history[newIndex]
    }
  }, [history, historyIndex])

  const clearHistory = useCallback(() => {
    setHistory([])
    setHistoryIndex(-1)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [])

  return { history, addCommand, navigateHistory, clearHistory, historyIndex }
}
