'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Check, Loader2, ChevronDown, ChevronUp, List, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  models,
  getModelById,
  getModelsByCategory,
  MODEL_CATEGORIES,
  type ModelCategory,
} from '@/lib/models';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── HF Verification Types ────────────────────────────────────────────

type HFVerifyStatus = 'available' | 'loading' | 'failed' | 'rate-limited';

interface HFVerifyResult {
  modelId: string;
  category: string;
  status: HFVerifyStatus;
  responseTimeMs: number;
  error?: string;
}

interface HFVerifyReport {
  success: boolean;
  tokenConfigured: boolean;
  tokenMasked: string;
  totalModels: number;
  available: number;
  loading: number;
  failed: number;
  rateLimited: number;
  results: HFVerifyResult[];
}

// ─── HF Dynamic Model Types ────────────────────────────────────────────

interface HFChatModelEntry {
  id: string;
  name: string;
  shortName: string;
  category: string;
  size: string;
  available: boolean;
}

interface HFImageModelEntry {
  id: string;
  hfModel: string;
  name: string;
  type: 'inference' | 'gradio';
  stylePrefix: string;
  maxResolution: number;
  available: boolean;
}

interface HFVideoModelEntry {
  id: string;
  spaceName: string;
  name: string;
  type: 'gradio' | 'inference' | 'zhipuai';
  endpoint: string;
  supportedModes: ('text2video' | 'image2video')[];
  avgWaitTime: number;
  available: boolean;
}

interface HFModelsResponse {
  chat?: {
    categories: string[];
    models: Record<string, HFChatModelEntry>;
    totalCount: number;
  };
  image?: {
    models: Record<string, HFImageModelEntry>;
    totalCount: number;
  };
  video?: {
    models: Record<string, HFVideoModelEntry>;
    totalCount: number;
  };
  health: {
    usableModels: number;
    rateLimitedModels: number;
    loadingModels: number;
  };
}

interface HFHealthResponse {
  timestamp: string;
  chat: { total: number; usable: number; rateLimited: number; loading: number; unavailable: number };
  image: { total: number; usable: number; rateLimited: number; loading: number; unavailable: number };
  video: { total: number; usable: number; loading: number; unavailable: number };
  disabledModelsCount: number;
  modelHealth: Record<string, {
    usable: boolean;
    rateLimited: boolean;
    loading: boolean;
    unavailable: boolean;
    disabled: boolean;
    avgResponseMs: number;
  }>;
}

// ─── Status helpers ───────────────────────────────────────────────────

function getStatusIcon(status: HFVerifyStatus) {
  switch (status) {
    case 'available':
      return '✅';
    case 'loading':
      return '⏳';
    case 'failed':
      return '❌';
    case 'rate-limited':
      return '⚠️';
  }
}

/** Get a colored pill badge class for a model health status */
function getHealthPillClass(status: 'usable' | 'loading' | 'rate-limited' | 'unavailable' | 'disabled' | 'unknown'): string {
  switch (status) {
    case 'usable':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'loading':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'rate-limited':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'unavailable':
      return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
    case 'disabled':
      return 'bg-slate-100 dark:bg-blue-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800';
    case 'unknown':
    default:
      return 'bg-slate-100 dark:bg-blue-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800';
  }
}

/** Get emoji for a model health status */
function getHealthEmoji(status: 'usable' | 'loading' | 'rate-limited' | 'unavailable' | 'disabled' | 'unknown'): string {
  switch (status) {
    case 'usable': return '✅';
    case 'loading': return '⏳';
    case 'rate-limited': return '⚠️';
    case 'unavailable': return '❌';
    case 'disabled': return '🚫';
    case 'unknown': return '❓';
  }
}

/** Get Arabic label for a model health status */
function getHealthLabel(status: 'usable' | 'loading' | 'rate-limited' | 'unavailable' | 'disabled' | 'unknown'): string {
  switch (status) {
    case 'usable': return 'متاح';
    case 'loading': return 'قيد التحميل';
    case 'rate-limited': return 'محدود السرعة';
    case 'unavailable': return 'غير متاح';
    case 'disabled': return 'معطل';
    case 'unknown': return 'غير معروف';
  }
}

function getStatusLabel(status: HFVerifyStatus): string {
  switch (status) {
    case 'available':
      return 'متاح';
    case 'loading':
      return 'قيد التحميل';
    case 'failed':
      return 'فشل';
    case 'rate-limited':
      return 'محدود السرعة';
  }
}

function getStatusColor(status: HFVerifyStatus): string {
  switch (status) {
    case 'available':
      return 'text-blue-600 dark:text-blue-400';
    case 'loading':
      return 'text-blue-600 dark:text-blue-400';
    case 'failed':
      return 'text-red-600 dark:text-red-400';
    case 'rate-limited':
      return 'text-blue-600 dark:text-blue-400';
  }
}

function getOverallStatus(report: HFVerifyReport): 'all-good' | 'some-loading' | 'many-failed' {
  if (report.failed > report.available) return 'many-failed';
  if (report.loading > 0 || report.rateLimited > 0) return 'some-loading';
  return 'all-good';
}

function getOverallIcon(status: 'all-good' | 'some-loading' | 'many-failed') {
  switch (status) {
    case 'all-good':
      return '✅';
    case 'some-loading':
      return '⚠️';
    case 'many-failed':
      return '❌';
  }
}

// ─── Component ────────────────────────────────────────────────────────

