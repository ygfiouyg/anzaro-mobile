'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Radio, Music, Video, Type, Loader2, AlertTriangle, ExternalLink,
  Play, Pause, Volume2, VolumeX, Repeat, Repeat1,
  PictureInPicture2, Gauge, Download, SkipBack, SkipForward,
  Maximize2, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════
// ReactPlayer — dynamically imported (SSR-safe)
// ═══════════════════════════════════════════════════════════════════════
const ReactPlayer = dynamic(() => import('react-player'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-12 w-full rounded-xl bg-zinc-800/50 animate-pulse">
      <Loader2 className="size-5 animate-spin text-zinc-500" />
    </div>
  ),
}) as any;

// ═══════════════════════════════════════════════════════════════════════
// ══ UPDATED AI MEDIA PAYLOAD INTERFACE ══
// ═══════════════════════════════════════════════════════════════════════
// This is the JSON shape the AI tool (/api/ai/play-media) should return
// in the `mediaWidget` field. All extended fields are optional — the AI
// can populate them when it has rich metadata (e.g. chapters from a
// podcast, start-time from a "play from 2:30" intent, etc.).
// ═══════════════════════════════════════════════════════════════════════

export interface Chapter {
  time: number;   // Start time in seconds
  title: string;
}

export interface MediaWidgetData {
  // ── Core fields (existing) ──
  type: 'audio' | 'video';
  source: 'radio' | 'spotify' | 'youtube' | 'tts' | 'soundcloud' | 'vimeo' | 'twitch' | 'file';
  title: string;
  streamUrl?: string;
  audioData?: string;       // Base64-encoded audio (TTS only)
  mimeType?: string;
  autoPlay?: boolean;
  duration?: number;
  thumbnail?: string;

  // ── Extended capabilities (NEW) ──
  startTime?: number;       // Start playback at this timestamp (seconds)
  endTime?: number;         // Stop playback at this timestamp (seconds)
  loop?: boolean;           // Auto-loop the media
  muted?: boolean;          // Start muted (autoplay-friendly)
  chapters?: Chapter[];     // Time markers / chapter list
  artist?: string;          // For OS Media Session (lock screen)
  album?: string;           // For OS Media Session (lock screen)
}

interface AudioPlayerProps {
  widget: MediaWidgetData;
  /** Called when media playback finishes — future hook for AI follow-up prompts */
  onMediaEnd?: (widget: MediaWidgetData) => void;
}

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

// ── Extract YouTube video ID (for detecting YouTube URLs) ──
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  if (url.includes('youtube.com/results')) return 'search';
  return null;
}

// ── Detect platform type from URL (broad platform support) ──
// Uses the same regex patterns as react-player v3 internally,
// so whatever react-player can handle, we pass through directly.
type PlayerType = 'youtube' | 'vimeo' | 'soundcloud' | 'twitch' | 'tiktok' | 'file' | 'stream';

