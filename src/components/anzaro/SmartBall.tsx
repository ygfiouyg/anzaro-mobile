'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface SmartBallProps {
  size?: number
  className?: string
  showLabel?: boolean
}

const STATUS_CONFIG = {
  idle: {
    labelAr: 'في انتظارك',
    labelEn: 'Idle',
    animation: 'animate-ball-breathe',
    ringCount: 0,
    glow: 0.35,
  },
  listening: {
    labelAr: 'بسمعك',
    labelEn: 'Listening',
    animation: 'animate-ball-listen',
    ringCount: 2,
    glow: 0.55,
  },
  processing: {
    labelAr: 'بفكّر',
    labelEn: 'Processing',
    animation: 'animate-ball-spin-slow',
    ringCount: 1,
    glow: 0.5,
  },
  executing: {
    labelAr: 'بينفّذ',
    labelEn: 'Executing',
    animation: 'animate-ball-execute',
    ringCount: 3,
    glow: 0.75,
  },
  speaking: {
    labelAr: 'بتكلم',
    labelEn: 'Speaking',
    animation: 'animate-ball-breathe',
    ringCount: 2,
    glow: 0.6,
  },
  error: {
    labelAr: 'في مشكلة',
    labelEn: 'Error',
    animation: '',
    ringCount: 0,
    glow: 0.4,
  },
} as const

export function SmartBall({ size = 120, className, showLabel = true }: SmartBallProps) {
  const ball = useAppStore((s) => s.ball)
  const config = STATUS_CONFIG[ball.status] ?? STATUS_CONFIG.idle
  const hue = ball.hue

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* Ripple rings */}
        {Array.from({ length: config.ringCount }).map((_, i) => (
          <span
            key={i}
            className="ball-ripple"
            style={{
              animationDelay: `${i * 0.6}s`,
              borderColor: `oklch(0.7 0.24 ${hue} / 45%)`,
            }}
          />
        ))}

        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: `radial-gradient(circle, oklch(0.7 0.24 ${hue} / ${config.glow}), transparent 70%)`,
            transform: 'scale(1.4)',
          }}
        />

        {/* The ball itself */}
        <motion.div
          className={cn('relative rounded-full', config.animation)}
          style={{
            width: size,
            height: size,
            background: `
              radial-gradient(circle at 32% 28%, oklch(0.92 0.06 ${hue} / 95%), oklch(0.72 0.22 ${hue}) 35%, oklch(0.52 0.2 ${hue}) 70%, oklch(0.38 0.16 ${hue}) 100%)
            `,
            boxShadow: `
              inset 0 2px 8px oklch(1 0 0 / 40%),
              inset 0 -8px 24px oklch(0 0 0 / 40%),
              0 0 40px -4px oklch(0.7 0.24 ${hue} / ${config.glow}),
              0 8px 32px -8px oklch(0.6 0.2 ${hue} / 60%)
            `,
          }}
          animate={{ scale: ball.status === 'executing' ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 1, repeat: ball.status === 'executing' ? Infinity : 0 }}
        >
          {/* Highlight */}
          <div
            className="absolute rounded-full"
            style={{
              top: '18%',
              left: '24%',
              width: '28%',
              height: '22%',
              background: 'radial-gradient(ellipse, oklch(1 0 0 / 70%), transparent 70%)',
              filter: 'blur(2px)',
            }}
          />
          {/* Inner swirl when processing */}
          <AnimatePresence>
            {ball.status === 'processing' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, transparent, oklch(1 0 0 / 30%), transparent)`,
                }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {showLabel && (
        <div className="text-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={ball.status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="text-sm font-semibold text-foreground"
            >
              {ball.labelAr}
            </motion.p>
          </AnimatePresence>
          <p className="text-[10px] uppercase tracking-widest text-primary/60 mt-0.5 font-mono">
            {config.labelEn}
          </p>
        </div>
      )}
    </div>
  )
}
