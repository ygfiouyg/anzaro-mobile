import type { LucideIcon } from 'lucide-react';

export interface AdminDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============ User Management Types ============
export interface AdminSession {
  id: string;
  token: string;
  device: string | null;
  ip: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  password: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  lastSeen: string;
  createdAt: string;
  _count?: { conversations: number; messages: number; sessions: number };
  sessions?: AdminSession[];
}

// ============ Overview Types ============
export interface OverviewStats {
  totalUsers: number;
  activeUsers: number;
  messagesToday: number;
  totalMessages: number;
  totalConversations: number;
  conversationsToday: number;
  pdfsGenerated: number;
  activeSessions: number;
  modelUsage: { model: string; count: number; percentage: number }[];
  recentActivity: { action: string; time: string; user: string }[];
}

export interface SystemHealth {
  api: { status: boolean; label: string };
  database: { status: boolean; label: string; responseTime?: number };
  pdfEngine: { status: boolean; label: string };
}

export interface SystemHealthItem {
  name: string;
  status: boolean;
  label: string;
  detail?: string;
  icon: LucideIcon;
}

// ============ Trace Log Types ============
export interface TraceLogEntry {
  id: string;
  timestamp: number;
  category: string;
  icon: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

// ============ HF Models Types ============
export interface HFModelData {
  id: string;
  name?: string;
  shortName?: string;
  category?: string;
  size?: string;
  type?: string;
  hfModel?: string;
  spaceName?: string;
  maxResolution?: number;
  supportedModes?: string[];
  available?: boolean;
  disabled: boolean;
  health: {
    usable: boolean;
    rateLimited: boolean;
    loading: boolean;
    unavailable: boolean;
    successCount: number;
    failCount: number;
    avgResponseMs: number;
  } | null;
}

export interface HFTestResult {
  modelId: string;
  success: boolean;
  responseTimeMs?: number;
  status: string;
  error?: string;
}

// ============ Radio Station Types ============
export interface RadioStationItem {
  id: string;
  name: string;
  streamUrl: string;
  logo: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
}

export const RADIO_CATEGORIES = [
  { value: 'islamic', label: 'إسلامي' },
  { value: 'quran', label: 'قرآن' },
  { value: 'music', label: 'موسيقى' },
  { value: 'news', label: 'أخبار' },
];