function detectPlayerType(url: string): PlayerType {
  if (!url) return 'stream';
  if (/(?:youtu\.be\/|youtube(?:-nocookie|education)?\.com\/(?:embed\/|v\/|watch\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))/.test(url)) return 'youtube';
  if (/vimeo\.com\/(?!progressive_redirect).+/.test(url)) return 'vimeo';
  if (/open\.spotify\.com\/(\w+)\/(\w+)/i.test(url)) return 'spotify' as any;
  if (/(?:www\.|go\.)?twitch\.tv\/([a-zA-Z0-9_]+|(videos?\/|\?video=)\d+)/.test(url)) return 'twitch';
  if (/tiktok\.com\//.test(url)) return 'tiktok';
  if (/soundcloud\.com\//.test(url)) return 'soundcloud';
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|mp4|webm|mov|m4v)(\?|$|#)/i.test(url)) return 'file';
  if (/\.m3u8?(\?|$|#)/i.test(url)) return 'stream';
  if (/qurango\.net|radiojar\.com|icecast|shoutcast/i.test(url)) return 'stream';
  return 'file';
}

// ═══════════════════════════════════════════════════════════════════════
// DIRECT SOURCE PASSING — no proxy
// ═══════════════════════════════════════════════════════════════════════
// ReactPlayer receives the stream URL DIRECTLY (no /api/stream-audio proxy).
// The proxy was the root cause of the 30-second timeout — Next.js maxDuration
// kills the proxy connection, cutting off live radio streams.
//
// react-player v3 handles all platforms natively:
//   - YouTube/Vimeo/SoundCloud/Twitch/TikTok → IFrame-based players
//   - MP3/WAV/m3u8/radio streams → HTML5 <audio> element (no CORS needed
//     when crossOrigin is NOT set — the browser loads in no-cors mode)
// ═══════════════════════════════════════════════════════════════════════
function buildSourceUrl(widget: MediaWidgetData): string | null {
  if (!widget.streamUrl) return null;
  // Pass the URL directly to ReactPlayer — no proxy, no 30s cutoff.
  return widget.streamUrl;
}

function formatTime(s: number): string {
  if (!s || isNaN(s) || !isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function EqualizerBars({ isPlaying }: { isPlaying: boolean }) {
  if (!isPlaying) return null;
  return (
    <div className="flex items-end gap-0.5 h-3">
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="w-0.5 bg-blue-400 rounded-full"
          style={{
            height: '100%',
            animation: `eq-bar 600ms ${i * 100}ms ease-in-out infinite alternate`,
          }}
        />
      ))}
      <style>{`@keyframes eq-bar { 0% { transform: scaleY(0.2); } 100% { transform: scaleY(1); } }`}</style>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { icon: any; color: string }> = {
    radio:      { icon: Radio,  color: 'bg-blue-500/15 text-blue-400' },
    spotify:    { icon: Music,  color: 'bg-green-500/15 text-green-400' },
    youtube:    { icon: Video,  color: 'bg-red-500/15 text-red-400' },
    soundcloud: { icon: Music,  color: 'bg-orange-500/15 text-orange-400' },
    vimeo:      { icon: Video,  color: 'bg-cyan-500/15 text-cyan-400' },
    twitch:     { icon: Video,  color: 'bg-purple-500/15 text-purple-400' },
    tiktok:     { icon: Video,  color: 'bg-zinc-500/15 text-zinc-300' },
    tts:        { icon: Type,   color: 'bg-purple-500/15 text-purple-400' },
    file:       { icon: Music,  color: 'bg-zinc-500/15 text-zinc-400' },
  };
  const { icon: Icon, color } = config[source] || config.file;
  return (
    <div className={cn('flex-shrink-0 size-10 rounded-xl flex items-center justify-center', color)}>
      <Icon className="size-5" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════

export function AudioPlayer({ widget, onMediaEnd }: AudioPlayerProps) {
  // ── State ──
  const [isPlaying, setIsPlaying] = useState(widget.autoPlay !== false);
  const [isReady, setIsReady] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(widget.startTime || 0);
  const [duration, setDuration] = useState(widget.duration || 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(widget.muted || false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(widget.loop || false);
  const [isPip, setIsPip] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // ── Refs ──
  const playerRef = useRef<any>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wasPlayingRef = useRef(false);

  // ── Derived ──
  const isYouTubeSearch = widget.streamUrl?.includes('youtube.com/results') ?? false;
  const isYouTube = !!extractYouTubeId(widget.streamUrl || '');
  const isVideo = widget.type === 'video' || isYouTube;
  const isLiveStream = widget.source === 'radio';
  const isTTS = widget.source === 'tts';
  const playerHeight = isVideo ? '200px' : '50px';

  // ═══════════════════════════════════════════════════════════════════════
  // Seek helpers (defined early — used by Media Session effect + handlers)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Seek helper (works for both HTML5 and YouTube IFrame API) ──
  const seekToTime = useCallback((time: number) => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(time);
      } else {
        playerRef.current.currentTime = time;
      }
      setCurrentTime(time);
    } catch (e) {
      console.warn('[AudioPlayer] seek failed:', e);
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    if (!duration) return;
    const newTime = Math.max(0, Math.min(duration, currentTime + delta));
    seekToTime(newTime);
  }, [currentTime, duration, seekToTime]);

  // ═══════════════════════════════════════════════════════════════════════
  // Effects
  // ═══════════════════════════════════════════════════════════════════════

  // ── Build source URL (TTS blob or direct/proxied stream) ──
  useEffect(() => {
    let url: string | null = null;
    let blobUrlToRevoke: string | null = null;

    if (widget.audioData) {
      // TTS — Base64 → Blob → ObjectURL (bypasses HF binary corruption)
      try {
        const binary = window.atob(widget.audioData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: widget.mimeType || 'audio/mpeg' });
        url = URL.createObjectURL(blob);
        blobUrlToRevoke = url;
      } catch (e) {
        console.error('[AudioPlayer] Base64 decode failed:', e);
        setStreamError(true);
      }
    } else {
      url = buildSourceUrl(widget);
    }

    setSourceUrl(url);
    setIsReady(false);
    setStreamError(false);
    setCurrentTime(widget.startTime || 0);

    // ── Memory-leak prevention: revoke blob URL on unmount/change ──
    return () => {
      if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
    };
  }, [widget.audioData, widget.streamUrl, widget.mimeType, widget.startTime, retryKey]);

  // ── Persist volume + playbackRate to localStorage (hidden gem) ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('audioPlayer.settings');
      if (saved) {
        const { volume: v, playbackRate: r } = JSON.parse(saved);
        if (typeof v === 'number') setVolume(v);
        if (typeof r === 'number') setPlaybackRate(r);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('audioPlayer.settings', JSON.stringify({ volume, playbackRate }));
    } catch {}
  }, [volume, playbackRate]);

  // ── Wake Lock API — prevent screen sleep during playback (hidden gem) ──
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isPlaying && isReady) requestWakeLock();
    else releaseWakeLock();
    return () => { releaseWakeLock(); };
  }, [isPlaying, isReady, requestWakeLock, releaseWakeLock]);

  // Re-acquire wake lock when tab becomes visible again
  useEffect(() => {
    const onVisibility = async () => {
      if (!document.hidden && isPlaying) await requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isPlaying, requestWakeLock]);

  // ── Media Session API — OS-level media controls (hidden gem) ──
  // Integrates with lock screen, media keys, headphone buttons, Bluetooth
  useEffect(() => {
    if (!('mediaSession' in navigator) || !isReady) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: widget.title,
        artist: widget.artist || widget.source,
        album: widget.album || 'Anzaro AI',
        artwork: widget.thumbnail
          ? [{ src: widget.thumbnail, sizes: '512x512', type: 'image/png' }]
          : [],
      });
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('seekbackward', () => seekBy(-10));
      navigator.mediaSession.setActionHandler('seekforward', () => seekBy(10));
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}
    return () => {
      try { navigator.mediaSession.setActionHandler('play', null); } catch {}
      try { navigator.mediaSession.setActionHandler('pause', null); } catch {}
      try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch {}
      try { navigator.mediaSession.setActionHandler('seekforward', null); } catch {}
    };
  }, [widget.title, widget.artist, widget.source, widget.album, widget.thumbnail, isReady, isPlaying, seekBy]);

  // ── Auto-resume on tab refocus (fixes AbortError: page was frozen) ──
  // CRITICAL: The old code did setIsPlaying(false) then setIsPlaying(true) in
  // the same frame. This caused react-player to call pause() then play() in
  // rapid succession → "AbortError: play() interrupted by pause()".
  // Fix: Only resume if ACTUALLY paused (check the media element), and add
  // a 300ms delay to let the browser thaw from the frozen state.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        wasPlayingRef.current = isPlaying;
      } else if (wasPlayingRef.current) {
        // Tab regained focus — wait 300ms for browser to thaw, then check
        // if the media is actually paused before nudging it
        const resumeTimer = setTimeout(() => {
          const video = playerRef.current;
          if (!video) return;
          // Only resume if actually paused (not already playing)
          if (video.paused && wasPlayingRef.current) {
            // Inline safe play to avoid hoisting issues
            video.play().then(() => {
              if (video && !video.paused) setIsPlaying(true);
            }).catch((e: any) => {
              if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') {
                console.warn('[AudioPlayer] resume play failed:', e);
              }
            });
          }
        }, 300);
        // Cleanup if component unmounts or visibility changes again
        return () => clearTimeout(resumeTimer);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isPlaying]);

  // ── PiP state tracking ──
  useEffect(() => {
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);
    document.addEventListener('enterpictureinpicture', onEnterPip);
    document.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      document.removeEventListener('enterpictureinpicture', onEnterPip);
      document.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // Player config (YouTube start/end time via config)
  // ═══════════════════════════════════════════════════════════════════════
  const playerConfig = useMemo(() => ({
    youtube: {
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      rel: 0 as 0 | 1,
      enablejsapi: 1 as 0 | 1,
      iv_load_policy: 3 as 1 | 3,
      fs: 1 as 0 | 1,
      start: widget.startTime,
      end: widget.endTime,
    },
    html: {
      attributes: {
        preload: 'auto' as const,
        // NOTE: crossOrigin is intentionally NOT set. Radio streams (icecast/
        // shoutcast) don't send CORS headers — setting crossOrigin='anonymous'
        // would cause the browser to BLOCK the request. Without it, the audio
        // element loads in no-cors mode, which works for playback.
      },
    },
  }), [widget.startTime, widget.endTime]);

  // ═══════════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════════

  // ── onEnded — media finished callback ──
  const handleEnded = useCallback(() => {
    console.log('Media playback finished');
    // ────────────────────────────────────────────────────────────────────
    // TODO: Hook into chat state to trigger AI follow-up prompts.
    // Planned flow:
    //   1. onMediaEnd?.(widget)  →  notify parent (MessageBubble)
    //   2. Parent appends a system message to chat: "Did you enjoy that?"
    //   3. AI suggests similar tracks, asks for feedback, or offers to
    //      play the next chapter/episode automatically.
    // ────────────────────────────────────────────────────────────────────
    onMediaEnd?.(widget);
    if (isLooping) {
      // Manually restart (for platforms where native loop doesn't work)
      seekToTime(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [onMediaEnd, widget, isLooping, seekToTime]);

  // ── onReady — seek to startTime for non-YouTube platforms ──
  const handleReady = useCallback(() => {
    setIsReady(true);
    // YouTube uses config.youtube.start, but other platforms need manual seek
    if (widget.startTime && !isYouTube) {
      seekToTime(widget.startTime);
    }
  }, [widget.startTime, isYouTube, seekToTime]);

  // ── Native HTML5 event handlers (v3 uses native events, not v2 custom) ──
  const handleTimeUpdate = useCallback((e: any) => {
    const video = e?.target || playerRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime || 0);
    // Auto-stop at endTime (for non-YouTube platforms)
    if (widget.endTime && video.currentTime >= widget.endTime && !isYouTube) {
      setIsPlaying(false);
      handleEnded();
    }
  }, [widget.endTime, isYouTube, handleEnded]);

  const handleProgress = useCallback((e: any) => {
    const video = e?.target || playerRef.current;
    if (!video?.buffered?.length) return;
    try {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    } catch {}
  }, []);

  const handleLoadedMetadata = useCallback((e: any) => {
    const video = e?.target;
    if (video?.duration && isFinite(video.duration)) {
      setDuration(video.duration);
    }
    if (widget.startTime && !isYouTube) {
      seekToTime(widget.startTime);
    }
  }, [widget.startTime, isYouTube, seekToTime]);

  const handleDurationChange = useCallback((e: any) => {
    const video = e?.target || playerRef.current;
    if (video?.duration && isFinite(video.duration)) {
      setDuration(video.duration);
    }
  }, []);

  const handleError = useCallback((e: any) => {
    // Log the stream URL so we can debug "البث غير متاح" errors. Most often
    // the cause is a broken/404 stream URL — we've fixed the DB seed URLs
    // (qurango typos, dead nogoumfm.net, etc.) so this should be rare now.
    console.error('[AudioPlayer] react-player error:', e, 'url=', widget.streamUrl);
    setStreamError(true);
    setIsPlaying(false);
  }, [widget.streamUrl]);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  // ── Control handlers ──
  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
  const toggleMute = useCallback(() => setMuted(m => !m), []);
  const toggleLoop = useCallback(() => setIsLooping(l => !l), []);

  const togglePip = useCallback(async () => {
    const video = playerRef.current;
    if (!video) return;

    // ── If PiP is active, exit it ──
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        setIsPip(false);
      } catch (e) {
        console.warn('[AudioPlayer] Exit PiP failed:', e);
      }
      return;
    }

    // ── Not supported? Bail early ──
    if (!video.requestPictureInPicture) {
      console.warn('[AudioPlayer] PiP not supported on this element');
      return;
    }

    // ── If metadata not loaded yet, wait for it (with timeout + cleanup) ──
    if (video.readyState < 1) {
      console.warn('[AudioPlayer] PiP: waiting for metadata...');
      // Use an AbortController so if the component unmounts, we cancel the wait
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s max wait

      try {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error('Media failed to load'));
          };
          const cleanup = () => {
            clearTimeout(timeoutId);
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('error', onError);
          };
          controller.signal.addEventListener('abort', () => {
            cleanup();
            reject(new Error('Timed out waiting for metadata'));
          });
          video.addEventListener('loadedmetadata', onLoaded, { signal: controller.signal });
          video.addEventListener('error', onError, { signal: controller.signal });
          // Nudge the browser to start loading
          try { video.load(); } catch {}
        });

        // Now metadata is loaded — request PiP
        await video.requestPictureInPicture();
        setIsPip(true);
      } catch (e) {
        console.warn('[AudioPlayer] PiP failed:', e);
      }
      return;
    }

    // ── Metadata already loaded — request PiP directly ──
    try {
      await video.requestPictureInPicture();
      setIsPip(true);
    } catch (e) {
      console.warn('[AudioPlayer] PiP failed:', e);
    }
  }, []);

  // ── Safe play() wrapper — catches AbortError silently ──
  // The browser throws AbortError when:
  //   1. play() is called, then pause() is called before it resolves
  //   2. play() is called, then a new load() is triggered
  //   3. The user navigates away mid-play
  // These are NOT real errors — they're normal race conditions.
  const safePlay = useCallback(async (video: HTMLMediaElement) => {
    try {
      await video.play();
      return true;
    } catch (e: any) {
      // AbortError is expected and safe to ignore
      if (e?.name === 'AbortError') {
        console.debug('[AudioPlayer] play() interrupted (AbortError) — safe to ignore');
        return false;
      }
      // NotAllowedError = autoplay blocked by browser policy
      if (e?.name === 'NotAllowedError') {
        console.debug('[AudioPlayer] Autoplay blocked — user interaction required');
        setIsPlaying(false);
        return false;
      }
      console.warn('[AudioPlayer] play() failed:', e);
      return false;
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen?.();
    }
  }, []);

  const handleSpeedChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seekToTime(percent * duration);
  }, [duration, seekToTime]);

  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    setHoverTime(Math.max(0, Math.min(duration, percent * duration)));
  }, [duration]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setMuted(vol === 0);
  }, []);

  const handleDownload = useCallback(() => {
    if (!sourceUrl) return;
    const a = document.createElement('a');
    a.href = sourceUrl;
    a.download = `${widget.title || 'audio'}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [sourceUrl, widget.title]);

  const handleRetry = useCallback(() => {
    setStreamError(false);
    setRetryKey(k => k + 1);
  }, []);

  // ── Keyboard shortcuts (when container is focused) ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekBy(-10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekBy(10);
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'l':
        e.preventDefault();
        toggleLoop();
        break;
      case 'f':
        e.preventDefault();
        handleFullscreen();
        break;
    }
  }, [togglePlay, seekBy, toggleMute, toggleLoop, handleFullscreen]);

  // ── Seek to chapter ──
  const handleChapterClick = useCallback((time: number) => {
    seekToTime(time);
  }, [seekToTime]);

  // ═══════════════════════════════════════════════════════════════════════
  // Derived render values
  // ═══════════════════════════════════════════════════════════════════════
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const canDownload = isTTS && !!sourceUrl;

  // ═══════════════════════════════════════════════════════════════════════
  // Render — YouTube search fallback
  // ═══════════════════════════════════════════════════════════════════════
  if (isYouTubeSearch) {
    return (
      <div className="w-full rounded-2xl border border-zinc-700/50 dark:border-white/10 bg-zinc-900 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black p-4 shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40">
        <div className="flex items-center gap-3 mb-3">
          <SourceBadge source="youtube" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{widget.title}</p>
            <p className="text-[10px] text-zinc-500">YouTube Search</p>
          </div>
        </div>
        <a
          href={widget.streamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
        >
          <ExternalLink className="size-4" />
          فتح على YouTube
        </a>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render — YouTube (plain iframe — most reliable method)
  // ═══════════════════════════════════════════════════════════════════════
  // We use a plain <iframe> for YouTube instead of react-player because:
  //   1. It's the official YouTube embed method (used by Reddit, Discord,
  //      Twitter, Facebook — every major platform)
  //   2. No lazy-loading race conditions (react-player v3's youtube-video-element
  //      can fail to register the custom element)
  //   3. YouTube's native controls are better than our custom controls for video
  //   4. Smaller bundle size (no youtube-video-element dependency loaded)
  // The CSP in src/proxy.ts now includes frame-src https://www.youtube.com
  //
  // IMPORTANT: We use widget.streamUrl directly (NOT sourceUrl from useEffect)
  // because sourceUrl is null on first render — the useEffect hasn't run yet.
  // Using widget.streamUrl ensures the iframe renders IMMEDIATELY on mount.
  // ═══════════════════════════════════════════════════════════════════════
  if (isYouTube && !isYouTubeSearch && widget.streamUrl) {
    // Extract the video ID from the stream URL to build a clean embed URL
    const ytId = extractYouTubeId(widget.streamUrl) || '';
    const embedUrl = ytId
      ? `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
      : widget.streamUrl;

    return (
      <div className="w-full rounded-2xl overflow-hidden border border-zinc-700/50 dark:border-white/10 bg-zinc-900 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40">
        {/* Header — SOLID background (no transparency) */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 border-b border-zinc-700/50">
          <SourceBadge source="youtube" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{widget.title}</p>
            <p className="text-[10px] text-zinc-500">YouTube</p>
          </div>
          {widget.thumbnail && (
            <img src={widget.thumbnail} alt="" className="size-8 rounded object-cover" />
          )}
        </div>
        {/* YouTube iframe — the actual video player */}
        <iframe
          src={embedUrl}
          className="w-full aspect-video bg-black"
          allow="autoplay; encrypted-media; accelerometer; clipboard-write; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          title={widget.title}
          referrerPolicy="strict-origin-when-cross-origin"
          frameBorder={0}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render — Error fallback with retry
  // ═══════════════════════════════════════════════════════════════════════
  if (streamError) {
    return (
      <div className="w-full rounded-2xl border border-red-900/50 dark:border-red-900/30 bg-zinc-900 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black p-4 shadow-2xl shadow-red-900/20">
        <div className="flex items-center gap-3 mb-3">
          <SourceBadge source={widget.source} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{widget.title}</p>
            <p className="text-[10px] text-zinc-500 capitalize">{widget.source}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-red-500/10 border border-red-900/30">
          <AlertTriangle className="size-4 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400">⚠️ البث غير متاح حالياً</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRetry}
            className="flex items-center justify-center gap-2 flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
          >
            <RotateCcw className="size-4" />
            إعادة المحاولة
          </button>
          {widget.streamUrl && (
            <a
              href={widget.streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
              title="فتح البث في تبويب جديد للتحقق منه خارج التطبيق"
            >
              <ExternalLink className="size-4" />
              فتح في تبويب
            </a>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render — Main player
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-full rounded-2xl border border-zinc-700/50 dark:border-white/10 bg-zinc-900 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black p-4 shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-3">
        <SourceBadge source={widget.source} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">{widget.title}</p>
          <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            {isLiveStream && (
              <span className="inline-block size-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
            <span className="capitalize">{widget.source}</span>
            {widget.artist && <span className="text-zinc-600">· {widget.artist}</span>}
            {playbackRate !== 1 && (
              <span className="text-blue-400 font-medium">· {playbackRate}x</span>
            )}
          </p>
        </div>
        {widget.thumbnail && (
          <img src={widget.thumbnail} alt="" className="size-10 rounded-lg object-cover" />
        )}
      </div>

      {/* ── ReactPlayer ── */}
      <div className={cn('overflow-hidden rounded-xl', !isReady && 'opacity-0 absolute pointer-events-none')}>
        <ReactPlayer
          ref={playerRef}
          src={sourceUrl || undefined}
          playing={isPlaying}
          controls={false}
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          loop={isLooping}
          pip
          width="100%"
          height={playerHeight}
          config={playerConfig}
          onReady={handleReady}
          onStart={() => setIsReady(true)}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          onTimeUpdate={handleTimeUpdate}
          onProgress={handleProgress}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          style={{ borderRadius: '12px', overflow: 'hidden' }}
        />
      </div>

      {/* ── Loading skeleton ── */}
      {!isReady && (
        <div className="flex items-center justify-center gap-2 h-12 w-full rounded-xl bg-zinc-800/50 animate-pulse">
          <Loader2 className="size-4 animate-spin text-zinc-400" />
          <span className="text-xs text-zinc-500">جاري التحميل...</span>
        </div>
      )}

      {/* ── Controls ── */}
      {isReady && (
        <div className="mt-3 space-y-2">
          {/* Progress bar (hidden for live streams) */}
          {!isLiveStream && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 tabular-nums w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <div
                ref={progressRef}
                onMouseMove={handleProgressHover}
                onMouseLeave={() => setHoverTime(null)}
                onClick={handleSeek}
                className="flex-1 h-1.5 rounded-full bg-zinc-700/50 cursor-pointer relative group"
              >
                {/* Buffered */}
                <div
                  className="absolute inset-y-0 left-0 bg-zinc-600/40 rounded-full"
                  style={{ width: `${bufferedPct}%` }}
                />
                {/* Progress fill */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
                {/* Hover indicator */}
                {hoverTime !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/60 pointer-events-none"
                    style={{ left: `${duration > 0 ? (hoverTime / duration) * 100 : 0}%` }}
                  />
                )}
                {/* Chapter markers */}
                {widget.chapters?.map((ch, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-1 bg-yellow-400/70 pointer-events-none rounded-full"
                    style={{ left: `${duration > 0 ? (ch.time / duration) * 100 : 0}%` }}
                    title={ch.title}
                  />
                ))}
                {/* Hover tooltip */}
                {hoverTime !== null && (
                  <div
                    className="absolute -top-7 px-1.5 py-0.5 bg-zinc-800 bg-gradient-to-br from-zinc-800 to-zinc-900 text-white text-[10px] rounded-md shadow-xl border border-zinc-700/60 pointer-events-none -translate-x-1/2 whitespace-nowrap z-10"
                    style={{ left: `${duration > 0 ? (hoverTime / duration) * 100 : 0}%` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-zinc-500 tabular-nums w-10">
                {formatTime(duration)}
              </span>
            </div>
          )}

          {/* Live indicator for radio */}
          {isLiveStream && (
            <div className="flex items-center justify-center gap-2 py-1">
              <span className="inline-block size-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-red-400 font-medium tracking-wide">LIVE BROADCAST</span>
              <EqualizerBars isPlaying={isPlaying} />
            </div>
          )}

          {/* Control buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Skip back ±10s */}
            {!isLiveStream && (
              <button
                onClick={() => seekBy(-10)}
                className="size-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
                aria-label="رجوع 10 ثوانٍ"
                title="رجوع 10 ثوانٍ (←)"
              >
                <SkipBack className="size-4" />
              </button>
            )}

            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              className={cn(
                'size-9 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                isPlaying
                  ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100'
                  : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20'
              )}
              aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
              title={isPlaying ? 'إيقاف (مسافة)' : 'تشغيل (مسافة)'}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
            </button>

            {/* Skip forward ±10s */}
            {!isLiveStream && (
              <button
                onClick={() => seekBy(10)}
                className="size-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
                aria-label="تقديم 10 ثوانٍ"
                title="تقديم 10 ثوانٍ (→)"
              >
                <SkipForward className="size-4" />
              </button>
            )}

            {/* Volume */}
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={toggleMute}
                className="size-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
                aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
                title="كتم (m)"
              >
                {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-14 h-1 accent-blue-500 cursor-pointer"
                aria-label="مستوى الصوت"
              />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* ── Speed control ── */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={cn(
                  'h-8 px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors',
                  playbackRate !== 1
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                )}
                aria-label="سرعة التشغيل"
                title="سرعة التشغيل"
              >
                <Gauge className="size-3.5" />
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSpeedMenu(false)} />
                  <div className="absolute bottom-full mb-2 right-0 z-20 bg-zinc-800 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl shadow-2xl shadow-blue-900/30 border border-zinc-700/60 dark:border-white/10 ring-1 ring-white/5 py-1 min-w-[72px]">
                    {PLAYBACK_RATES.map(rate => (
                      <button
                        key={rate}
                        onClick={() => handleSpeedChange(rate)}
                        className={cn(
                          'block w-full px-3 py-1.5 text-xs text-left rounded-lg mx-1 transition-colors duration-150',
                          playbackRate === rate
                            ? 'text-blue-400 font-medium bg-blue-500/10'
                            : 'text-zinc-300 hover:bg-blue-500/10 hover:text-blue-400'
                        )}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Loop toggle ── */}
            <button
              onClick={toggleLoop}
              className={cn(
                'size-8 rounded-lg flex items-center justify-center transition-colors',
                isLooping
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              )}
              aria-label="تكرار"
              title="تكرار (l)"
            >
              {isLooping ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
            </button>

            {/* ── PiP (video only) ── */}
            {isVideo && (
              <button
                onClick={togglePip}
                className={cn(
                  'size-8 rounded-lg flex items-center justify-center transition-colors',
                  isPip
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                )}
                aria-label="صورة في صورة"
                title="صورة داخل صورة"
              >
                <PictureInPicture2 className="size-4" />
              </button>
            )}

            {/* ── Fullscreen (video only) ── */}
            {isVideo && (
              <button
                onClick={handleFullscreen}
                className="size-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
                aria-label="ملء الشاشة"
                title="ملء الشاشة (f)"
              >
                <Maximize2 className="size-4" />
              </button>
            )}

            {/* ── Download (TTS only — hidden gem) ── */}
            {canDownload && (
              <button
                onClick={handleDownload}
                className="size-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
                aria-label="تحميل"
                title="تحميل الصوت"
              >
                <Download className="size-4" />
              </button>
            )}
          </div>

          {/* ── Chapters list (if provided) ── */}
          {widget.chapters && widget.chapters.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-zinc-800/30 border border-zinc-700/30 custom-scroll">
              {widget.chapters.map((ch, i) => {
                const isActive =
                  currentTime >= ch.time &&
                  (i === widget.chapters!.length - 1 ||
                    currentTime < (widget.chapters![i + 1]?.time ?? Infinity));
                return (
                  <button
                    key={i}
                    onClick={() => handleChapterClick(ch.time)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-zinc-800/50 transition-colors text-left',
                      isActive ? 'text-blue-400' : 'text-zinc-400'
                    )}
                  >
                    <span className="tabular-nums text-zinc-600 flex-shrink-0">
                      {formatTime(ch.time)}
                    </span>
                    <span className="truncate">{ch.title}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Keyboard hint */}
          <div className="text-[9px] text-zinc-600 text-center select-none">
            اختصارات: مسافة (تشغيل/إيقاف) · ← → (تخطي 10ث) · m (كتم) · l (تكرار) · f (شاشة كاملة)
          </div>
        </div>
      )}
    </div>
  );
}
