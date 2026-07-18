"use client";

import { Sparkles, Activity, Cpu, Zap, Moon, Sun, Github, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSyncExternalStore } from "react";

interface HeaderProps {
  toolCount: number;
  status: { servers: number; localTools: number; remoteTools: number; total: number } | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

// Subscribe to the document's `class` attribute so the theme icon re-renders
// after hydration without calling setState inside an effect.
function useIsDark() {
  return useSyncExternalStore(
    (cb) => {
      const observer = new MutationObserver(cb);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

export function Header({ toolCount, status, sidebarOpen, onToggleSidebar }: HeaderProps) {
  const { setTheme } = useTheme();
  const isDark = useIsDark();

  return (
    <header className="sticky top-0 z-40 border-b border-border background ">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <Button variant="ghost" size="icon" className="md:flex hidden h-9 w-9" onClick={onToggleSidebar}>
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>

        {/* Logo + brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-500 to-blue-500 shadow-lg shadow-blue-500/20">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
            </span>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">DELTA AI</h1>
              <Badge variant="secondary" className="h-5 text-[10px] font-mono bg-gradient-to-r from-blue-500 to-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/20">
                GLM 5.2 · 705B
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">MCP Orchestration Platform</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Status pills */}
          <div className="hidden md:flex items-center gap-2">
            <StatusPill icon={<Cpu className="h-3.5 w-3.5" />} label="MCP Servers" value={String(status?.servers ?? 0)} color="violet" />
            <StatusPill icon={<Zap className="h-3.5 w-3.5" />} label="Tools" value={String(status?.total ?? toolCount)} color="fuchsia" />
            <StatusPill icon={<Activity className="h-3.5 w-3.5" />} label="Engine" value="ONLINE" color="emerald" pulse />
          </div>

          <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
            <a href="https://huggingface.co/spaces/kopabdo/DELTA_AI" target="_blank" rel="noreferrer" title="HuggingFace Space">
              <Github className="h-4 w-4" />
            </a>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ icon, label, value, color, pulse }: { icon: React.ReactNode; label: string; value: string; color: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    violet: "text-blue-600 dark:text-blue-300 bg-blue-500 border-blue-500",
    fuchsia: "text-blue-600 dark:text-blue-300 bg-blue-500/10 border-blue-500/20",
    emerald: "text-blue-600 dark:text-blue-300 bg-blue-500 border-blue-500",
  };
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colors[color]}`}>
      <span className="relative flex">
        {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />}
        {icon}
      </span>
      <span className="hidden lg:inline text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}
