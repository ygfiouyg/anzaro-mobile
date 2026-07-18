'use client';

/**
 * GitHubSkillHub
 * ===============
 * واجهة سحب المهارات من GitHub + عرضها + مراجعة الأدمن.
 *
 * - المستخدم العادي: يحط URL → يشوف المهارات المنشورة
 * - الأدمن: يراجع + ينشر/يرفض
 */

import { useState, useCallback, useEffect } from 'react';
import { Github, Loader2, CheckCircle2, XCircle, Clock, Sparkles, Search, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth-store';

interface GitHubSkill {
  id: string;
  githubUrl: string;
  repoName: string;
  repoOwner: string;
  name: string;
  description: string;
  status: string;
  submittedBy?: string;
  fileCount?: number;
  aiReview?: string;
  skillMd?: string;
  toolsNeeded?: string;
  createdAt: string;
  reviewedAt?: string | null;
}

export function GitHubSkillHub() {
  const { token, user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [skills, setSkills] = useState<GitHubSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await fetch('/api/skills', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setSkills(data.skills || []);
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const handleImport = async () => {
    if (!importUrl.trim() || !token) return;
    setImporting(true);
    setImportResult(null);
    try {
      const resp = await fetch('/api/skills/import-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ githubUrl: importUrl.trim() }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setImportResult(data.message || 'تم السحب ✅');
        setImportUrl('');
        fetchSkills(); // refresh
      } else {
        setImportResult(data.error || 'فشل السحب');
      }
    } catch (e) {
      setImportResult('فشل الاتصال');
    }
    setImporting(false);
  };

  const handleApprove = async (skillId: string, action: 'approve' | 'reject') => {
    if (!token) return;
    try {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skillId, action }),
      });
      fetchSkills();
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
          <h3 className="text-sm font-semibold text-zinc-100">سحب مهارة من GitHub</h3>
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          حط رابط أي repo والـ AI هيقرا الكود ويحوّله لمهارة. الأدمن هيراجعها قبل النشر.
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

      {/* ── Skills List ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-100">المهارات</h3>
          <span className="text-[10px] text-zinc-500">{skills.length} مهارة</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-5 animate-spin text-zinc-500" />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center p-8 text-zinc-500">
            <Sparkles className="size-6 mx-auto mb-2 opacity-50" />
            <p className="text-[12px]">لسه مفيش مهارات — اسحب أول واحدة من GitHub!</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[13px] font-medium text-zinc-100 truncate">{skill.name}</h4>
                      {statusBadge(skill.status)}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{skill.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-zinc-600 font-mono">{skill.repoOwner}/{skill.repoName}</span>
                      {skill.fileCount && (
                        <span className="text-[9px] text-zinc-600">{skill.fileCount} ملفات</span>
                      )}
                      {skill.toolsNeeded && (
                        <span className="text-[9px] text-blue-500">🛠️ {skill.toolsNeeded.split(',').slice(0, 3).join('، ')}{skill.toolsNeeded.split(',').length > 3 ? '...' : ''}</span>
                      )}
                    </div>
                  </div>
                  {/* Admin actions */}
                  {isAdmin && skill.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleApprove(skill.id, 'approve')}
                        className="size-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center"
                        title="نشر"
                      >
                        <CheckCircle2 className="size-3.5 text-emerald-400" />
                      </button>
                      <button
                        onClick={() => handleApprove(skill.id, 'reject')}
                        className="size-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center"
                        title="رفض"
                      >
                        <XCircle className="size-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expandable content */}
                {expandedSkill === skill.id && skill.skillMd && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/30">
                    {/* AI Review (admin only) */}
                    {isAdmin && skill.aiReview && (
                      <div className="mb-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <p className="text-[9px] font-bold text-amber-400 mb-1">🔍 AI Review</p>
                        <p className="text-[10px] text-zinc-400 whitespace-pre-wrap">{skill.aiReview}</p>
                      </div>
                    )}
                    {/* Skill markdown */}
                    <pre className="text-[10px] text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/50 p-2 rounded-lg max-h-60 overflow-y-auto">
                      {skill.skillMd}
                    </pre>
                  </div>
                )}

                {skill.skillMd && (
                  <button
                    onClick={() => setExpandedSkill(expandedSkill === skill.id ? null : skill.id)}
                    className="mt-1 text-[10px] text-blue-500 hover:text-blue-400"
                  >
                    {expandedSkill === skill.id ? '▲ إخفاء' : '▼ عرض التفاصيل'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GitHubSkillHub;
