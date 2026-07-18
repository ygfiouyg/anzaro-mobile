'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Radio,
  ChevronUp,
  ChevronDown,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Station {
  id: string;
  name: string;
  streamUrl: string;
  logo?: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
}

const categoryLabels: Record<string, string> = {
  quran: 'القرآن الكريم',
  islamic: 'إسلامي',
  news: 'أخبار',
  music: 'موسيقى',
};

const categoryColors: Record<string, string> = {
  quran: 'bg-blue-500 text-blue-700 dark:text-blue-400',
  islamic: 'bg-blue-500 text-blue-700 dark:text-blue-400',
  news: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400',
  music: 'bg-blue-500 text-blue-700 dark:text-blue-400',
};

interface RadioPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RadioPlayer({ isOpen, onClose }: RadioPlayerProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationsOpen, setStationsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch stations
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const response = await fetch('/api/radio/stations');
        if (!response.ok) return;

        const data = await response.json();
        setStations(data.stations || []);

        // Auto-select first station if none selected
        if (!currentStation && data.stations?.length > 0) {
          setCurrentStation(data.stations[0]);
        }
      } catch (error) {
        console.error('[RadioPlayer] Error fetching stations:', error);
      }
    };

    if (isOpen) {
      fetchStations();
    }
  }, [isOpen]);

  // Setup audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume / 100;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  // Handle station change
  const selectStation = useCallback((station: Station) => {
    setCurrentStation(station);
    setStationsOpen(false);
    setError(null);

    if (audioRef.current && isPlaying) {
      audioRef.current.src = station.streamUrl;
      audioRef.current.play().catch((err) => {
        console.error('[RadioPlayer] Error playing station:', err);
        setError('فشل في تشغيل المحطة');
        setIsPlaying(false);
      });
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    if (!currentStation || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      setError(null);
      audioRef.current.src = currentStation.streamUrl;
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('[RadioPlayer] Error playing:', err);
          setError('فشل في تشغيل المحطة');
          setIsPlaying(false);
          setIsLoading(false);
        });
    }
  }, [currentStation, isPlaying]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-auto sm:left-4 z-50 sm:w-[360px]"
        dir="rtl"
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black overflow-hidden ">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-blue-600 to-blue-500">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-foreground">
                راديو Anzaro AI
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label="إغلاق الراديو"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Current Station */}
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-4">
              {/* Station Icon */}
              <div className="flex items-center justify-center size-12 rounded-xl bg-blue-600 border border-blue-600">
                {isPlaying ? (
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <Radio className="size-6 text-blue-600 dark:text-blue-400" />
                  </motion.div>
                ) : (
                  <Radio className="size-6 text-muted-foreground" />
                )}
              </div>

              {/* Station Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {currentStation?.name || 'اختر محطة'}
                </p>
                {currentStation && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] mt-0.5 ${
                      categoryColors[currentStation.category] || ''
                    }`}
                  >
                    {categoryLabels[currentStation.category] || currentStation.category}
                  </Badge>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-xs text-red-500 mb-3 text-center">{error}</p>
            )}

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="size-9 text-muted-foreground hover:text-foreground"
                aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
              >
                {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>

              <Button
                onClick={togglePlay}
                disabled={!currentStation || isLoading}
                className="size-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50"
                aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
              >
                {isLoading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5 mr-0.5" />
                )}
              </Button>

              {/* Volume Slider */}
              <div className="w-20 flex items-center">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={(val) => {
                    setVolume(val[0]);
                    if (val[0] > 0) setIsMuted(false);
                  }}
                  max={100}
                  step={1}
                  className="cursor-pointer"
                  aria-label="مستوى الصوت"
                />
              </div>
            </div>

            {/* Station Selector */}
            <Popover open={stationsOpen} onOpenChange={setStationsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between text-sm"
                  aria-label="اختيار محطة"
                >
                  <span className="flex items-center gap-2">
                    <Radio className="size-3.5" />
                    {currentStation ? 'تغيير المحطة' : 'اختر محطة'}
                  </span>
                  <ChevronDown className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[320px] p-0"
                align="start"
                side="top"
              >
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">
                    المحطات المتاحة
                  </p>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="p-2 space-y-1">
                    {stations.map((station) => (
                      <button
                        key={station.id}
                        onClick={() => selectStation(station)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-right ${
                          currentStation?.id === station.id
                            ? 'bg-blue-600 border border-blue-600'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <div
                          className={`flex items-center justify-center size-8 rounded-lg ${
                            currentStation?.id === station.id
                              ? 'bg-blue-600'
                              : 'bg-muted'
                          }`}
                        >
                          <Radio
                            className={`size-3.5 ${
                              currentStation?.id === station.id
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-muted-foreground'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {station.name}
                          </p>
                          <Badge
                            variant="secondary"
                            className={`text-[9px] mt-0.5 ${
                              categoryColors[station.category] || ''
                            }`}
                          >
                            {categoryLabels[station.category] || station.category}
                          </Badge>
                        </div>
                        {currentStation?.id === station.id && (
                          <div className="flex items-center gap-0.5">
                            <span className="size-1 rounded-full bg-blue-600 animate-pulse" />
                            <span className="size-1 rounded-full bg-blue-600 animate-pulse [animation-delay:0.15s]" />
                            <span className="size-1 rounded-full bg-blue-600 animate-pulse [animation-delay:0.3s]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
