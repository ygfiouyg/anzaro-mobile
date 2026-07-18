"use client";

import { Shield, MessageSquare, Moon, Sun, Sparkles, Terminal, Zap, Package, Brain } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Mode } from "./types";

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

interface HeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  isStreaming: boolean;
}

export function Header({ mode, onModeChange, isStreaming }: HeaderProps) {
  const { setTheme } = useTheme();
  const isDark = useIsDark();

  return (
    <header className="sticky top-0 z-40 border-b border-border background ">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-500 to-blue-500 shadow-lg shadow-blue-500">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500 ring-2 ring-background" />
            </span>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">Anzaro AI</h1>
              <Badge variant="secondary" className="h-5 text-[10px] font-mono bg-gradient-to-r from-blue-500 to-blue-500 text-blue-600 dark:text-blue-300 border-blue-500">
                بعقل هادي 🌊
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">منصة الأدمن الذكية</p>
          </div>
        </div>

        {/* Mode switcher */}
        <div className="mx-auto flex items-center gap-1 rounded-xl border border-border bg-muted p-1">
          <ModeButton
            active={mode === "chat"}
            onClick={() => onModeChange("chat")}
            icon={<MessageSquare className="h-4 w-4" />}
            label="محادثة"
          />
          <ModeButton
            active={mode === "admin"}
            onClick={() => onModeChange("admin")}
            icon={<Shield className="h-4 w-4" />}
            label="الأدمن"
            accent="emerald"
          />
          <ModeButton
            active={mode === "tools"}
            onClick={() => onModeChange("tools")}
            icon={<Package className="h-4 w-4" />}
            label="الأدوات"
            accent="sky"
          />
          <ModeButton
            active={mode === "skills"}
            onClick={() => onModeChange("skills")}
            icon={<Brain className="h-4 w-4" />}
            label="المهارات"
            accent="violet"
          />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {isStreaming && (
            <Badge variant="outline" className="gap-1.5 text-[10px] border-blue-500 text-blue-600 dark:text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              <span>نشط</span>
            </Badge>
          )}
          {mode === "admin" && (
            <Badge variant="outline" className="gap-1 text-[10px] border-blue-500 text-blue-600 dark:text-blue-300 hidden sm:flex">
              <Terminal className="h-3 w-3" />
              <span>صلاحية كاملة</span>
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: "emerald" | "sky" | "violet";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 sm:px-4 py-1.5 text-sm font-medium transition-all",
        active
          ? accent === "emerald"
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500"
            : accent === "sky"
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500"
              : accent === "violet"
                ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500"
                : "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
