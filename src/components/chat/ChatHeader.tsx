'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
  Menu,
  ChevronDown,
  Settings,
  Shield,
  LogOut,
  User,
  Moon,
  Sun,
  Monitor,
  MoreVertical,
  Languages,
  Share2,
  FileText,
  Sparkles,
  Search,
  Globe,
  Radio,
  Swords,
  Brain,
  BarChart3,
  Code2,
  GitBranch,
  Headphones,
  Bot,
  Activity,
  Trophy,
  Mic,
  Zap,
  Plug,
  Github,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useChatStore } from '@/store/chat-store';
import { useSmartBallStore } from '@/lib/smart-ball-store';
import { useAuthStore } from '@/store/auth-store';
import { getModelById } from '@/lib/models';
import { ModelSelector } from './ModelSelector';
import AdminDashboard from './AdminDashboard';
import { SettingsDialog } from './SettingsDialog';
import { TranslationDialog } from './TranslationDialog';
import { ShareDialog } from './ShareDialog';
import { UserProfileModal } from './UserProfileModal';
import { ImageEditDialog } from './ImageEditDialog';
import { ImageSearchDialog } from './ImageSearchDialog';
import { PageReaderDialog } from './PageReaderDialog';
import { DocumentGenDialog } from './DocumentGenDialog';
import { IntegrationDashboard } from './IntegrationDashboard';
import { AIMediaGenerator } from './AIMediaGenerator';
import { RadioPlayer } from './RadioPlayer';
import { ModelArena } from './ModelArena';
import { UserMemoryPanel } from './UserMemoryPanel';
import { DataAnalysisPanel } from './DataAnalysisPanel';
import { CodeSandbox } from './CodeSandbox';
import { MindMapViewer } from './MindMapViewer';
import { PodcastStudio } from './PodcastStudio';
import { AgentMode } from './AgentMode';
import { SpecializedAgentsHub } from './SpecializedAgentsHub';
import { AgentBuilder } from '@/components/agents/AgentBuilder';
import { JobsMonitor } from '@/components/agents/JobsMonitor';
import { GamificationPanel } from './GamificationPanel';
import { VoiceChatOverlay } from './VoiceChatOverlay';
import { ToolsHub } from '@/components/tools/ToolsHub';
import { SkillsHub } from '@/components/skills/SkillsHub';
import { GitHubSkillHub } from './GitHubSkillHub';
import { GitHubToolHub } from './GitHubToolHub';
import { AnzaroAppLauncher } from './AnzaroAppLauncher';
import { AIToolsHub } from '@/components/ai-tools/AIToolsHub';
import { MCPHub } from '@/components/ai-tools/MCPHub';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Package, Wrench, Bell, Youtube, BookOpen } from 'lucide-react';
import { IOSThemeToggle } from '@/components/ui/ios-theme-toggle';
import { RemindersPanel } from './RemindersPanel';
import { YouTubeAnalyzer } from './YouTubeAnalyzer';
import { KnowledgeBasePanel } from './KnowledgeBasePanel';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  onToggleFilesPanel?: () => void;
  onToggleSkillsPanel?: () => void;
  skillsPanelOpen?: boolean;
  onToggleToolsGallery?: () => void;
  toolsGalleryOpen?: boolean;
  onSwitchToPdfCreator?: () => void;
}

