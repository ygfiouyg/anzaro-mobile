'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, X, Radio, Music, Video, Type, Loader2,
  Volume2, VolumeX, RotateCcw, AlertTriangle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useChatStore } from '@/store/chat-store';
import { cn } from '@/lib/utils';

// ReactPlayer — dynamically imported (SSR-safe)
const ReactPlayer = dynamic(() => import('react-player'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-8 w-16 rounded-lg bg-muted/50 animate-pulse">
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    </div>
  ),
}) as any;

// ═══════════════════════════════════════════════════════════════════════
// NowPlayingBar — floating global media player
// ═══════════════════════════════════════════════════════════════════════
// Renders when `activeMedia` is set in the chat-store.
// Auto-plays the media (browser permitting) and persists across
// conversation switches — the player stays at the bottom of the screen.
// ═══════════════════════════════════════════════════════════════════════

const sourceConfig: Record<string, { icon: any; color: string; label: string }> = {
  radio:   { icon: Radio,  color: 'from-violet-500 to-fuchsia-500',     label: 'راديو' },
  spotify: { icon: Music,  color: 'from-emerald-500 to-green-500',      label: 'سبوتيفاي' },
  youtube: { icon: Video,  color: 'from-rose-500 to-red-500',           label: 'يوتيوب' },
  tts:     { icon: Type,   color: 'from-amber-500 to-orange-500',       label: 'نطق' },
};

export function NowPlayingBar() {
  const { activeMedia, clearActiveMedia } = useChatStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const playerRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);

  const widget = activeMedia;

  // ── Build source URL (TTS blob or direct stream) ──
  useEffect(() => {
    if (!widget) {
      setSourceUrl(null);
      return;
    }
    let url: string | null = null;
    if (widget.audioData) {
      try {
        const binary = window.atob(widget.audioData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: widget.mimeType || 'audio/mpeg' });
        url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
      } catch {
        setError(true);
      }
    } else {
      url = widget.streamUrl || null;
    }
    setSourceUrl(url);
    setIsReady(false);
    setError(false);
    // Reset playing state — will be set to true by onReady if autoPlay
    setIsPlaying(widget.autoPlay !== false);

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [widget?.audioData, widget?.streamUrl, widget?.title]);

  // ── Auto-play after ready (with retry) ──
  useEffect(() => {
    if (!isReady || !widget || error) return;
    if (widget.autoPlay === false) return;

    // Give ReactPlayer a tick to attach the media element, then play
    const timer = setTimeout(() => {
      const video = playerRef.current?.getInternalPlayer?.() || playerRef.current;
      if (video && typeof video.play === 'function') {
        video.play()
          .then(() => setIsPlaying(true))
          .catch((e: any) => {
            if (e?.name === 'NotAllowedError') {
              // Browser blocked autoplay — user needs to click play
              console.debug('[NowPlayingBar] Autoplay blocked — user interaction required');
              setIsPlaying(false);
            } else if (e?.name !== 'AbortError') {
              console.warn('[NowPlayingBar] play() failed:', e);
            }
          });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isReady, widget, error]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // ── Safe toggle play ──
  const togglePlay = useCallback(() => {
    const video = playerRef.current?.getInternalPlayer?.() || playerRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause?.();
      setIsPlaying(false);
    } else {
      video.play?.()
        .then(() => setIsPlaying(true))
        .catch((e: any) => {
          if (e?.name !== 'AbortError') {
            console.warn('[NowPlayingBar] toggle play failed:', e);
          }
        });
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const handleRetry = useCallback(() => {
    setError(false);
    setIsReady(false);
    // Force re-mount of ReactPlayer by toggling sourceUrl
    const url = sourceUrl;
    setSourceUrl(null);
    setTimeout(() => setSourceUrl(url), 100);
  }, [sourceUrl]);

  if (!widget || !sourceUrl) return null;

  const config = sourceConfig[widget.source || 'radio'] || sourceConfig.radio;
  const Icon = config.icon;
  const isVideo = widget.type === 'video';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pointer-events-none"
        dir="rtl"
      >
        <div className="mx-auto max-w-2xl pointer-events-auto">
          <div className="relative rounded-2xl border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl shadow-black/30 overflow-hidden">
            {/* Top gradient accent */}
            <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l', config.color)} />

            {/* Hidden ReactPlayer (audio-only mode) or visible video */}
            <div className={cn(isVideo ? 'relative' : 'absolute opacity-0 pointer-events-none h-0 overflow-hidden')}>
              <ReactPlayer
                ref={playerRef}
                src={sourceUrl || undefined}
                playing={isPlaying}
                muted={muted}
                volume={volume}
                controls={false}
                width="100%"
                height={isVideo ? '180px' : '1px'}
                onReady={() => setIsReady(true)}
                onStart={() => setIsReady(true)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={(e: any) => {
                  console.error('[NowPlayingBar] Player error:', e);
                  setError(true);
                }}
                config={{
                  youtube: {
                    origin: typeof window !== 'undefined' ? window.location.origin : '',
                    rel: 0,
                    enablejsapi: 1,
                    iv_load_policy: 3,
                  },
                  html: {
                    attributes: { preload: 'auto' },
                  },
                }}
                style={{ borderRadius: isVideo ? '12px 12px 0 0' : '0', overflow: 'hidden' }}
              />
            </div>

            {/* Control bar */}
            <div className="flex items-center gap-3 p-3">
              {/* Source icon + equalizer */}
              <div className={cn(
                'relative flex items-center justify-center size-11 rounded-xl bg-gradient-to-br shrink-0 shadow-lg',
                config.color
              )}>
                <Icon className="size-5 text-white" />
                {isPlaying && isReady && (
                  <div className="absolute -bottom-1 -right-1 flex items-end gap-0.5 h-3 bg-card rounded-full px-1 py-0.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-primary rounded-full"
                        style={{
                          height: '100%',
                          animation: `npb-eq 500ms ${i * 120}ms ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Title + status */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {widget.title}
                </p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  {!isReady && !error && (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      جاري التحميل...
                    </>
                  )}
                  {isReady && !error && isPlaying && (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      قيد التشغيل · {config.label}
                    </span>
                  )}
                  {isReady && !error && !isPlaying && (
                    <span className="text-amber-500">متوقف مؤقتاً</span>
                  )}
                  {error && (
                    <span className="text-red-500 flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      فشل التحميل
                    </span>
                  )}
                </p>
              </div>

              {/* Error retry */}
              {error && (
                <button
                  onClick={handleRetry}
                  className="size-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="إعادة المحاولة"
                  title="إعادة المحاولة"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}

              {/* Volume (audio only) */}
              {!isVideo && !error && (
                <button
                  onClick={toggleMute}
                  className="size-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
              )}

              {/* Play/Pause */}
              {!error && (
                <button
                  onClick={togglePlay}
                  disabled={!isReady}
                  className={cn(
                    'size-11 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40',
                    'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-105 active:scale-95'
                  )}
                  aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
                >
                  {!isReady ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="size-5" />
                  ) : (
                    <Play className="size-5 mr-0.5" />
                  )}
                </button>
              )}

              {/* Close */}
              <button
                onClick={() => {
                  // Stop playback then clear
                  const video = playerRef.current?.getInternalPlayer?.() || playerRef.current;
                  video?.pause?.();
                  clearActiveMedia();
                }}
                className="size-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="إغلاق المشغل"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <style>{`@keyframes npb-eq { 0% { transform: scaleY(0.2); } 100% { transform: scaleY(1); } }`}</style>
      </motion.div>
    </AnimatePresence>
  );
}
