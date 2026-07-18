"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Play, Pause, Loader2, Link2, Search, X, Youtube, Volume2, SkipForward, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth-store";
import { startSpotifyPKCE, handleSpotifyPKCECallback } from "@/lib/spotify-pkce";

// ─── Spotify Web Playback SDK types ───
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

interface SpotifyTrack {
  uri: string;
  name: string;
  artist: string;
  albumArt: string;
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

type Source = 'spotify' | 'youtube';

export function MusicPlayer() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>('youtube'); // default YouTube (free)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<any>(null);

  // Spotify SDK state
  const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  // YouTube state
  const [ytVideoId, setYtVideoId] = useState<string | null>(null);

  const { token } = useAuthStore();
  const authHeaders = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  // ─── Load Spotify SDK ───
  useEffect(() => {
    if (source !== 'spotify') return;
    if (sdkReady) return;

    // Load SDK script
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      setSdkReady(true);
    };

    return () => {
      document.body.removeChild(script);
    };
  }, [source, sdkReady]);

  // ─── Initialize Spotify Player ───
  // Token promise cache: prevents race condition when SDK + play button
  // both call getOAuthToken concurrently. Without this, two fetch requests
  // hit the API simultaneously, and the stale response can overwrite the
  // fresh one, causing authentication failures.
  const tokenPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (!sdkReady || !connected || spotifyPlayer) return;

    const player = new window.Spotify.Player({
      name: 'Anzaro AI Web Player',
      getOAuthToken: async (cb: (token: string) => void) => {
        try {
          // Deduplicate concurrent token requests
          if (!tokenPromiseRef.current) {
            tokenPromiseRef.current = fetch('/api/spotify/web-player-token', { headers: authHeaders })
              .then((res) => res.ok ? res.json() : null)
              .then((data) => data?.access_token || null)
              .catch(() => null)
              .finally(() => {
                // Clear cache after 30s so next request gets a fresh token
                setTimeout(() => { tokenPromiseRef.current = null; }, 30_000);
              });
          }
          const token = await tokenPromiseRef.current;
          if (token) cb(token);
        } catch (e) {
          console.error('[Spotify SDK] Token fetch failed:', e);
          tokenPromiseRef.current = null;
        }
      },
      volume: 0.5,
    });

    // Ready
    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('[Spotify SDK] Ready with Device ID:', device_id);
      setSpotifyDeviceId(device_id);
    });

    // Not Ready
    player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      console.log('[Spotify SDK] Device ID not ready:', device_id);
      setSpotifyDeviceId(null);
    });

    // Player state changed
    player.addListener('player_state_changed', (state: any) => {
      if (!state) return;
      setPlaying(!state.paused);
      if (state.track_window?.current_track) {
        const t = state.track_window.current_track;
        setCurrentTrack({
          name: t.name,
          artist: t.artists.map((a: any) => a.name).join(', '),
          albumArt: t.album.images[0]?.url,
        });
      }
    });

    // Error handlers
    player.addListener('initialization_error', ({ message }: { message: string }) => {
      console.error('[Spotify SDK] Init error:', message);
      toast.error('Spotify SDK: ' + message);
    });

    player.addListener('authentication_error', ({ message }: { message: string }) => {
      console.error('[Spotify SDK] Auth error:', message);
      toast.error('Spotify: محتاج Premium');
    });

    player.connect();
    setSpotifyPlayer(player);

    return () => {
      player.disconnect();
    };
  }, [sdkReady, connected, spotifyPlayer, token]);

  // ─── Check Spotify status ───
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/status", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ─── Check URL for PKCE callback (Spotify redirect) ───
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      
      if (code) {
        // PKCE callback — exchange code for tokens client-side
        setLoading(true);
        const success = await handleSpotifyPKCECallback();
        if (success) {
          toast.success("تم ربط Spotify بنجاح! 🎵");
          setConnected(true);
        } else {
          toast.error("فشل ربط Spotify — حاول مرة أخرى");
        }
        setLoading(false);
        return;
      }

      // Legacy callback (server-side)
      if (params.get("spotify_connected") === "true") {
        toast.success("تم ربط Spotify بنجاح! 🎵");
        setConnected(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      if (params.get("spotify_error")) {
        toast.error("فشل ربط Spotify: " + params.get("spotify_error"));
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    handleCallback();
  }, []);

  // ─── Connect Spotify (PKCE flow) ───
  const connectSpotify = async () => {
    try {
      // Get client_id from API first
      const res = await fetch("/api/spotify/auth", { headers: authHeaders });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      
      // Extract client_id from auth URL
      const url = new URL(data.authUrl);
      const clientId = url.searchParams.get('client_id');
      if (clientId) {
        localStorage.setItem('spotify_client_id', clientId);
      }

      // Start PKCE flow
      await startSpotifyPKCE();
    } catch (e: any) {
      toast.error("فشل ربط Spotify: " + e.message);
    }
  };

  // ─── Search (Spotify or YouTube) ───
  const search = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setShowResults(true);

    try {
      if (source === 'spotify') {
        // Search via MCP
        const res = await fetch("/api/mcp/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            name: "spotify_search",
            params: { query: searchQuery, type: "track", count: 10 },
          }),
        });
        const data = await res.json();
        setSearchResults(data.result?.tracks || []);
      } else {
        // Search YouTube
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: authHeaders,
        });
        const data = await res.json();
        setSearchResults(data.videos || []);
      }
    } catch (e: any) {
      toast.error("فشل البحث");
    } finally {
      setSearching(false);
    }
  };

  // ─── Play (Spotify or YouTube) ───
  const playItem = async (item: any) => {
    if (source === 'spotify') {
      if (!connected) {
        toast.error("اربط Spotify الأول");
        return;
      }
      if (!spotifyDeviceId) {
        toast.error("Spotify Player لسه بيحمل...");
        return;
      }

      try {
        // Transfer playback to web player + play track
        const tokenRes = await fetch('/api/spotify/web-player-token', { headers: authHeaders });
        const tokenData = await tokenRes.json();
        
        // Transfer playback
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ device_ids: [spotifyDeviceId], play: true }),
        });

        // Play track
        await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + spotifyDeviceId, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [item.uri] }),
        });

        setCurrentTrack(item);
        setPlaying(true);
        toast.success(`🎵 جاري تشغيل: ${item.name}`);
      } catch (e: any) {
        toast.error("فشل التشغيل — محتاج Spotify Premium");
      }
    } else {
      // YouTube — set video ID (iframe will render)
      setYtVideoId(item.videoId);
      setCurrentTrack({
        name: item.title,
        artist: item.channel,
        albumArt: item.thumbnail,
      });
      setPlaying(true);
      toast.success(`🎵 جاري تشغيل: ${item.title}`);
    }
  };

  // ─── Toggle play/pause ───
  const togglePlay = () => {
    if (source === 'spotify' && spotifyPlayer) {
      spotifyPlayer.togglePlay();
    }
    // YouTube handled by iframe
  };

  // ─── Play from query directly ───
  const playFromQuery = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      if (source === 'spotify' && connected) {
        // Search + play first result
        const res = await fetch("/api/mcp/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            name: "spotify_search",
            params: { query: searchQuery, type: "track", count: 1 },
          }),
        });
        const data = await res.json();
        const tracks = data.result?.tracks || [];
        if (tracks.length > 0) {
          await playItem(tracks[0]);
        } else {
          toast.error("لم يتم العثور على الأغنية");
        }
      } else {
        // YouTube — search + play first
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: authHeaders,
        });
        const data = await res.json();
        const videos = data.videos || [];
        if (videos.length > 0) {
          await playItem(videos[0]);
        } else {
          toast.error("لم يتم العثور على الأغنية");
        }
      }
      setSearchQuery("");
    } catch {
      toast.error("فشل البحث");
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-500 border border-blue-500">
      {/* Header + Source Selector */}
      <div className="flex items-center gap-2">
        <Music className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-bold">مشغل الموسيقى</span>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setSource('youtube')}
            className={`text-[10px] px-2 py-1 rounded-full ${source === 'youtube' ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'}`}
          >
            <Youtube className="h-3 w-3 inline" /> YouTube
          </button>
          <button
            onClick={() => setSource('spotify')}
            className={`text-[10px] px-2 py-1 rounded-full ${source === 'spotify' ? 'bg-[#1DB954] text-white' : 'bg-muted text-muted-foreground'}`}
          >
            <Music className="h-3 w-3 inline" /> Spotify
          </button>
        </div>
      </div>

      {/* Spotify connect (if Spotify selected) */}
      {source === 'spotify' && !connected && (
        <Button
          onClick={connectSpotify}
          size="sm"
          className="h-8 gap-1.5 text-xs bg-[#1DB954] hover:bg-[#1ed760] text-white"
        >
          <Link2 className="h-3.5 w-3.5" />
          ربط Spotify (محتاج Premium)
        </Button>
      )}

      {/* Spotify status */}
      {source === 'spotify' && connected && (
        <Badge variant="outline" className="text-[9px] bg-blue-500 text-blue-600 border-blue-500 self-start">
          {spotifyDeviceId ? '✅ جاهز للتشغيل' : '⏳ بيحمل...'}
        </Badge>
      )}

      {/* Search + Play */}
      <div className="flex gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && playFromQuery()}
          placeholder={`اكتب اسم الأغنية... (${source === 'youtube' ? 'مجاني' : 'Premium'})`}
          className="h-8 text-xs"
          dir="rtl"
        />
        <Button
          onClick={playFromQuery}
          size="sm"
          className={`h-8 gap-1 text-xs shrink-0 ${source === 'spotify' ? 'bg-[#1DB954] hover:bg-[#1ed760]' : 'bg-red-500 hover:bg-red-600'} text-white`}
        >
          {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          شغل
        </Button>
        <Button
          onClick={search}
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs shrink-0"
        >
          <Search className="h-3 w-3" />
        </Button>
      </div>

      {/* Search Results */}
      <AnimatePresence>
        {showResults && searchResults.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map((item, i) => (
                <button
                  key={i}
                  onClick={() => playItem(item)}
                  className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-blue-500 transition-colors text-right"
                >
                  {(item.albumArt || item.thumbnail) && (
                    <img src={item.albumArt || item.thumbnail} alt="" className="w-8 h-8 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{item.name || item.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.artist || item.channel}</div>
                  </div>
                  <Play className="h-3 w-3 text-blue-500 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* YouTube Player — فتح في تبويب جديد (CSP على HF بيمنع iframe) */}
      {source === 'youtube' && ytVideoId && (
        <div className="rounded-lg overflow-hidden bg-black/80 p-3 flex items-center gap-3">
          {currentTrack?.albumArt && (
            <img src={currentTrack.albumArt} alt="" className="w-12 h-12 rounded" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate text-white">{currentTrack?.name || 'فيديو'}</div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400 truncate">{currentTrack?.artist}</div>
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${ytVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-[10px] font-medium shrink-0"
          >
            <Play className="h-3 w-3" />
            فتح
          </a>
        </div>
      )}

      {/* Current Track */}
      {currentTrack && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500">
          {currentTrack.albumArt && (
            <img src={currentTrack.albumArt} alt="" className="w-10 h-10 rounded" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{currentTrack.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{currentTrack.artist}</div>
          </div>
          {source === 'spotify' && spotifyPlayer && (
            <button onClick={togglePlay} className="p-1 rounded-full hover:bg-blue-500">
              {playing ? <Pause className="h-4 w-4 text-blue-500" /> : <Play className="h-4 w-4 text-blue-500" />}
            </button>
          )}
        </div>
      )}

      {/* Note */}
      <p className="text-[9px] text-muted-foreground text-center">
        {source === 'youtube' 
          ? '✅ YouTube مجاني — بيتشغل في الشات' 
          : '⚠️ Spotify محتاج Premium + بيشتغل في الشات'}
      </p>
    </div>
  );
}
