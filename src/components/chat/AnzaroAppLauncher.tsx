'use client';

/**
 * AnzaroAppLauncher
 * =================
 * واجهة سحب التطبيقات من GitHub + تشغيلها + مراجعة الأدمن.
 *
 * - المستخدم: يحط URL → الـ AI يولّد app كامل → يشغله على /app/xxx
 * - الأدمن: يراجع + ينشر/يرفض
 */

import { useState, useCallback, useEffect } from 'react';
import { Github, Loader2, CheckCircle2, XCircle, Clock, Smartphone, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth-store';

interface AnzaroApp {
  id: string;
  appName: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  status: string;
  repoName: string;
  repoOwner: string;
  submittedBy?: string;
  fileCount?: number;
  aiReview?: string;
  createdAt: string;
  reviewedAt?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  utility: 'أدوات',
  productivity: 'إنتاجية',
  entertainment: 'ترفيه',
  education: 'تعليم',
  tools: 'تقنية',
};

export function AnzaroAppLauncher() {
  const { token, user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [apps, setApps] = useState<AnzaroApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await fetch('/api/apps/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setApps(data.apps || []);
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleImport = async () => {
    if (!importUrl.trim() || !token) return;
    setImporting(true);
    setImportResult(null);
    try {
      const resp = await fetch('/api/apps/import-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ githubUrl: importUrl.trim() }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setImportResult(data.message || 'تم السحب ✅');
        setImportUrl('');
        fetchApps();
      } else {
        setImportResult(data.error || 'فشل السحب');
      }
    } catch (e) {
      setImportResult('فشل الاتصال');
    }
    setImporting(false);
  };

  const handleApprove = async (appId: string, action: 'approve' | 'reject') => {
    if (!token) return;
    try {
      await fetch('/api/apps/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appId, action }),
      });
      fetchApps();
    } catch {}
  };

  const statusBadge = (status: string) => {
    if (status === 'approved') return <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="size-3" /> منشور</span>;
    if (status === 'rejected') return <span className="flex items-center gap-1 text-[10px] text-red-400"><XCircle className="size-3" /> مرفوض</span>;
    return <span className="flex items-center gap-1 text-[10px] text-amber-400"><Clock className="size-3" /> قيد المراجعة</span>;
  };

  return (
    <div className="space-y-4">
      {/* ── Import Section ── */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Github className="size-5 text-zinc-300" />
          <h3 className="text-sm font-semibold text-zinc-100">سحب تطبيق من GitHub</h3>
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          حط رابط repo والـ AI هيحوله لتطبيق كامل (frontend + backend) يشتغل جوه Anzaro.
        </p>
        <div className="flex gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none"
            dir="ltr"
          />
          <Button
            onClick={handleImport}
            disabled={importing || !importUrl.trim()}
            className="h-9 px-4 bg-white text-zinc-900 hover:bg-zinc-200 text-[12px] font-medium"
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4 ml-1" />}
            {importing ? 'بيسحب...' : 'سحب'}
          </Button>
        </div>
        {importResult && (
          <p className="mt-2 text-[11px] text-zinc-400">{importResult}</p>
        )}
      </div>

      {/* ── Apps Grid ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-100">التطبيقات</h3>
          <span className="text-[10px] text-zinc-500">{apps.length} تطبيق</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-5 animate-spin text-zinc-500" />
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center p-8 text-zinc-500">
            <Smartphone className="size-6 mx-auto mb-2 opacity-50" />
            <p className="text-[12px]">لسه مفيش تطبيقات — اسحب أول واحد من GitHub!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
            {apps.map((app) => (
              <div
                key={app.id}
                className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{app.icon}</span>
                      <h4 className="text-[13px] font-medium text-zinc-100 truncate">{app.displayName}</h4>
                      {statusBadge(app.status)}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{app.description}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] text-zinc-600">{CATEGORY_LABELS[app.category] || app.category}</span>
                      <span className="text-[9px] text-zinc-600">·</span>
                      <span className="text-[9px] text-zinc-600 font-mono">{app.repoOwner}/{app.repoName}</span>
                      {app.fileCount && (
                        <span className="text-[9px] text-zinc-600">· {app.fileCount} ملفات</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  {app.status === 'approved' && (
                    <a
                      href={`/app/${app.appName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                    >
                      <ExternalLink className="size-3" />
                      فتح التطبيق
                    </a>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      {expandedApp === app.id ? '▲' : '▼'} تفاصيل
                    </button>
                  )}
                  {isAdmin && app.status === 'pending' && (
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => handleApprove(app.id, 'approve')}
                        className="size-6 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center"
                        title="نشر"
                      >
                        <CheckCircle2 className="size-3 text-emerald-400" />
                      </button>
                      <button
                        onClick={() => handleApprove(app.id, 'reject')}
                        className="size-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center"
                        title="رفض"
                      >
                        <XCircle className="size-3 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>

                {expandedApp === app.id && app.aiReview && (
                  <div className="mt-2 pt-2 border-t border-zinc-700/30">
                    <p className="text-[9px] font-bold text-amber-400 mb-1 flex items-center gap-1">
                      <ShieldCheck className="size-3" /> AI Review
                    </p>
                    <p className="text-[10px] text-zinc-400 whitespace-pre-wrap">{app.aiReview}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnzaroAppLauncher;
