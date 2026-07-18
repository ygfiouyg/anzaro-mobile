'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, Volume2, Radio, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/store/auth-store';

interface Broadcast {
  id: string;
  title: string;
  audioUrl: string;
  duration: number;
  isActive: boolean;
  playedCount: number;
  createdAt: string;
  type?: string;
}

// Persist dismissed broadcast IDs in sessionStorage so they survive re-renders
// but not page reloads (user should see announcements on fresh visits)
function getDismissedIds(): Set<string> {
  try {
    const stored = sessionStorage.getItem('delta-dismissed-broadcasts');
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveDismissedId(id: string) {
  try {
    const current = getDismissedIds();
    current.add(id);
    sessionStorage.setItem('delta-dismissed-broadcasts', JSON.stringify([...current]));
  } catch {
    // ignore
  }
}

export function VoiceBroadcast() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const simulateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { token } = useAuthStore();

  // Fetch active broadcasts
  // CRITICAL: Uses AbortController to handle:
  //   1. React Strict Mode double-mount (Next.js 16 dev) — first effect's fetch
  //      gets aborted when cleanup runs, preventing "setState on unmounted component"
  //   2. Component unmount while fetch in-flight
  //   3. Interval fire while previous fetch still pending
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const fetchBroadcasts = async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/voice/broadcast', {
          headers,
          signal: controller.signal, // abort if component unmounts
        });
        if (!response.ok) return;

        const data = await response.json();
        // Guard against setState after unmount (Strict Mode safe)
        if (!isMounted || controller.signal.aborted) return;

        if (data.broadcasts && data.broadcasts.length > 0) {
          const dismissedIds = getDismissedIds();
          // Find the first non-dismissed broadcast
          const activeBroadcast = data.broadcasts.find(
            (b: Broadcast) => !dismissedIds.has(b.id)
          );
          if (activeBroadcast) {
            setBroadcast(activeBroadcast);
          } else {
            setBroadcast(null);
          }
        } else {
          setBroadcast(null);
        }
      } catch (error: any) {
        // AbortError is expected (Strict Mode / unmount) — don't log it
        if (error?.name === 'AbortError') return;
        console.error('[VoiceBroadcast] Error fetching broadcasts:', error);
      }
    };

    fetchBroadcasts();
    // Poll every 30 seconds for new broadcasts
    const interval = setInterval(fetchBroadcasts, 30000);

    // Cleanup: abort in-flight fetch + prevent further setState
    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [token]);

  // Setup audio element
  useEffect(() => {
    if (broadcast && broadcast.audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.src = broadcast.audioUrl;

      const onLoadedMetadata = () => {
        setDuration(audio.duration || broadcast.duration || 0);
      };
      const onTimeUpdate = () => {
        const current = audio.currentTime || 0;
        const total = audio.duration || 1;
        setCurrentTime(current);
        setProgress((current / total) * 100);
      };
      const onEnded = () => {
        setIsPlaying(false);
        setProgress(100);
      };

      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('ended', onEnded);

      return () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
        audio.pause();
      };
    }
  }, [broadcast]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        // If no valid audio URL, simulate playback
        setIsPlaying(true);
        simulateProgress();
      });
    }
    setIsPlaying(!isPlaying);
  };

  const simulateProgress = () => {
    // Clear any existing simulation
    if (simulateIntervalRef.current) {
      clearInterval(simulateIntervalRef.current);
    }

    let current = progress;
    simulateIntervalRef.current = setInterval(() => {
      current += 0.5;
      if (current >= 100) {
        if (simulateIntervalRef.current) {
          clearInterval(simulateIntervalRef.current);
          simulateIntervalRef.current = null;
        }
        setIsPlaying(false);
        setProgress(100);
        return;
      }
      setProgress(current);
    }, 100);
  };

  const handleDismiss = () => {
    if (broadcast) {
      // Persist the dismissed broadcast ID
      saveDismissedId(broadcast.id);
    }
    setBroadcast(null);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // Clear any simulation
    if (simulateIntervalRef.current) {
      clearInterval(simulateIntervalRef.current);
      simulateIntervalRef.current = null;
    }
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if this is a text-only broadcast (no valid audio URL)
  const isTextOnly = broadcast && (!broadcast.audioUrl || broadcast.audioUrl === '');

  // Don't show if no active broadcast (either none or dismissed)
  if (!broadcast) return null;

  // Text-only broadcast: show as persistent banner that NEVER auto-dismisses
  if (isTextOnly) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="border-b border-border bg-gradient-to-l from-blue-600 to-blue-500"
        >
          <div className="flex items-center gap-3 px-4 py-2.5" dir="rtl">
            {/* Megaphone Icon */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center size-8 rounded-full bg-blue-600">
                <Megaphone className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>

            {/* Broadcast message */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  إعلان
                </span>
                <span className="text-sm text-foreground truncate">
                  {broadcast.title}
                </span>
              </div>
            </div>

            {/* Dismiss button — only way to close */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="min-h-[36px] min-w-[36px] h-9 w-9 text-muted-foreground hover:text-foreground flex-shrink-0"
              aria-label="إغلاق الإعلان"
            >
              <X className="size-4" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Audio broadcast: show with player controls
  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border bg-gradient-to-l from-blue-600 to-blue-500"
      >
        <div className="flex items-center gap-3 px-4 py-2" dir="rtl">
          {/* Radio Icon */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center size-8 rounded-full bg-blue-600">
              <Radio className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          {/* Broadcast Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                بث مباشر
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-sm font-medium text-foreground truncate">
                {broadcast.title}
              </span>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <Progress value={progress} className="h-1.5 flex-1" />
              <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                {duration > 0
                  ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                  : `${Math.round(progress)}%`
                }
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="min-h-[36px] min-w-[36px] h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
              aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
            >
              {isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 mr-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="min-h-[36px] min-w-[36px] h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="إغلاق البث"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
