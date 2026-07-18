'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface SpeechRecognitionResult {
  transcript: string
}

// Web Speech API types (not in standard TS DOM lib)
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
  resultIndex: number
}

export function useVoiceInput(opts: {
  lang?: string
  onResult?: (text: string) => void
  onStateChange?: (listening: boolean) => void
} = {}) {
  const { lang = 'ar-EG', onResult, onStateChange } = opts
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [supported, setSupported] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  })
  const recogRef = useRef<any>(null)
  const cbRef = useRef({ onResult, onStateChange })
  useEffect(() => {
    cbRef.current = { onResult, onStateChange }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recog = new SR()
    recog.lang = lang
    recog.continuous = false
    recog.interimResults = true

    recog.onresult = (e: SpeechRecognitionEventLike) => {
      let finalText = ''
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0]
        if (alt) {
          if (e.results[i].isFinal) finalText += alt.transcript
          else interimText += alt.transcript
        }
      }
      setInterim(interimText)
      if (finalText) {
        setInterim('')
        cbRef.current.onResult?.(finalText.trim())
      }
    }

    recog.onerror = (e: any) => {
      setListening(false)
      setInterim('')
      cbRef.current.onStateChange?.(false)
    }

    recog.onend = () => {
      setListening(false)
      setInterim('')
      cbRef.current.onStateChange?.(false)
    }

    recogRef.current = recog
    return () => {
      try { recog.abort() } catch {}
    }
  }, [lang])

  const start = useCallback(() => {
    if (!recogRef.current) return
    try {
      recogRef.current.start()
      setListening(true)
      cbRef.current.onStateChange?.(true)
    } catch {}
  }, [])

  const stop = useCallback(() => {
    if (!recogRef.current) return
    try { recogRef.current.stop() } catch {}
    setListening(false)
    cbRef.current.onStateChange?.(false)
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { listening, interim, supported, start, stop, toggle }
}