export function ChatHeader({ onToggleSidebar, onToggleFilesPanel, onToggleSkillsPanel, skillsPanelOpen, onToggleToolsGallery, toolsGalleryOpen, onSwitchToPdfCreator }: ChatHeaderProps) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [toolsHubOpen, setToolsHubOpen] = useState(false);
  const [skillsHubOpen, setSkillsHubOpen] = useState(false);
  const [gitHubHubOpen, setGitHubHubOpen] = useState(false);
  const [gitHubToolOpen, setGitHubToolOpen] = useState(false);
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [mcpHubOpen, setMcpHubOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [imageEditOpen, setImageEditOpen] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [pageReaderOpen, setPageReaderOpen] = useState(false);
  const [documentGenOpen, setDocumentGenOpen] = useState(false);
  const [documentGenPrompt, setDocumentGenPrompt] = useState('');
  const [documentGenMode, setDocumentGenMode] = useState<'single' | 'batch'>('single');
  const [documentGenIsMyFiles, setDocumentGenIsMyFiles] = useState(false);
  const [aiMediaGenOpen, setAiMediaGenOpen] = useState(false);
  const [aiMediaGenPrompt, setAiMediaGenPrompt] = useState('');
  const [aiMediaGenTab, setAiMediaGenTab] = useState<'image' | 'video'>('image');
  const [radioOpen, setRadioOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [codeSandboxOpen, setCodeSandboxOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [dataAnalysisOpen, setDataAnalysisOpen] = useState(false);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [mindmapTopic, setMindmapTopic] = useState('');
  const [podcastOpen, setPodcastOpen] = useState(false);
  const [podcastContent, setPodcastContent] = useState('');
  const [agentModeOpen, setAgentModeOpen] = useState(false);
  const [agentModeTask, setAgentModeTask] = useState('');
  const [specializedAgentsOpen, setSpecializedAgentsOpen] = useState(false);
  const [agentBuilderOpen, setAgentBuilderOpen] = useState(false);
  const [jobsMonitorOpen, setJobsMonitorOpen] = useState(false);
  const [gamificationOpen, setGamificationOpen] = useState(false);
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [youtubeAnalyzerOpen, setYoutubeAnalyzerOpen] = useState(false);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);
  const { activeModel, sendMessage, systemPromptMode, setSystemPromptMode } = useChatStore();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { theme, setTheme } = useTheme();

  // Listen for AI Media Generator events from ChatInput
  useEffect(() => {
    const handleMediaGen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setAiMediaGenPrompt(detail.prompt || '');
        setAiMediaGenTab(detail.tab || 'image');
        setAiMediaGenOpen(true);
      }
    };
    window.addEventListener('delta-ai-media-gen', handleMediaGen);
    return () => window.removeEventListener('delta-ai-media-gen', handleMediaGen);
  }, []);

  // Listen for Document Generation events from ChatInput
  useEffect(() => {
    const handleDocGen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setDocumentGenPrompt(detail.prompt || '');
        setDocumentGenMode(detail.mode || 'single');
        setDocumentGenIsMyFiles(!!detail.isMyFiles);
        setDocumentGenOpen(true);
      }
    };
    window.addEventListener('delta-ai-doc-gen', handleDocGen);
    return () => window.removeEventListener('delta-ai-doc-gen', handleDocGen);
  }, []);

  // Listen for Data Analysis events from ChatInput
  useEffect(() => {
    const handleDataAnalysis = () => {
      setDataAnalysisOpen(true);
    };
    window.addEventListener('delta-ai-data-analysis', handleDataAnalysis);
    return () => window.removeEventListener('delta-ai-data-analysis', handleDataAnalysis);
  }, []);

  // Listen for Code Sandbox events from ChatInput
  useEffect(() => {
    const handleCodeSandbox = () => {
      setCodeSandboxOpen(true);
    };
    window.addEventListener('delta-ai-code-sandbox', handleCodeSandbox);
    return () => window.removeEventListener('delta-ai-code-sandbox', handleCodeSandbox);
  }, []);

  // Listen for MindMap events from ChatInput
  useEffect(() => {
    const handleMindmap = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setMindmapTopic(detail.topic || '');
      }
      setMindmapOpen(true);
    };
    window.addEventListener('delta-ai-mindmap', handleMindmap);
    return () => window.removeEventListener('delta-ai-mindmap', handleMindmap);
  }, []);

  // Listen for Podcast events from ChatInput
  useEffect(() => {
    const handlePodcast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setPodcastContent(detail.content || '');
      }
      setPodcastOpen(true);
    };
    window.addEventListener('delta-ai-podcast', handlePodcast);
    return () => window.removeEventListener('delta-ai-podcast', handlePodcast);
  }, []);

  // Listen for Agent Mode events from ChatInput
  useEffect(() => {
    const handleAgentMode = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setAgentModeTask(detail.task || '');
      }
      setAgentModeOpen(true);
    };
    window.addEventListener('delta-ai-agent', handleAgentMode);
    return () => window.removeEventListener('delta-ai-agent', handleAgentMode);
  }, []);

  // Listen for Gamification events from ChatInput
  useEffect(() => {
    const handleGamification = () => {
      setGamificationOpen(true);
    };
    window.addEventListener('delta-ai-gamification', handleGamification);
    return () => window.removeEventListener('delta-ai-gamification', handleGamification);
  }, []);

  // Listen for Voice Chat events from ChatInput
  useEffect(() => {
    const handleVoiceChat = () => {
      setVoiceChatOpen(true);
    };
    window.addEventListener('delta-ai-voice-chat', handleVoiceChat);
    return () => window.removeEventListener('delta-ai-voice-chat', handleVoiceChat);
  }, []);

  const currentModel = getModelById(activeModel) ?? (() => {
    // لو الموديل مش في الـ static list → ممكن يكون HF custom model (hf-chat:xxx)
    if (activeModel?.startsWith('hf-chat:')) {
      const hfId = activeModel.slice(8);
      return {
        id: activeModel,
        name: hfId.split('/').pop()?.replace(/-/g, ' ').slice(0, 20) || 'HF Model',
        nameEn: hfId,
        icon: '🤗',
        category: 'hf-chat' as const,
        provider: 'huggingface' as const,
        description: 'موديل HuggingFace',
        descriptionEn: 'HuggingFace Model',
        capabilities: { vision: false, functionCalling: false, streaming: true },
        maxTokens: 8192,
        realChatModel: hfId,
        hfChatModel: hfId,
        isCustom: true,
      };
    }
    return null;
  })();
  const isAdmin = isAuthenticated && user?.role === 'admin';

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '👤';
    return name.slice(0, 2);
  };

  return (
    <>
      <header className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sticky top-0 z-40 transition-all">
        {/* Gemini Two-line Hamburger Menu */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="min-h-[40px] min-w-[40px] flex-shrink-0 text-foreground hover:bg-muted rounded-full transition-all ios-pressable"
          aria-label="القائمة"
        >
          {/* Two-line hamburger icon (Gemini style) */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M3 14H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </Button>

        {/* Model Selector — Gemini clean text pill */}
        <button
          onClick={() => setModelSelectorOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-muted transition-all min-h-[36px] flex-shrink-0 ios-pressable"
          aria-label="تغيير النموذج"
        >
          {currentModel && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-medium text-foreground leading-tight">
                  {currentModel.name}
                </span>
                {systemPromptMode === 'open' && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[hsl(var(--chart-3))]/15 text-[9px] font-semibold text-[hsl(var(--chart-3))] leading-none">
                    <Zap className="size-2" />
                    مفتوح
                  </span>
                )}
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>

        {/* Smart Ball status pill — shows ball state + personality type */}
        <SmartBallStatusPill />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Gemini Theme Toggle — desktop segmented control */}
        <div className="hidden sm:block">
          <IOSThemeToggle compact />
        </div>

        {/* Compact theme toggle on mobile */}
        <button
          onClick={() => {
            if (theme === 'light') setTheme('dark');
            else if (theme === 'dark') setTheme('system');
            else setTheme('light');
          }}
          className="sm:hidden flex items-center justify-center size-10 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all ios-pressable"
          aria-label="تبديل المظهر"
        >
          {theme === 'light' ? (
            <Sun className="size-5" />
          ) : theme === 'dark' ? (
            <Moon className="size-5" />
          ) : (
            <Monitor className="size-5" />
          )}
        </button>

        {/* More Tools — Gemini-style dropdown */}
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center size-10 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all ios-pressable"
              aria-label="المزيد"
            >
              <MoreVertical className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-64 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl backdrop-saturate-150 border border-white/40 dark:border-white/10 ring-1 ring-black/[0.03] dark:ring-white/[0.04] rounded-2xl p-1.5 shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40 max-h-[75vh] overflow-y-auto gemini-dropdown-scroll z-[100]"
          >
            {/* ── System Prompt Mode ── */}
            <DropdownMenuItem
              className="cursor-pointer flex items-center gap-2.5 min-h-[40px] rounded-[10px] px-2.5 text-[14px] hover:bg-muted"
              onClick={() => setSystemPromptMode(systemPromptMode === 'full' ? 'open' : 'full')}
            >
              <Zap className="size-4 text-muted-foreground" />
              <span className={cn(systemPromptMode === 'open' && 'font-semibold')}>
                {systemPromptMode === 'open' ? 'وضع مفتوح ✓' : 'وضع مفتوح'}
              </span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1 bg-border/60" />

            {/* ── Category: AI Tools ── */}
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">أدوات الذكاء الاصطناعي</p>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setDataAnalysisOpen(true)}>
              <BarChart3 className="size-4 ml-2.5" />
              <span>تحليل البيانات</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setMindmapOpen(true)}>
              <GitBranch className="size-4 ml-2.5" />
              <span>خريطة ذهنية</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setPodcastOpen(true)}>
              <Headphones className="size-4 ml-2.5" />
              <span>بودكاست</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setArenaOpen(true)}>
              <Swords className="size-4 ml-2.5" />
              <span>حلبة النماذج</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setCodeSandboxOpen(true)}>
              <Code2 className="size-4 ml-2.5" />
              <span>صندوق الأكواد</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => { setAiMediaGenPrompt(''); setAiMediaGenTab('image'); setAiMediaGenOpen(true); }}>
              <Sparkles className="size-4 ml-2.5" />
              <span>مولد الوسائط</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1 bg-border/60" />

            {/* ── Category: Agents ── */}
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">الوكلاء</p>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setVoiceChatOpen(true)}>
              <Mic className="size-4 ml-2.5" />
              <span>دردشة صوتية</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setAgentModeOpen(true)}>
              <Bot className="size-4 ml-2.5" />
              <span>وضع الوكيل</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setSpecializedAgentsOpen(true)}>
              <Sparkles className="size-4 ml-2.5" />
              <span>الوكلاء المتخصصون</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setAgentBuilderOpen(true)}>
              <Bot className="size-4 ml-2.5" />
              <span>استوديو بناء الوكلاء</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setJobsMonitorOpen(true)}>
              <Activity className="size-4 ml-2.5" />
              <span>مراقب المهام</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1 bg-border/60" />

            {/* ── Category: Utilities ── */}
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">أدوات مساعدة</p>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setToolsHubOpen(true)}>
              <Package className="size-4 ml-2.5" />
              <span>مركز الأدوات</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setSkillsHubOpen(true)}>
              <Brain className="size-4 ml-2.5" />
              <span>المهارات</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setGitHubHubOpen(true)}>
              <Github className="size-4 ml-2.5" />
              <span>GitHub Skill Hub</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setGitHubToolOpen(true)}>
              <Github className="size-4 ml-2.5" />
              <span>GitHub Tool Importer</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setAppLauncherOpen(true)}>
              <Smartphone className="size-4 ml-2.5" />
              <span>تطبيقات Anzaro</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setAiToolsOpen(true)}>
              <Sparkles className="size-4 ml-2.5" />
              <span>AI Tools Hub (97 أداة)</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setMcpHubOpen(true)}>
              <Globe className="size-4 ml-2.5" />
              <span>MCP Tools (حقيقية)</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setPageReaderOpen(true)}>
              <Globe className="size-4 ml-2.5" />
              <span>قارئ الويب</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setTranslationOpen(true)}>
              <Languages className="size-4 ml-2.5" />
              <span>ترجمة</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setShareOpen(true)}>
              <Share2 className="size-4 ml-2.5" />
              <span>مشاركة</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setYoutubeAnalyzerOpen(true)}>
              <Youtube className="size-4 ml-2.5" />
              <span>تحليل يوتيوب</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setKnowledgeBaseOpen(true)}>
              <BookOpen className="size-4 ml-2.5" />
              <span>قاعدة المعرفة</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1 bg-border/60" />

            {/* ── Category: Account ── */}
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">الحساب</p>
            {isAuthenticated && (
              <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setMemoryOpen(true)}>
                <Brain className="size-4 ml-2.5" />
                <span>الذاكرة الذكية</span>
              </DropdownMenuItem>
            )}
            {isAuthenticated && (
              <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setRemindersOpen(true)}>
                <Bell className="size-4 ml-2.5" />
                <span>التذكيرات</span>
              </DropdownMenuItem>
            )}
            {isAuthenticated && (
              <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setGamificationOpen(true)}>
                <Trophy className="size-4 ml-2.5" />
                <span>الإنجازات</span>
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setAdminDashboardOpen(true)}>
                <Shield className="size-4 ml-2.5" />
                <span>لوحة التحكم</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-4 ml-2.5" />
              <span>الإعدادات</span>
            </DropdownMenuItem>
            {isAuthenticated && (
              <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setIntegrationsOpen(true)}>
                <Plug className="size-4 ml-2.5" />
                <span>ربط Google Workspace</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="cursor-pointer min-h-[40px] text-[14px] text-muted-foreground hover:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-150 rounded-lg px-2.5" onClick={() => setProfileOpen(true)}>
              <User className="size-4 ml-2.5" />
              <span>الملف الشخصي</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Skills Panel Toggle — Gemini circular icon button */}
        <button
          onClick={onToggleSkillsPanel}
          className={cn(
            'flex items-center justify-center size-10 rounded-full transition-all ios-pressable',
            skillsPanelOpen
              ? 'bg-blue-100 dark:bg-blue-900 text-[hsl(var(--primary))]'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
          aria-label="المهارات"
        >
          <Sparkles className="size-5" />
        </button>

        {/* Tools Gallery Toggle — Gemini circular icon button */}
        <button
          onClick={onToggleToolsGallery}
          className={cn(
            'flex items-center justify-center size-10 rounded-full transition-all ios-pressable',
            toolsGalleryOpen
              ? 'bg-blue-100 dark:bg-blue-900 text-[hsl(var(--primary))]'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
          aria-label="الأدوات"
          title="أدوات Anzaro AI الذكية"
        >
          <Wrench className="size-5" />
        </button>

        {/* User Avatar — Gemini circular */}
        <button
          onClick={() => setProfileOpen(true)}
          className="flex-shrink-0 relative group ios-pressable"
          aria-label="الملف الشخصي"
        >
          <Avatar className="size-10 transition-all relative rounded-full">
            <AvatarImage src={user?.avatar || undefined} alt={user?.name || 'المستخدم'} />
            <AvatarFallback className="bg-muted text-foreground text-[12px] font-medium rounded-full">
              {isAuthenticated ? getInitials(user?.name) : '👤'}
            </AvatarFallback>
          </Avatar>
        </button>
      </header>

      {/* Dialogs */}
      <ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen} />
      <AdminDashboard open={adminDashboardOpen} onOpenChange={setAdminDashboardOpen} />

      {/* Tools Hub - متاح للجميع */}
      <Dialog open={toolsHubOpen} onOpenChange={setToolsHubOpen}>
        <DialogContent className="w-[95vw] sm:max-w-5xl h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-blue-500" />
              مركز الأدوات
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <ToolsHub />
          </div>
        </DialogContent>
      </Dialog>

      {/* Skills Hub - متاح للجميع */}
      <Dialog open={skillsHubOpen} onOpenChange={setSkillsHubOpen}>
        <DialogContent className="w-[95vw] sm:max-w-5xl h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Brain className="h-4 w-4 text-blue-500" />
              المهارات
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <SkillsHub />
          </div>
        </DialogContent>
      </Dialog>

      {/* GitHub Skill Hub — سحب مهارات من GitHub */}
      <Dialog open={gitHubHubOpen} onOpenChange={setGitHubHubOpen}>
        <DialogContent className="w-[92vw] sm:max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Github className="h-4 w-4 text-zinc-300" />
              GitHub Skill Hub — سحب مهارات من GitHub
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <GitHubSkillHub />
          </div>
        </DialogContent>
      </Dialog>

      {/* GitHub Tool Importer — سحب أدوات حقيقية من GitHub */}
      <Dialog open={gitHubToolOpen} onOpenChange={setGitHubToolOpen}>
        <DialogContent className="w-[92vw] sm:max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Github className="h-4 w-4 text-zinc-300" />
              GitHub Tool Importer — سحب أدوات من GitHub
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <GitHubToolHub />
          </div>
        </DialogContent>
      </Dialog>

      {/* Anzaro App Launcher — تطبيقات كاملة */}
      <Dialog open={appLauncherOpen} onOpenChange={setAppLauncherOpen}>
        <DialogContent className="w-[92vw] sm:max-w-2xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4 text-blue-400" />
              تطبيقات Anzaro — سحب وتشغيل تطبيقات من GitHub
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <AnzaroAppLauncher />
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Tools Hub - 97 أداة من AI Engineering Hub */}
      <Dialog open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-6xl h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-blue-500" />
              AI Tools Hub — 97 أداة مدعومة بـ GLM-5.2
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <AIToolsHub />
          </div>
        </DialogContent>
      </Dialog>

      {/* MCP Tools - أدوات حقيقية */}
      <Dialog open={mcpHubOpen} onOpenChange={setMcpHubOpen}>
        <DialogContent className="w-[95vw] sm:max-w-5xl h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-blue-500" />
              MCP Tools — أدوات حقيقية (function calls فعلية)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <MCPHub />
          </div>
        </DialogContent>
      </Dialog>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Dialog open={integrationsOpen} onOpenChange={setIntegrationsOpen}>
        <DialogContent className="w-[92vw] sm:max-w-md p-0 overflow-hidden border-border">
          <DialogHeader className="sr-only">
            <DialogTitle>ربط Google Workspace</DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5">
            <IntegrationDashboard />
          </div>
        </DialogContent>
      </Dialog>
      <TranslationDialog open={translationOpen} onOpenChange={setTranslationOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      <UserProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
      <ImageEditDialog open={imageEditOpen} onOpenChange={setImageEditOpen} />
      <ImageSearchDialog open={imageSearchOpen} onOpenChange={setImageSearchOpen} />
      <PageReaderDialog open={pageReaderOpen} onOpenChange={setPageReaderOpen} />
      <DocumentGenDialog
        open={documentGenOpen}
        onOpenChange={setDocumentGenOpen}
        initialPrompt={documentGenPrompt}
        initialMode={documentGenMode}
        isMyFiles={documentGenIsMyFiles}
      />
      <AIMediaGenerator
        open={aiMediaGenOpen}
        onOpenChange={setAiMediaGenOpen}
        initialPrompt={aiMediaGenPrompt}
        initialTab={aiMediaGenTab}
      />
      <RadioPlayer isOpen={radioOpen} onClose={() => setRadioOpen(false)} />
      <ModelArena open={arenaOpen} onOpenChange={setArenaOpen} />
      <CodeSandbox open={codeSandboxOpen} onOpenChange={setCodeSandboxOpen} />
      <UserMemoryPanel open={memoryOpen} onOpenChange={setMemoryOpen} />
      <DataAnalysisPanel open={dataAnalysisOpen} onOpenChange={setDataAnalysisOpen} />
      <MindMapViewer open={mindmapOpen} onOpenChange={setMindmapOpen} initialTopic={mindmapTopic} />
      <PodcastStudio open={podcastOpen} onOpenChange={setPodcastOpen} initialContent={podcastContent} />
      <AgentMode open={agentModeOpen} onOpenChange={setAgentModeOpen} initialTask={agentModeTask} onSendToChat={sendMessage} />
      <SpecializedAgentsHub open={specializedAgentsOpen} onOpenChange={setSpecializedAgentsOpen} />

      {/* Agent Builder Studio — بناء وكلاء مخصصين */}
      <Dialog open={agentBuilderOpen} onOpenChange={setAgentBuilderOpen}>
        <DialogContent className="w-[95vw] sm:max-w-6xl h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4 text-blue-500" />
              استوديو بناء الوكلاء
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <AgentBuilder />
          </div>
        </DialogContent>
      </Dialog>

      {/* Jobs Monitor — مراقب المهام (live job tracking) */}
      <JobsMonitor open={jobsMonitorOpen} onOpenChange={setJobsMonitorOpen} />

      <GamificationPanel open={gamificationOpen} onOpenChange={setGamificationOpen} />
      <RemindersPanel open={remindersOpen} onOpenChange={setRemindersOpen} />
      <YouTubeAnalyzer open={youtubeAnalyzerOpen} onOpenChange={setYoutubeAnalyzerOpen} />
      <KnowledgeBasePanel open={knowledgeBaseOpen} onOpenChange={setKnowledgeBaseOpen} />
      <VoiceChatOverlay isOpen={voiceChatOpen} onClose={() => setVoiceChatOpen(false)} />
    </>
  );
}

// ── Smart Ball Status Pill ──
// Shows a compact ball-state indicator + personality type in the chat header.
// Clicking it opens the Smart Ball overlay (via the orb button).
function SmartBallStatusPill() {
  const ball = useSmartBallStore((s) => s.ball);
  const [personaType, setPersonaType] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/anzaro/personality/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (active && data.profile) setPersonaType(data.profile.personaType);
      } catch {}
    })();
    return () => { active = false };
  }, [token]);

  const statusColor =
    ball.status === 'processing' ? 'bg-amber-400' :
    ball.status === 'executing' ? 'bg-emerald-400' :
    ball.status === 'listening' ? 'bg-blue-400' :
    ball.status === 'speaking' ? 'bg-violet-400' :
    'bg-muted-foreground/40';

  const personaLabel =
    personaType === 'leader' ? 'قائد' :
    personaType === 'analytical' ? 'محلل' :
    personaType === 'creative' ? 'مبدع' :
    personaType === 'emotional' ? 'عاطفي' :
    personaType === 'balanced' ? 'متوازن' : null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/40 border border-border/40">
      {/* Ball status dot */}
      <span className={cn('w-2 h-2 rounded-full animate-pulse-dot', statusColor)} />
      {/* Ball label (compact) */}
      <span className="text-[10px] font-medium text-muted-foreground hidden sm:inline">
        {ball.labelAr}
      </span>
      {/* Divider + persona */}
      {personaLabel && (
        <>
          <span className="w-px h-3 bg-border/60" />
          <span className="text-[10px] font-semibold text-primary">{personaLabel}</span>
        </>
      )}
    </div>
  );
}