export function ModelSelector({ open, onOpenChange }: ModelSelectorProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const { activeModel, setActiveModel } = useChatStore();

  // HF Verification state
  const [hfVerifying, setHfVerifying] = useState(false);
  const [hfReport, setHfReport] = useState<HFVerifyReport | null>(null);
  const [hfDialogOpen, setHfDialogOpen] = useState(false);
  const [hfError, setHfError] = useState<string | null>(null);

  // HF Dynamic models state
  const [hfChatModels, setHfChatModels] = useState<Record<string, HFChatModelEntry> | null>(null);
  const [hfImageModels, setHfImageModels] = useState<Record<string, HFImageModelEntry> | null>(null);
  const [hfVideoModels, setHfVideoModels] = useState<Record<string, HFVideoModelEntry> | null>(null);
  const [hfChatCategories, setHfChatCategories] = useState<string[]>([]);
  const [hfChatTotal, setHfChatTotal] = useState(0);
  const [hfImageTotal, setHfImageTotal] = useState(0);
  const [hfVideoTotal, setHfVideoTotal] = useState(0);
  const [hfLoading, setHfLoading] = useState(false);
  const [hfHealth, setHfHealth] = useState<HFHealthResponse | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Custom models state (from aggregator/admin)
  const [customModels, setCustomModels] = useState<Array<{
    id: string;
    name: string;
    nameEn: string;
    category: string;
    provider: string;
    isFree: boolean;
    icon: string;
    description: string | null;
    modelId: string | null;
    apiFormat: string;
  }> | null>(null);

  const { token } = useAuthStore();

  // ─── Fetch HF models when tab changes ──────────────────────────────
  useEffect(() => {
    if (!open) return;

    const fetchHFModels = async (category: string) => {
      setHfLoading(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const [modelsRes, healthRes] = await Promise.all([
          fetch(`/api/ai/hf/models?category=${category}`, { headers }),
          fetch('/api/ai/hf/health', { headers }),
        ]);

        if (modelsRes.ok) {
          const data: HFModelsResponse = await modelsRes.json();
          if (category === 'chat' && data.chat) {
            setHfChatModels(data.chat.models);
            setHfChatCategories(data.chat.categories);
            setHfChatTotal(data.chat.totalCount);
            // Auto-expand first 5 categories
            setExpandedCategories(new Set(data.chat.categories.slice(0, 5)));
          } else if (category === 'image' && data.image) {
            setHfImageModels(data.image.models);
            setHfImageTotal(data.image.totalCount);
          } else if (category === 'video' && data.video) {
            setHfVideoModels(data.video.models);
            setHfVideoTotal(data.video.totalCount);
          }
        }

        if (healthRes.ok) {
          const healthData: HFHealthResponse = await healthRes.json();
          setHfHealth(healthData);
        }
      } catch (err) {
        console.error('Failed to fetch HF models:', err);
      } finally {
        setHfLoading(false);
      }
    };

    if (activeTab === 'hf-chat' && !hfChatModels) {
      fetchHFModels('chat');
    } else if (activeTab === 'hf-image' && !hfImageModels) {
      fetchHFModels('image');
    } else if (activeTab === 'hf-video' && !hfVideoModels) {
      fetchHFModels('video');
    }
  }, [activeTab, open, hfChatModels, hfImageModels, hfVideoModels, token]);

  // ─── Filter existing models ─────────────────────────────────────────
  const filteredModels = useMemo(() => {
    let result = models;

    // ── إخفاء الموديلات تحت 128K + Claude + Gemini ──
    result = result.filter((m) => {
      const maxTokens = (m as any).maxTokens || 0;
      const isClaude = m.id.startsWith('delta-claude');
      const isGemini = m.id.startsWith('gemini');
      const isUnder128K = maxTokens < 128000;
      // أخفيها كلها
      if (isClaude || isGemini || isUnder128K) return false;
      return true;
    });

    // Filter by category
    if (activeTab !== 'all') {
      result = getModelsByCategory(activeTab as ModelCategory).filter((m) => {
        const maxTokens = (m as any).maxTokens || 0;
        if (m.id.startsWith('delta-claude') || m.id.startsWith('gemini') || maxTokens < 128000) return false;
        return true;
      });
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.nameEn.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.descriptionEn.toLowerCase().includes(q) ||
          m.rank.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
      );
    }

    return result;
  }, [activeTab, search]);

  // ─── Filter HF models by search ─────────────────────────────────────
  const filteredHFChatModels = useMemo(() => {
    if (!hfChatModels) return {};
    if (!search.trim()) return hfChatModels;
    const q = search.toLowerCase();
    const filtered: Record<string, HFChatModelEntry> = {};
    for (const [key, m] of Object.entries(hfChatModels)) {
      if (
        m.name.toLowerCase().includes(q) ||
        m.shortName.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.size.toLowerCase().includes(q)
      ) {
        filtered[key] = m;
      }
    }
    return filtered;
  }, [hfChatModels, search]);

  const filteredHFImageModels = useMemo(() => {
    if (!hfImageModels) return {};
    if (!search.trim()) return hfImageModels;
    const q = search.toLowerCase();
    const filtered: Record<string, HFImageModelEntry> = {};
    for (const [key, m] of Object.entries(hfImageModels)) {
      if (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q)
      ) {
        filtered[key] = m;
      }
    }
    return filtered;
  }, [hfImageModels, search]);

  const filteredHFVideoModels = useMemo(() => {
    if (!hfVideoModels) return {};
    if (!search.trim()) return hfVideoModels;
    const q = search.toLowerCase();
    const filtered: Record<string, HFVideoModelEntry> = {};
    for (const [key, m] of Object.entries(hfVideoModels)) {
      if (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q)
      ) {
        filtered[key] = m;
      }
    }
    return filtered;
  }, [hfVideoModels, search]);

  // ─── Group HF chat models by category ────────────────────────────────
  const groupedHFChatModels = useMemo(() => {
    const groups: Record<string, HFChatModelEntry[]> = {};
    for (const m of Object.values(filteredHFChatModels)) {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    }
    // Sort categories to match the order from hfChatCategories
    const sortedKeys = hfChatCategories.filter((c) => groups[c]);
    for (const key of Object.keys(groups)) {
      if (!sortedKeys.includes(key)) sortedKeys.push(key);
    }
    return { keys: sortedKeys, groups };
  }, [filteredHFChatModels, hfChatCategories]);

  // ─── Model counts per category (for badges) ────────────────────────
  const modelCountsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of MODEL_CATEGORIES) {
      if (cat.id === 'hf-chat') {
        counts[cat.id] = hfChatTotal || getModelsByCategory('hf-chat' as ModelCategory).length;
      } else if (cat.id === 'hf-image') {
        counts[cat.id] = hfImageTotal || getModelsByCategory('hf-image' as ModelCategory).length;
      } else if (cat.id === 'hf-video') {
        counts[cat.id] = hfVideoTotal || getModelsByCategory('hf-video' as ModelCategory).length;
      } else {
        counts[cat.id] = getModelsByCategory(cat.id as ModelCategory).length;
      }
    }
    return counts;
  }, [hfChatTotal, hfImageTotal, hfVideoTotal]);

  // ─── Unified global search across ALL models ────────────────────────
  const globalSearchResults = useMemo(() => {
    if (!search.trim()) return null;

    const q = search.toLowerCase();
    const results: Array<{
      type: 'static' | 'hf-chat' | 'hf-image' | 'hf-video' | 'custom';
      id: string;
      selectId: string;
      name: string;
      nameEn: string;
      description: string;
      category: string;
      badges: string[];
    }> = [];

    // Search static models (with filter: hide Claude/Gemini/under-128K)
    for (const m of models) {
      // ── فلتر: أخفي Claude + Gemini + تحت 128K ──
      const mMaxTokens = (m as any).maxTokens || 0;
      if (m.id.startsWith('delta-claude') || m.id.startsWith('gemini') || mMaxTokens < 128000) continue;
      if (
        m.name.toLowerCase().includes(q) ||
        m.nameEn.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.descriptionEn.toLowerCase().includes(q) ||
        m.rank.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      ) {
        const badges: string[] = [];
        if (m.capabilities.vision) badges.push('👁️ رؤية');
        if (m.capabilities.imageGeneration) badges.push('🖼️ صور');
        if (m.capabilities.videoGeneration) badges.push('🎬 فيديو');
        if (m.capabilities.codeGeneration) badges.push('💻 كود');
        if (m.supportsPdf) badges.push('PDF');
        if (m.openSource) badges.push('مفتوح');
        if (m.category === 'huggingface') badges.push('🤗 HF');
        results.push({
          type: 'static',
          id: m.id,
          selectId: m.id,
          name: m.name,
          nameEn: m.nameEn,
          description: m.description,
          category: m.category,
          badges,
        });
      }
    }

    // Search HF chat models
    if (hfChatModels) {
      for (const [, m] of Object.entries(hfChatModels)) {
        if (
          m.name.toLowerCase().includes(q) ||
          m.shortName.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.size.toLowerCase().includes(q)
        ) {
          results.push({
            type: 'hf-chat',
            id: m.id,
            selectId: `hf-chat:${m.id}`,
            name: m.shortName || m.name,
            nameEn: m.id,
            description: `${m.category} • ${m.size}`,
            category: 'hf-chat',
            badges: ['🤗 HF', 'مفتوح', m.size],
          });
        }
      }
    }

    // Search HF image models
    if (hfImageModels) {
      for (const [, m] of Object.entries(hfImageModels)) {
        if (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q)
        ) {
          results.push({
            type: 'hf-image',
            id: m.id,
            selectId: `hf-image:${m.id}`,
            name: m.name,
            nameEn: m.id,
            description: `توليد صور • ${m.type}`,
            category: 'hf-image',
            badges: ['🖼️ HF صور', 'مفتوح'],
          });
        }
      }
    }

    // Search HF video models
    if (hfVideoModels) {
      for (const [, m] of Object.entries(hfVideoModels)) {
        if (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q)
        ) {
          results.push({
            type: 'hf-video',
            id: m.id,
            selectId: `hf-video:${m.id}`,
            name: m.name,
            nameEn: m.id,
            description: `توليد فيديو • ${m.type}`,
            category: 'hf-video',
            badges: ['🎬 HF فيديو', 'مفتوح'],
          });
        }
      }
    }

    // Search custom models
    if (customModels) {
      for (const m of customModels) {
        if (
          m.name.toLowerCase().includes(q) ||
          m.nameEn.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q)
        ) {
          const categoryLabels: Record<string, string> = { chat: 'شات مضاف', image: 'صور مضافة', video: 'فيديو مضاف' };
          results.push({
            type: 'custom',
            id: m.id,
            selectId: `custom:${m.category}:${m.id}`,
            name: m.name,
            nameEn: m.nameEn,
            description: m.description || `${m.provider} • ${m.category}`,
            category: m.category as any,
            badges: [m.icon || '⚡', categoryLabels[m.category] || 'مضاف', m.isFree ? 'مجاني' : 'مدفوع'],
          });
        }
      }
    }

    return results;
  }, [search, hfChatModels, hfImageModels, hfVideoModels, customModels]);

  // ─── Preload all HF models on dialog open for global search ──────────
  useEffect(() => {
    if (!open) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Preload HF chat models for search if not already loaded
    if (!hfChatModels) {
      fetch(`/api/ai/hf/models?category=chat`, { headers })
        .then((res) => res.ok ? res.json() : null)
        .then((data: HFModelsResponse | null) => {
          if (data?.chat) {
            setHfChatModels(data.chat.models);
            setHfChatCategories(data.chat.categories);
            setHfChatTotal(data.chat.totalCount);
            setExpandedCategories(new Set(data.chat.categories.slice(0, 5)));
          }
        })
        .catch(() => {});
    }
    if (!hfImageModels) {
      fetch(`/api/ai/hf/models?category=image`, { headers })
        .then((res) => res.ok ? res.json() : null)
        .then((data: HFModelsResponse | null) => {
          if (data?.image) {
            setHfImageModels(data.image.models);
            setHfImageTotal(data.image.totalCount);
          }
        })
        .catch(() => {});
    }
    if (!hfVideoModels) {
      fetch(`/api/ai/hf/models?category=video`, { headers })
        .then((res) => res.ok ? res.json() : null)
        .then((data: HFModelsResponse | null) => {
          if (data?.video) {
            setHfVideoModels(data.video.models);
            setHfVideoTotal(data.video.totalCount);
          }
        })
        .catch(() => {});
    }
    // Preload custom models — always re-fetch when dialog opens
    fetch('/api/ai/custom-models')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.models) setCustomModels(data.models);
      })
      .catch(() => {});
    // Only run when dialog opens
  }, [open, token]);

  const handleSelect = (modelId: string) => {
    setActiveModel(modelId);
    onOpenChange(false);
  };

  const handleHFModelSelect = (prefix: 'hf-chat' | 'hf-image' | 'hf-video', modelId: string) => {
    setActiveModel(`${prefix}:${modelId}`);
    onOpenChange(false);
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleHFVerify = useCallback(async () => {
    if (hfVerifying) return;

    setHfVerifying(true);
    setHfError(null);
    setHfReport(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/ai/hf-verify', {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'فشل الاتصال' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const report: HFVerifyReport = await response.json();
      setHfReport(report);
      setHfDialogOpen(true);
    } catch (err) {
      setHfError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setHfVerifying(false);
    }
  }, [hfVerifying, token]);

  // Determine the overall status indicator for the button
  const overallStatus = hfReport ? getOverallStatus(hfReport) : null;

  // Check if activeModel is an HF model (null-safe — activeModel can be null on first load)
  const isHFModel = !!activeModel && (activeModel.startsWith('hf-chat:') || activeModel.startsWith('hf-image:') || activeModel.startsWith('hf-video:'));
  const currentModel = !isHFModel && activeModel ? getModelById(activeModel) : undefined;

  // Get HF model display info
  const getHFModelDisplay = () => {
    if (!isHFModel || !activeModel) return null;
    const [prefix, ...rest] = activeModel.split(':');
    const modelId = rest.join(':');
    if (prefix === 'hf-chat' && hfChatModels?.[modelId]) {
      return { name: hfChatModels[modelId].name, prefix: 'HF شات', icon: '🤗' };
    }
    if (prefix === 'hf-image' && hfImageModels?.[modelId]) {
      return { name: hfImageModels[modelId].name, prefix: 'HF صور', icon: '🖼️' };
    }
    if (prefix === 'hf-video' && hfVideoModels?.[modelId]) {
      return { name: hfVideoModels[modelId].name, prefix: 'HF فيديو', icon: '🎬' };
    }
    // Fallback if models haven't loaded yet
    return { name: modelId, prefix: prefix === 'hf-chat' ? 'HF شات' : prefix === 'hf-image' ? 'HF صور' : 'HF فيديو', icon: '🤗' };
  };
  const hfDisplay = getHFModelDisplay();

  // Check model health from health data
  const getModelHealthStatus = (modelId: string): 'usable' | 'loading' | 'rate-limited' | 'unavailable' | 'disabled' | 'unknown' => {
    if (!hfHealth?.modelHealth?.[modelId]) return 'unknown';
    const h = hfHealth.modelHealth[modelId];
    if (h.disabled) return 'disabled';
    if (h.unavailable) return 'unavailable';
    if (h.usable) return 'usable';
    if (h.loading) return 'loading';
    if (h.rateLimited) return 'rate-limited';
    return 'unknown';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl h-[95vh] sm:h-auto sm:max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col" showCloseButton={false}>
          <DialogHeader className="p-3 sm:p-4 pb-2 border-b shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold">
                  اختر النموذج
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  اختر نموذج الذكاء الاصطناعي المناسب لمحادثتك
                </DialogDescription>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="size-5" />
              </button>
            </div>
            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن نموذج..."
                className="pr-10 pl-4"
                dir="rtl"
              />
            </div>
          </DialogHeader>

          {/* Category Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="px-3 pt-2 overflow-x-auto">
              <TabsList className="w-full flex-nowrap h-auto gap-1 p-1 inline-flex min-w-max">
                <TabsTrigger value="all" className="text-xs shrink-0 gap-0.5 px-2 py-1">
                  <span>الكل</span>
                  <Badge variant="secondary" className="text-[8px] px-1 py-0">{models.length}</Badge>
                </TabsTrigger>
                {MODEL_CATEGORIES.map((cat) => {
                  const count = modelCountsByCategory[cat.id] || 0;
                  const isHFTab = cat.id === 'hf-chat' || cat.id === 'hf-image' || cat.id === 'hf-video';
                  return (
                    <TabsTrigger
                      key={cat.id}
                      value={cat.id}
                      className={cn(
                        'text-xs shrink-0 gap-0.5 px-2 py-1',
                        isHFTab && 'bg-blue-500 border border-blue-500'
                      )}
                    >
                      <span className="hidden sm:inline">{cat.name}</span>
                      <span className="sm:hidden">{cat.id === 'hf-chat' ? '🤗شات' : cat.id === 'hf-image' ? '🤗صور' : cat.id === 'hf-video' ? '🤗فيديو' : cat.name}</span>
                      {count > 0 && (
                        <Badge className={cn(
                          'text-[8px] px-1 py-0 ml-0.5',
                          isHFTab ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'
                        )}>
                          {count}
                        </Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
                <TabsTrigger value="custom" className="text-xs shrink-0 gap-0.5 px-2 py-1 bg-blue-500 border border-blue-500">
                  <span>⚡</span>
                  <span>المضافة</span>
                  {customModels && customModels.length > 0 && (
                    <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 min-w-[14px] bg-blue-500 text-white">
                      {customModels.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* HuggingFace Verify Button - shown when huggingface tab is active */}
            <AnimatePresence>
              {activeTab === 'huggingface' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pt-2 overflow-hidden"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleHFVerify}
                    disabled={hfVerifying}
                    className={cn(
                      'w-full gap-2 text-xs h-9 border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950',
                      overallStatus === 'all-good' && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
                      overallStatus === 'some-loading' && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
                      overallStatus === 'many-failed' && 'border-red-500 bg-red-50 dark:bg-red-950',
                    )}
                  >
                    {hfVerifying ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : overallStatus ? (
                      <span>{getOverallIcon(overallStatus)}</span>
                    ) : (
                      <span>🤗</span>
                    )}
                    <span>{hfVerifying ? 'جاري الفحص...' : 'فحص نماذج HuggingFace'}</span>
                    {!hfVerifying && hfReport && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[9px] px-1 py-0 mr-1',
                          overallStatus === 'all-good' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                          overallStatus === 'some-loading' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                          overallStatus === 'many-failed' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                        )}
                      >
                        {hfReport.available}/{hfReport.totalModels}
                      </Badge>
                    )}
                  </Button>
                  {hfError && (
                    <p className="text-[10px] text-red-500 mt-1 text-center">{hfError}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Global Search Results ─────────────────────────────────── */}
            {search.trim() && globalSearchResults && (
              <TabsContent value={activeTab} className="flex-1 min-h-0 mt-0" forceMount>
                <ScrollArea className="flex-1 h-[60vh] sm:h-[450px] min-h-[300px]">
                  <div className="p-4 space-y-4">
                    {/* Search results summary */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-primary border border-primary">
                      <Search className="size-4 text-primary" />
                      <span className="text-xs font-medium text-primary">
                        {globalSearchResults.length} نتيجة لـ &quot;{search}&quot;
                      </span>
                      <span className="text-[10px] text-muted-foreground mr-auto">
                        بحث في جميع النماذج ({models.length} ثابت + {hfChatTotal + hfImageTotal + hfVideoTotal} HF)
                      </span>
                    </div>

                    {/* Static model results */}
                    {globalSearchResults.filter(r => r.type === 'static').length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <List className="size-3" />
                          نماذج Anzaro AI ({globalSearchResults.filter(r => r.type === 'static').length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {globalSearchResults.filter(r => r.type === 'static').map((result) => {
                            const isSelected = activeModel === result.selectId;
                            return (
                              <motion.button
                                key={result.selectId}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => handleSelect(result.selectId)}
                                className={cn(
                                  'relative text-right p-3 rounded-lg border transition-all duration-200',
                                  'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                  'min-h-[70px] group',
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                    : 'border-border bg-card'
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute top-2 left-2">
                                    <div className="size-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                      <Check className="size-2.5 text-white dark:text-black" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1">
                                  {result.badges?.map((badge, i) => (
                                    <Badge key={i} variant="secondary" className="text-[8px] px-1 py-0">{badge}</Badge>
                                  ))}
                                </div>
                                <div className="mt-1">
                                  <h3 className="font-semibold text-sm text-foreground truncate">{result.name}</h3>
                                  <span className="text-[9px] text-muted-foreground font-mono">{result.nameEn}</span>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{result.description}</p>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* HF Chat model results */}
                    {globalSearchResults.filter(r => r.type === 'hf-chat').length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                          🤗 HuggingFace شات ({globalSearchResults.filter(r => r.type === 'hf-chat').length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {globalSearchResults.filter(r => r.type === 'hf-chat').map((result) => {
                            const isSelected = activeModel === result.selectId;
                            return (
                              <motion.button
                                key={result.selectId}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => handleSelect(result.selectId)}
                                className={cn(
                                  'relative text-right p-3 rounded-lg border transition-all duration-200',
                                  'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                  'min-h-[70px] group',
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                    : 'border-border bg-card'
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute top-2 left-2">
                                    <div className="size-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                      <Check className="size-2.5 text-white dark:text-black" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1">
                                  {result.badges?.map((badge, i) => (
                                    <Badge key={i} className="text-[8px] px-1 py-0 bg-blue-500 text-white">{badge}</Badge>
                                  ))}
                                </div>
                                <div className="mt-1">
                                  <h3 className="font-semibold text-sm text-foreground truncate">{result.name}</h3>
                                  <p className="text-[9px] text-blue-500 font-mono truncate">{result.nameEn}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{result.description}</p>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* HF Image model results */}
                    {globalSearchResults.filter(r => r.type === 'hf-image').length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                          🖼️ HuggingFace صور ({globalSearchResults.filter(r => r.type === 'hf-image').length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {globalSearchResults.filter(r => r.type === 'hf-image').map((result) => {
                            const isSelected = activeModel === result.selectId;
                            return (
                              <motion.button
                                key={result.selectId}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => handleSelect(result.selectId)}
                                className={cn(
                                  'relative text-right p-3 rounded-lg border transition-all duration-200',
                                  'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                  'min-h-[70px] group',
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                    : 'border-border bg-card'
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute top-2 left-2">
                                    <div className="size-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                      <Check className="size-2.5 text-white dark:text-black" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1">
                                  {result.badges?.map((badge, i) => (
                                    <Badge key={i} className="text-[8px] px-1 py-0 bg-blue-500 text-white">{badge}</Badge>
                                  ))}
                                </div>
                                <div className="mt-1">
                                  <h3 className="font-semibold text-sm text-foreground truncate">{result.name}</h3>
                                  <p className="text-[9px] text-blue-500 font-mono truncate">{result.nameEn}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{result.description}</p>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* HF Video model results */}
                    {globalSearchResults.filter(r => r.type === 'hf-video').length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                          🎬 HuggingFace فيديو ({globalSearchResults.filter(r => r.type === 'hf-video').length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {globalSearchResults.filter(r => r.type === 'hf-video').map((result) => {
                            const isSelected = activeModel === result.selectId;
                            return (
                              <motion.button
                                key={result.selectId}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => handleSelect(result.selectId)}
                                className={cn(
                                  'relative text-right p-3 rounded-lg border transition-all duration-200',
                                  'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                  'min-h-[70px] group',
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                    : 'border-border bg-card'
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute top-2 left-2">
                                    <div className="size-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                      <Check className="size-2.5 text-white dark:text-black" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1">
                                  {result.badges?.map((badge, i) => (
                                    <Badge key={i} className="text-[8px] px-1 py-0 bg-blue-500 text-white">{badge}</Badge>
                                  ))}
                                </div>
                                <div className="mt-1">
                                  <h3 className="font-semibold text-sm text-foreground truncate">{result.name}</h3>
                                  <p className="text-[9px] text-blue-500 font-mono truncate">{result.nameEn}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{result.description}</p>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {globalSearchResults.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="text-sm">لا توجد نتائج مطابقة لـ &quot;{search}&quot;</p>
                        <p className="text-xs mt-1">جرب كلمات بحث مختلفة</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            )}

            {/* Models Grid — Existing Anzaro AI models (hidden when searching globally) */}
            {!search.trim() && ['all', ...MODEL_CATEGORIES.filter(c => c.id !== 'hf-chat' && c.id !== 'hf-image' && c.id !== 'hf-video').map((c) => c.id)].map((tabVal) => (
              <TabsContent key={tabVal} value={tabVal} className="flex-1 min-h-0 mt-0">
                <ScrollArea className="flex-1 h-[60vh] sm:h-[450px] min-h-[300px]">
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <AnimatePresence mode="popLayout">
                      {filteredModels.map((model) => {
                        const isSelected = model.id === activeModel;
                        return (
                          <motion.button
                            key={model.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={() => handleSelect(model.id)}
                            className={cn(
                              'relative text-right p-4 rounded-xl border transition-all duration-200',
                              'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                              'min-h-[100px] group',
                              isSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                : 'border-border bg-card'
                            )}
                          >
                            {/* Selected check */}
                            {isSelected && (
                              <div className="absolute top-2 left-2">
                                <div className="size-5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                  <Check className="size-3 text-white dark:text-black" />
                                </div>
                              </div>
                            )}
                            {/* Badges top-right */}
                            <div className="absolute top-2 right-2 flex gap-1">
                              {model.supportsPdf && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                  PDF
                                </Badge>
                              )}
                              {model.provider === 'groq' && (
                                <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700">
                                  Groq ⚡
                                </Badge>
                              )}
                              {model.provider === 'gemini' && (
                                <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700">
                                  Gemini 🔵
                                </Badge>
                              )}
                              {model.provider === 'github' && (
                                <Badge className="text-[9px] px-1 py-0 bg-gray-700 text-white hover:bg-gray-800">
                                  GitHub 🐙
                                </Badge>
                              )}
                              {model.provider === 'pollinations' && (
                                <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700">
                                  Pollinations 🌸
                                </Badge>
                              )}
                              {model.provider === 'zhipuai' && (
                                <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700">
                                  ZhipuAI 🇨🇳
                                </Badge>
                              )}
                              {model.provider === 'openrouter' && (
                                <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700">
                                  OpenRouter
                                </Badge>
                              )}
                              {model.category === 'huggingface' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="text-[9px] px-1 py-0 bg-blue-500 text-white hover:bg-blue-600 cursor-help">
                                      🤗 HF
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[250px] text-center">
                                    مجاني من HuggingFace - ممكن يكون بطيء في أول استخدام
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {model.openSource && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700 cursor-help">
                                      مفتوح
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[250px] text-center">
                                    نموذج مفتوح المصدر — قيود أقل، رفض أقل للأسئلة
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-base text-foreground truncate">
                                  {model.name}
                                </h3>
                                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                  {model.nameEn}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                {model.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                                  {model.rank}
                                </span>
                                {model.openSource && (
                                  <span className="text-[10px] text-blue-500 dark:text-blue-400">
                                    مفتوح المصدر
                                  </span>
                                )}
                                {/* Context window badge — عشان المستخدم يختار حسب الذاكرة */}
                                {model.maxTokens && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-medium" title="حجم الذاكرة (Context Window)">
                                    🧠 {model.maxTokens >= 1000000
                                      ? `${(model.maxTokens / 1000000).toFixed(1)}M`
                                      : model.maxTokens >= 1000
                                        ? `${Math.round(model.maxTokens / 1000)}K`
                                        : model.maxTokens
                                    } tokens
                                  </span>
                                )}
                                {/* HuggingFace slow notice */}
                                {model.category === 'huggingface' && (
                                  <span className="text-[10px] text-blue-600 dark:text-blue-400">
                                    مجاني - ممكن يكون بطيء
                                  </span>
                                )}
                              </div>
                              {/* Capabilities badges */}
                              <div className="flex flex-wrap items-center gap-1 mt-2">
                                {model.capabilities.vision && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">👁️ رؤية</span>
                                )}
                                {model.capabilities.imageGeneration && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🖼️ صور</span>
                                )}
                                {model.capabilities.videoGeneration && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🎬 فيديو</span>
                                )}
                                {model.capabilities.codeGeneration && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">💻 كود</span>
                                )}
                                {model.capabilities.pdfAnalysis && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">📄 PDF</span>
                                )}
                                {model.capabilities.webSearch && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🔍 ويب</span>
                                )}
                                {model.capabilities.reasoning && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🧠 منطق</span>
                                )}
                                {model.capabilities.rag && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">📚 RAG</span>
                                )}
                                {model.capabilities.audioTTS && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🔊 صوت</span>
                                )}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                  {filteredModels.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      <p className="text-sm">لا توجد نتائج مطابقة</p>
                    </div>
                  )}
                  {/* Custom Models Section in الكل tab */}
                  {tabVal === 'all' && customModels && customModels.length > 0 && (
                    <div className="px-4 pb-4">
                      <div className="border-t pt-3 mt-2">
                        <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                          <span>⚡</span>
                          نماذجك المخصصة ({customModels.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {customModels.map((m) => {
                            const selectId = `custom:${m.category}:${m.id}`;
                            const isSelected = activeModel === selectId;
                            const categoryLabels: Record<string, string> = { chat: '💬 شات', image: '🖼️ صور', video: '🎬 فيديو', asr: '🎤 صوت', translation: '🌐 ترجمة' };
                            return (
                              <motion.button
                                key={m.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => handleSelect(selectId)}
                                className={cn(
                                  'relative text-right p-3 rounded-lg border transition-all duration-200',
                                  'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                  'min-h-[60px] group',
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                    : 'border-border bg-card'
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute top-2 left-2">
                                    <div className="size-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                      <Check className="size-2.5 text-white dark:text-black" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1">
                                  <Badge className="text-[8px] px-1 py-0 bg-blue-500 text-white">{categoryLabels[m.category] || m.category}</Badge>
                                  {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-blue-500 text-blue-600">مجاني</Badge>}
                                </div>
                                <div className="mt-1">
                                  <h3 className="font-semibold text-sm text-foreground truncate">{m.icon} {m.name}</h3>
                                  <span className="text-[9px] text-muted-foreground font-mono">{m.nameEn}</span>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</p>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            ))}

            {/* ─── HF Chat Models Tab (hidden when searching globally) ──────────── */}
            {!search.trim() && (
            <TabsContent value="hf-chat" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="flex-1 h-[60vh] sm:h-[450px] min-h-[300px]">
                {hfLoading && !hfChatModels ? (
                  <div className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin text-blue-500" />
                    <p className="text-sm">جاري تحميل نماذج HuggingFace...</p>
                  </div>
                ) : hfChatModels ? (
                  <div className="p-4 space-y-3">
                    {/* Health summary bar */}
                    {hfHealth && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                        <span className="text-sm">🤗</span>
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                          {hfHealth.chat.usable} متاح من {hfHealth.chat.total}
                        </span>
                        {hfHealth.chat.loading > 0 && (
                          <Badge className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {hfHealth.chat.loading} قيد التحميل
                          </Badge>
                        )}
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 mr-auto">
                          مجاني - ممكن يكون بطيء في أول استخدام
                        </span>
                      </div>
                    )}

                    {/* Model count + expand/collapse all + refresh */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-muted-foreground">
                        {Object.keys(filteredHFChatModels).length} نموذج
                        {search.trim() && ` من ${hfChatTotal}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-6 px-2 text-blue-600 dark:text-blue-400"
                          onClick={() => {
                            // Reset all HF models state to trigger re-fetch
                            setHfChatModels(null);
                            setHfImageModels(null);
                            setHfVideoModels(null);
                            setHfHealth(null);
                          }}
                          disabled={hfLoading}
                        >
                          <RefreshCw className={cn('size-3', hfLoading && 'animate-spin')} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-6 px-2 text-blue-600 dark:text-blue-400"
                          onClick={() => setExpandedCategories(new Set(hfChatCategories))}
                        >
                          فتح الكل
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-6 px-2 text-muted-foreground"
                          onClick={() => setExpandedCategories(new Set())}
                        >
                          إغلاق الكل
                        </Button>
                      </div>
                    </div>

                    {/* Custom chat models */}
                    {customModels && customModels.filter(m => m.category === 'chat').length > 0 && (
                      <div className="px-1 pb-3 border-b mb-1">
                        <h4 className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                          <span>💬</span>
                          نماذجك المخصصة ({customModels.filter(m => m.category === 'chat').length})
                        </h4>
                        <div className="space-y-1">
                          {customModels.filter(m => m.category === 'chat').map((m) => (
                            <motion.button
                              key={m.id}
                              onClick={() => handleSelect(`custom:chat:${m.id}`)}
                              className={cn(
                                'w-full text-right p-2 rounded-lg border transition-all text-xs',
                                activeModel === `custom:chat:${m.id}`
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-transparent hover:muted'
                              )}
                              whileHover={{ scale: 1.005 }}
                              whileTap={{ scale: 0.995 }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span>{m.icon || '💬'}</span>
                                  <div>
                                    <span className="font-medium">{m.name}</span>
                                    <span className="text-muted-foreground block text-[10px]">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</span>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-blue-500 text-blue-600">مجاني</Badge>}
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grouped by category */}
                    {groupedHFChatModels.keys.map((cat) => {
                      const catModels = groupedHFChatModels.groups[cat] || [];
                      if (catModels.length === 0) return null;
                      const isExpanded = expandedCategories.has(cat);
                      return (
                        <div key={cat} className="rounded-lg border border-border overflow-hidden">
                          <button
                            onClick={() => toggleCategory(cat)}
                            className="w-full flex items-center justify-between p-3 hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground">{cat}</span>
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                {catModels.length}
                              </Badge>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            )}
                          </button>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 pt-0">
                                  {catModels.map((m) => {
                                    const modelPrefixedId = `hf-chat:${m.id}`;
                                    const isSelected = activeModel === modelPrefixedId;
                                    const healthStatus = getModelHealthStatus(m.id);
                                    return (
                                      <motion.button
                                        key={m.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        onClick={() => handleHFModelSelect('hf-chat', m.id)}
                                        className={cn(
                                          'relative text-right p-3 rounded-lg border transition-all duration-200',
                                          'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                          'min-h-[80px] group',
                                          isSelected
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                            : 'border-border bg-card'
                                        )}
                                      >
                                        {isSelected && (
                                          <div className="absolute top-2 left-2">
                                            <div className="size-4 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                              <Check className="size-2.5 text-white dark:text-black" />
                                            </div>
                                          </div>
                                        )}
                                        <div className="absolute top-2 right-2 flex gap-1">
                                          <Badge className="text-[9px] px-1 py-0 bg-blue-500 text-white hover:bg-blue-600">
                                            🤗 HF
                                          </Badge>
                                          <Badge className="text-[9px] px-1 py-0 bg-blue-600 text-white hover:bg-blue-700">
                                            مفتوح
                                          </Badge>
                                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                            {m.size}
                                          </Badge>
                                        </div>
                                        <div className="mt-1">
                                          <h3 className="font-semibold text-sm text-foreground truncate pr-1">
                                            {m.shortName}
                                          </h3>
                                          <p className="text-[10px] text-blue-500 mt-0.5 font-mono truncate">
                                            {m.id}
                                          </p>
                                          <div className="flex items-center gap-1.5 mt-1">
                                            {/* Health indicator — emoji pill badge */}
                                            <span className={cn(
                                              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium border',
                                              getHealthPillClass(healthStatus)
                                            )}>
                                              <span className="text-[10px]">{getHealthEmoji(healthStatus)}</span>
                                              {getHealthLabel(healthStatus)}
                                            </span>
                                            {/* Context window badge */}
                                            {m.maxTokens && (
                                              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono font-medium" title="الذاكرة">
                                                🧠 {m.maxTokens >= 1000000 ? `${(m.maxTokens / 1000000).toFixed(1)}M` : `${Math.round(m.maxTokens / 1000)}K`}
                                              </span>
                                            )}
                                            <span className="text-[10px] text-blue-600 dark:text-blue-400 mr-auto">
                                              مجاني
                                            </span>
                                          </div>
                                        </div>
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {Object.keys(filteredHFChatModels).length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="text-sm">لا توجد نتائج مطابقة</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">فشل تحميل النماذج</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            )}

            {/* ─── HF Image Models Tab (hidden when searching globally) ─────────── */}
            {!search.trim() && (
            <TabsContent value="hf-image" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="flex-1 h-[60vh] sm:h-[450px] min-h-[300px]">
                {hfLoading && !hfImageModels ? (
                  <div className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin text-blue-500" />
                    <p className="text-sm">جاري تحميل نماذج توليد الصور...</p>
                  </div>
                ) : hfImageModels ? (
                  <div className="p-4 space-y-3">
                    {/* Health summary bar */}
                    {hfHealth && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                        <span className="text-sm">🖼️</span>
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                          {hfHealth.image.usable} متاح من {hfHealth.image.total}
                        </span>
                        {hfHealth.image.loading > 0 && (
                          <Badge className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {hfHealth.image.loading} قيد التحميل
                          </Badge>
                        )}
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 mr-auto">
                          مجاني - ممكن يكون بطيء في أول استخدام
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-muted-foreground">
                        {Object.keys(filteredHFImageModels).length} نموذج صور
                        {search.trim() && ` من ${hfImageTotal}`}
                      </span>
                    </div>

                    {/* Custom image models */}
                    {customModels && customModels.filter(m => m.category === 'image').length > 0 && (
                      <div className="px-1 pb-3 border-b mb-1">
                        <h4 className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                          <span>🖼️</span>
                          نماذجك المخصصة ({customModels.filter(m => m.category === 'image').length})
                        </h4>
                        <div className="space-y-1">
                          {customModels.filter(m => m.category === 'image').map((m) => (
                            <motion.button
                              key={m.id}
                              onClick={() => handleSelect(`custom:image:${m.id}`)}
                              className={cn(
                                'w-full text-right p-2 rounded-lg border transition-all text-xs',
                                activeModel === `custom:image:${m.id}`
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-transparent hover:muted'
                              )}
                              whileHover={{ scale: 1.005 }}
                              whileTap={{ scale: 0.995 }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span>{m.icon || '🖼️'}</span>
                                  <div>
                                    <span className="font-medium">{m.name}</span>
                                    <span className="text-muted-foreground block text-[10px]">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</span>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-blue-500 text-blue-600">مجاني</Badge>}
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <AnimatePresence mode="popLayout">
                        {Object.values(filteredHFImageModels).map((m) => {
                          const modelPrefixedId = `hf-image:${m.id}`;
                          const isSelected = activeModel === modelPrefixedId;
                          const healthStatus = getModelHealthStatus(m.id);
                          return (
                            <motion.button
                              key={m.id}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              onClick={() => handleHFModelSelect('hf-image', m.id)}
                              className={cn(
                                'relative text-right p-4 rounded-xl border transition-all duration-200',
                                'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                'min-h-[100px] group',
                                isSelected
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                  : 'border-border bg-card'
                              )}
                            >
                              {isSelected && (
                                <div className="absolute top-2 left-2">
                                  <div className="size-5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                    <Check className="size-3 text-white dark:text-black" />
                                  </div>
                                </div>
                              )}
                              <div className="absolute top-2 right-2 flex gap-1">
                                <Badge className="text-[9px] px-1 py-0 bg-blue-500 text-white hover:bg-blue-600">
                                  🤗 HF
                                </Badge>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                  {m.type === 'inference' ? 'Inference' : 'Gradio'}
                                </Badge>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="text-2xl mt-0.5">🖼️</span>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-sm text-foreground truncate">
                                    {m.name}
                                  </h3>
                                  <p className="text-[10px] text-blue-500 mt-0.5 font-mono truncate">
                                    {m.id}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className={cn(
                                      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium border',
                                      getHealthPillClass(healthStatus)
                                    )}>
                                      <span className="text-[10px]">{getHealthEmoji(healthStatus)}</span>
                                      {getHealthLabel(healthStatus)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mr-auto">
                                      {m.maxResolution}px
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                                    ⚡ مجاني - ممكن يكون بطيء في أول استخدام
                                  </p>
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {Object.keys(filteredHFImageModels).length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="text-sm">لا توجد نتائج مطابقة</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">فشل تحميل النماذج</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            )}

            {/* ─── HF Video Models Tab (hidden when searching globally) ─────────── */}
            {!search.trim() && (
            <TabsContent value="hf-video" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="flex-1 h-[60vh] sm:h-[450px] min-h-[300px]">
                {hfLoading && !hfVideoModels ? (
                  <div className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin text-blue-500" />
                    <p className="text-sm">جاري تحميل نماذج توليد الفيديو...</p>
                  </div>
                ) : hfVideoModels ? (
                  <div className="p-4 space-y-3">
                    {/* Health summary bar */}
                    {hfHealth && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                        <span className="text-sm">🎬</span>
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                          {hfHealth.video.usable} متاح من {hfHealth.video.total}
                        </span>
                        {hfHealth.video.loading > 0 && (
                          <Badge className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {hfHealth.video.loading} قيد التحميل
                          </Badge>
                        )}
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 mr-auto">
                          مجاني - ممكن يكون بطيء في أول استخدام
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-muted-foreground">
                        {Object.keys(filteredHFVideoModels).length} نموذج فيديو
                        {search.trim() && ` من ${hfVideoTotal}`}
                      </span>
                    </div>

                    {/* Custom video models */}
                    {customModels && customModels.filter(m => m.category === 'video').length > 0 && (
                      <div className="px-1 pb-3 border-b mb-1">
                        <h4 className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                          <span>🎬</span>
                          نماذجك المخصصة ({customModels.filter(m => m.category === 'video').length})
                        </h4>
                        <div className="space-y-1">
                          {customModels.filter(m => m.category === 'video').map((m) => (
                            <motion.button
                              key={m.id}
                              onClick={() => handleSelect(`custom:video:${m.id}`)}
                              className={cn(
                                'w-full text-right p-2 rounded-lg border transition-all text-xs',
                                activeModel === `custom:video:${m.id}`
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-transparent hover:muted'
                              )}
                              whileHover={{ scale: 1.005 }}
                              whileTap={{ scale: 0.995 }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span>{m.icon || '🎬'}</span>
                                  <div>
                                    <span className="font-medium">{m.name}</span>
                                    <span className="text-muted-foreground block text-[10px]">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</span>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-blue-500 text-blue-600">مجاني</Badge>}
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <AnimatePresence mode="popLayout">
                        {Object.values(filteredHFVideoModels).map((m) => {
                          const modelPrefixedId = `hf-video:${m.id}`;
                          const isSelected = activeModel === modelPrefixedId;
                          const healthStatus = getModelHealthStatus(m.id);
                          return (
                            <motion.button
                              key={m.id}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              onClick={() => handleHFModelSelect('hf-video', m.id)}
                              className={cn(
                                'relative text-right p-4 rounded-xl border transition-all duration-200',
                                'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500',
                                'min-h-[100px] group',
                                isSelected
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm'
                                  : 'border-border bg-card'
                              )}
                            >
                              {isSelected && (
                                <div className="absolute top-2 left-2">
                                  <div className="size-5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                                    <Check className="size-3 text-white dark:text-black" />
                                  </div>
                                </div>
                              )}
                              <div className="absolute top-2 right-2 flex gap-1">
                                <Badge className="text-[9px] px-1 py-0 bg-blue-500 text-white hover:bg-blue-600">
                                  🤗 HF
                                </Badge>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                  {m.type === 'gradio' ? 'Gradio' : m.type === 'inference' ? 'Inference' : 'ZhipuAI'}
                                </Badge>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="text-2xl mt-0.5">🎬</span>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-sm text-foreground truncate">
                                    {m.name}
                                  </h3>
                                  <p className="text-[10px] text-blue-500 mt-0.5 font-mono truncate">
                                    {m.id}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className={cn(
                                      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium border',
                                      getHealthPillClass(healthStatus)
                                    )}>
                                      <span className="text-[10px]">{getHealthEmoji(healthStatus)}</span>
                                      {getHealthLabel(healthStatus)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mr-auto">
                                      ~{m.avgWaitTime}s
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {m.supportedModes.map((mode) => (
                                      <Badge key={mode} variant="secondary" className="text-[8px] px-1 py-0">
                                        {mode === 'text2video' ? 'نص→فيديو' : 'صورة→فيديو'}
                                      </Badge>
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                                    ⚡ مجاني - ممكن يكون بطيء في أول استخدام
                                  </p>
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {Object.keys(filteredHFVideoModels).length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="text-sm">لا توجد نتائج مطابقة</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">فشل تحميل النماذج</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            )}

            {/* ─── Custom Models Tab (from Aggregator/Admin) ──────────── */}
            <TabsContent value="custom" className="flex-1 min-h-0 mt-0">
              <div className="p-3 space-y-1.5">
                {!customModels ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                    <Loader2 className="size-4 animate-spin ml-2" />
                    جارٍ تحميل النماذج المضافة...
                  </div>
                ) : customModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
                    <p>لا توجد نماذج مضافة بعد</p>
                    <p className="text-[10px]">يمكنك إضافة نماذج من المُجمّع في لوحة التحكم</p>
                  </div>
                ) : (
                  <>
                    {/* Chat Models */}
                    {customModels.filter(m => m.category === 'chat').length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">💬 نماذج الشات</h4>
                        {customModels.filter(m => m.category === 'chat').map((m) => (
                          <motion.button
                            key={m.id}
                            onClick={() => handleSelect(`custom:chat:${m.id}`)}
                            className={cn(
                              'w-full text-right p-2.5 rounded-lg border transition-all text-xs',
                              activeModel === `custom:chat:${m.id}`
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-transparent hover:muted'
                            )}
                            whileHover={{ scale: 1.005 }}
                            whileTap={{ scale: 0.995 }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span>{m.icon || '💬'}</span>
                                <div>
                                  <span className="font-medium">{m.name}</span>
                                  <span className="text-muted-foreground block text-[10px]">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</span>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-blue-500 text-blue-600">مجاني</Badge>}
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                    {/* Image Models */}
                    {customModels.filter(m => m.category === 'image').length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">🖼️ نماذج الصور</h4>
                        {customModels.filter(m => m.category === 'image').map((m) => (
                          <motion.button
                            key={m.id}
                            onClick={() => handleSelect(`custom:image:${m.id}`)}
                            className={cn(
                              'w-full text-right p-2.5 rounded-lg border transition-all text-xs',
                              activeModel === `custom:image:${m.id}`
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-transparent hover:muted'
                            )}
                            whileHover={{ scale: 1.005 }}
                            whileTap={{ scale: 0.995 }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span>{m.icon || '🖼️'}</span>
                                <div>
                                  <span className="font-medium">{m.name}</span>
                                  <span className="text-muted-foreground block text-[10px]">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</span>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-blue-500 text-blue-600">مجاني</Badge>}
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                    {/* Video Models */}
                    {customModels.filter(m => m.category === 'video').length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">🎬 نماذج الفيديو</h4>
                        {customModels.filter(m => m.category === 'video').map((m) => (
                          <motion.button
                            key={m.id}
                            onClick={() => handleSelect(`custom:video:${m.id}`)}
                            className={cn(
                              'w-full text-right p-2.5 rounded-lg border transition-all text-xs',
                              activeModel === `custom:video:${m.id}`
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-transparent hover:muted'
                            )}
                            whileHover={{ scale: 1.005 }}
                            whileTap={{ scale: 0.995 }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span>{m.icon || '🎬'}</span>
                                <div>
                                  <span className="font-medium">{m.name}</span>
                                  <span className="text-muted-foreground block text-[10px]">{m.provider} {m.modelId ? `• ${m.modelId}` : ''}</span>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                {m.isFree && <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3 bg-blue-500 text-blue-600">مجاني</Badge>}
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Current model footer */}
          <div className="p-2 sm:p-3 border-t bg-muted shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {hfDisplay ? (
                  <>
                    <span className="text-sm font-medium">{hfDisplay.name}</span>
                    <Badge className="text-[9px] px-1.5 py-0 bg-blue-500 text-white hover:bg-blue-600">
                      {hfDisplay.prefix}
                    </Badge>
                  </>
                ) : currentModel ? (
                  <>
                    <span className="text-sm font-medium">{currentModel.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {currentModel.rank}
                    </Badge>
                    {currentModel.provider === 'groq' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-blue-600 text-white hover:bg-blue-700">
                        Groq ⚡ {currentModel.realChatModel}
                      </Badge>
                    )}
                    {currentModel.provider === 'gemini' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-blue-600 text-white hover:bg-blue-700">
                        Gemini 🔵 {currentModel.realChatModel}
                      </Badge>
                    )}
                    {currentModel.provider === 'github' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-gray-700 text-white hover:bg-gray-800">
                        GitHub 🐙 {currentModel.githubChatModel || currentModel.realChatModel}
                      </Badge>
                    )}
                    {currentModel.provider === 'pollinations' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-blue-600 text-white hover:bg-blue-700">
                        Pollinations 🌸 {currentModel.realChatModel}
                      </Badge>
                    )}
                    {currentModel.provider === 'zhipuai' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-blue-600 text-white hover:bg-blue-700">
                        ZhipuAI 🇨🇳 {currentModel.realChatModel}
                      </Badge>
                    )}
                    {currentModel.provider === 'openrouter' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-blue-600 text-white hover:bg-blue-700">
                        OpenRouter
                      </Badge>
                    )}
                    {currentModel.category === 'huggingface' && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-blue-500 text-white hover:bg-blue-600">
                        🤗 HuggingFace
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">لم يتم اختيار نموذج</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {hfDisplay
                  ? 'مجاني - ممكن بطيء'
                  : currentModel?.category === 'huggingface'
                    ? 'مجاني - ممكن بطيء'
                    : currentModel?.provider === 'groq'
                      ? 'أسرع استجابة ⚡'
                      : currentModel?.provider === 'gemini'
                        ? 'ذكاء Google 🔵'
                        : currentModel?.provider === 'github'
                          ? 'GitHub Models 🐙'
                          : currentModel?.provider === 'pollinations'
                            ? 'مجاني 🌸'
                            : currentModel?.provider === 'zhipuai'
                              ? 'ZhipuAI 🇨🇳'
                              : 'النموذج النشط'}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── HF Verification Results Dialog ────────────────────────────── */}
      <Dialog open={hfDialogOpen} onOpenChange={setHfDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <span>🤗</span>
              <span>نتائج فحص نماذج HuggingFace</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {hfReport ? (
                <span>تم فحص {hfReport.totalModels} نموذج — التوكن: {hfReport.tokenMasked}</span>
              ) : (
                'جاري الفحص...'
              )}
            </DialogDescription>
          </DialogHeader>

          {hfReport && (
            <div className="flex-1 overflow-hidden">
              {/* Summary cards */}
              <div className="p-4 grid grid-cols-4 gap-2">
                <div className="text-center p-2 rounded-lg muted">
                  <div className="text-lg font-bold text-foreground">{hfReport.totalModels}</div>
                  <div className="text-[10px] text-muted-foreground">إجمالي</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{hfReport.available}</div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-400">متاح</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{hfReport.loading}</div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-400">قيد التحميل</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-950">
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">{hfReport.failed + hfReport.rateLimited}</div>
                  <div className="text-[10px] text-red-600 dark:text-red-400">فشل / محدود</div>
                </div>
              </div>

              {/* Overall status banner */}
              <div className={cn(
                'mx-4 mb-3 p-2.5 rounded-lg text-center text-xs font-medium',
                overallStatus === 'all-good' && 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
                overallStatus === 'some-loading' && 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
                overallStatus === 'many-failed' && 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
              )}>
                {overallStatus === 'all-good' && '✅ جميع النماذج متاحة!'}
                {overallStatus === 'some-loading' && '⚠️ بعض النماذج قيد التحميل - جرب مرة أخرى بعد قليل'}
                {overallStatus === 'many-failed' && '❌ كثير من النماذج غير متاحة حاليًا'}
              </div>

              {/* Detailed results */}
              <ScrollArea className="flex-1 sm:h-[300px]">
                <div className="px-4 pb-4 space-y-1.5">
                  {hfReport.results.map((result, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-card text-xs"
                    >
                      <span className="text-sm">{getStatusIcon(result.status)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[11px] text-foreground truncate">
                          {result.modelId}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {result.category}
                          {result.error && ` — ${result.error.slice(0, 80)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[9px] px-1.5 py-0',
                            result.status === 'available' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                            result.status === 'loading' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                            result.status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                            result.status === 'rate-limited' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                          )}
                        >
                          {getStatusLabel(result.status)}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground tabular-nums w-12 text-left">
                          {result.responseTimeMs > 0 ? `${result.responseTimeMs}ms` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Footer with actions */}
          <div className="p-3 border-t bg-muted flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {hfReport?.tokenConfigured ? '🔑 التوكن مُعد' : '⚠️ لا يوجد توكن HF'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={handleHFVerify}
                disabled={hfVerifying}
              >
                {hfVerifying ? (
                  <Loader2 className="size-3 animate-spin ml-1" />
                ) : (
                  '🔄 إعادة الفحص'
                )}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="text-xs h-8"
                onClick={() => setHfDialogOpen(false)}
              >
                إغلاق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
