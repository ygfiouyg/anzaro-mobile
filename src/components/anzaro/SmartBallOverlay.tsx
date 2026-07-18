'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSmartBallStore } from '@/lib/smart-ball-store';
import { useChatStore } from '@/store/chat-store';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { SmartBall } from './SmartBall';
import { QuickActions } from './QuickActions';
import { DeviceGrid } from './DeviceGrid';
import { ScenePanel } from './ScenePanel';
import { RoutinesPanel } from './RoutinesPanel';
import { McpToolsPanel } from './McpToolsPanel';
import { SettingsPanel } from './SettingsPanel';
import { WeatherPrayerWidget } from './WeatherPrayerWidget';
import {
  LayoutGrid, Clapperboard, Calendar, Wrench, Settings as SettingsIcon,
  X, CloudSun,
} from 'lucide-react';

type BallTab = 'devices' | 'scenes' | 'routines' | 'tools' | 'profile';

const TABS: { id: BallTab; label: string; icon: any }[] = [
  { id: 'devices', label: 'الأجهزة', icon: LayoutGrid },
  { id: 'scenes', label: 'المشاهد', icon: Clapperboard },
  { id: 'routines', label: 'الروتينات', icon: Calendar },
  { id: 'tools', label: 'الأدوات', icon: Wrench },
  { id: 'profile', label: 'الشخصية', icon: SettingsIcon },
];

export function SmartBallOverlay() {
  const { ball, setBall, setPanelOpen } = useSmartBallStore();
  const isStreaming = useChatStore((s) => s.isStreaming);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BallTab>('devices');
  const [showWeather, setShowWeather] = useState(false);

  // Sync ball state with chat streaming
  useEffect(() => {
    if (isStreaming && ball.status === 'idle') {
      setBall({ status: 'processing', label: 'Processing', labelAr: 'بفكّر' });
    } else if (!isStreaming && ball.status === 'processing') {
      setBall({ status: 'speaking', label: 'Speaking', labelAr: 'بتكلم' });
      const t = setTimeout(() => {
        setBall({ status: 'idle', label: 'Idle', labelAr: 'في انتظارك' });
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isStreaming, ball.status, setBall]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    setPanelOpen(v);
  }

  function fireCommand(cmd: string) {
    window.dispatchEvent(new CustomEvent('anzaro-quick-send', { detail: cmd }));
    handleOpenChange(false);
  }

  return (
    <>
      {/* Floating Smart Ball orb */}
      <motion.button
        onClick={() => handleOpenChange(!open)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-40 left-4 z-50 group"
        title="الكرة الذكية — Smart Ball"
        aria-label="الكرة الذكية"
      >
        <span
          className="absolute inset-0 rounded-full blur-xl opacity-60 animate-pulse"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.6), transparent 70%)',
            transform: 'scale(1.5)',
          }}
        />
        <div
          className="relative w-14 h-14 rounded-full"
          style={{
            background: 'radial-gradient(circle at 32% 28%, hsl(0 0% 100% / 30%), hsl(var(--primary)) 35%, hsl(var(--primary) / 0.7) 70%, hsl(var(--primary) / 0.5) 100%)',
            boxShadow: 'inset 0 2px 8px hsl(0 0% 100% / 40%), inset 0 -8px 24px hsl(0 0% 0% / 40%), 0 0 24px -2px hsl(var(--primary) / 0.5), 0 4px 16px -4px hsl(var(--primary) / 50%)',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              top: '18%', left: '24%', width: '28%', height: '22%',
              background: 'radial-gradient(ellipse, hsl(0 0% 100% / 70%), transparent 70%)',
              filter: 'blur(2px)',
            }}
          />
          <span
            className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
              ball.status === 'processing' ? 'bg-amber-400 animate-pulse' :
              ball.status === 'executing' ? 'bg-emerald-400 animate-pulse' :
              ball.status === 'listening' ? 'bg-blue-400 animate-pulse' :
              'bg-muted-foreground/40'
            }`}
          />
        </div>
        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 rounded-lg bg-popover text-popover-foreground text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {ball.labelAr}
        </span>
      </motion.button>

      {/* Weather toggle */}
      <motion.button
        onClick={() => setShowWeather(!showWeather)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 200, damping: 20 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-56 left-4 z-50 w-10 h-10 rounded-full glass flex items-center justify-center group"
        title="الطقس ومواعيد الصلاة"
        aria-label="الطقس"
      >
        <CloudSun className="w-4 h-4 text-amber-400" />
      </motion.button>

      <AnimatePresence>
        {showWeather && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed bottom-72 left-4 z-50 w-80"
          >
            <WeatherPrayerWidget />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control panel Sheet */}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="left" className="p-0 w-[380px] max-w-[90vw] flex flex-col" dir="rtl">
          <SheetHeader className="px-4 py-3 border-b border-border/40 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <SmartBall size={36} showLabel={false} />
              <div>
                <SheetTitle className="text-sm">الكرة الذكية</SheetTitle>
                <SheetDescription className="text-[10px]">Smart Ball Control</SheetDescription>
              </div>
            </div>
            <button
              onClick={() => handleOpenChange(false)}
              className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </SheetHeader>

          <div className="px-3 py-2 border-b border-border/40">
            <QuickActions onFire={fireCommand} />
          </div>

          <div className="flex items-center gap-1 px-2 py-2 border-b border-border/40 overflow-x-auto scrollbar-thin">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {tab === 'devices' && <DeviceGrid />}
            {tab === 'scenes' && <ScenePanel />}
            {tab === 'routines' && <RoutinesPanel />}
            {tab === 'tools' && <McpToolsPanel />}
            {tab === 'profile' && <SettingsPanel />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
