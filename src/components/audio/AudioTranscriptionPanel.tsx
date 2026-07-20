'use client';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileAudio, Loader2, CheckCircle2, Copy, Download, Clock } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';

interface TranscriptionResult { filename: string; transcript: string; language: string; duration: number; createdAt: string; }
function formatTimestamp(s: number): string { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60); return h>0?`${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`:`${m}:${sec.toString().padStart(2,'0')}`; }
const CHUNK_SIZE = 7 * 1024 * 1024;

export function AudioTranscriptionPanel() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<TranscriptionResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);

  const pollStatus = async (recordId: string, filename: string, duration: number) => {
    for (let a = 0; a < 120; a++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/audio/status?id=${recordId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === 'completed' && data.transcript) {
          setProgress(100); setStatusText('');
          setResults((p) => [{ filename, transcript: data.transcript, language: data.language || 'ar', duration: duration || data.duration || 0, createdAt: new Date().toISOString() }, ...p]);
          toast.success('تم تحليل الصوت!'); return;
        }
        if (data.status === 'failed') { setStatusText(''); toast.error(`فشل: ${data.errorMessage || 'خطأ'}`); return; }
        setProgress(data.progress || 0);
        setStatusText(`تحليل القطعة ${data.processedChunks || 0} من ${data.chunksCount || '?'}...`);
      } catch {}
    }
    toast.error('انتهت المهلة');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const validExts = ['mp3','wav','m4a','mp4','ogg','aac','webm','flac','opus','wma'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!validExts.includes(ext || '')) { toast.error('نوع غير مدعوم'); return; }
    if (file.size > 500 * 1024 * 1024) { toast.error('حجم كبير'); return; }
    setUploading(true); setProgress(0); setStatusText('');
    const mimeType = file.type || `audio/${ext}`;
    if (file.size < 9 * 1024 * 1024) {
      toast.info(`جاري رفع "${file.name}"...`);
      try {
        const fd = new FormData(); fd.append('audio', file);
        const res = await fetch('/api/audio/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || 'فشل');
        if (data.status === 'processing' && data.id) { toast.info('جاري المعالجة...'); setStatusText('جاري المعالجة...'); pollStatus(data.id, file.name, data.duration || 0); }
      } catch (err) { toast.error(err instanceof Error ? err.message : 'فشل'); }
      finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
      return;
    }
    const cc = Math.ceil(file.size / CHUNK_SIZE);
    const uid = `audio-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    toast.info(`ملف كبير — هرفعه على ${cc} قطعة...`);
    for (let i = 0; i < cc; i++) {
      const s = i * CHUNK_SIZE; const end = Math.min(s + CHUNK_SIZE, file.size); const ch = file.slice(s, end);
      setProgress(Math.round((i / cc) * 50)); setStatusText(`رفع القطعة ${i + 1} من ${cc}...`);
      try {
        const fd = new FormData(); fd.append('audio', ch);
        fd.append('chunkIndex', String(i)); fd.append('totalChunks', String(cc));
        fd.append('uploadId', uid); fd.append('filename', file.name); fd.append('mimeType', mimeType);
        const res = await fetch('/api/audio/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        const data = await res.json();
        if (!res.ok && !data.status) throw new Error(data.error || `فشل القطعة ${i + 1}`);
        if (i === cc - 1 && data.id) {
          setUploading(false); setProgress(50); setStatusText('جاري المعالجة...');
          toast.info('تم الرفع! جاري المعالجة...'); pollStatus(data.id, file.name, data.duration || 0);
          if (fileInputRef.current) fileInputRef.current.value = ''; return;
        }
      } catch (err) { toast.error(err instanceof Error ? err.message : 'فشل'); setUploading(false); setProgress(0); setStatusText(''); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    }
  };

  return (
    <div className="flex flex-col h-full" dir="rtl">
      <div className="p-4 border-b border-border/40">
        <h2 className="text-lg font-bold flex items-center gap-2"><FileAudio className="w-5 h-5 text-primary" />تحليل الريكوردات الصوتية</h2>
        <p className="text-xs text-muted-foreground mt-1">تنقية + Whisper (مجاني، 99 لغة) — معالجة في الخلفية</p>
      </div>
      <div className="p-4">
        <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm,.flac,.opus" onChange={handleFileSelect} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading || progress > 0} className="w-full p-8 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center gap-3 disabled:opacity-50">
          {uploading || progress > 0 ? (
            <><Loader2 className="w-10 h-10 text-primary animate-spin" /><span className="text-sm font-medium">{progress > 0 ? `${progress}%` : 'جاري الرفع...'}</span>{statusText && <span className="text-xs text-muted-foreground">{statusText}</span>}{progress > 0 && <div className="w-full max-w-xs h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} /></div>}</>
          ) : (
            <><Upload className="w-10 h-10 text-muted-foreground" /><div className="text-center"><p className="text-sm font-semibold">اضغط لرفع ملف صوتي</p><p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A — حد 500 ميجا</p></div></>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-thin">
        <AnimatePresence>
          {results.map((r, idx) => (
            <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border/50 bg-card/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="min-w-0"><p className="text-sm font-semibold truncate">{r.filename}</p><p className="text-xs text-muted-foreground flex items-center gap-2"><Clock className="w-3 h-3" />{r.duration > 0 ? formatTimestamp(r.duration) : '?'}{r.language && ` • ${r.language === 'ar' ? 'عربي' : r.language}`}</p></div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { navigator.clipboard.writeText(r.transcript); toast.success('تم النسخ'); }} className="p-1.5 rounded-lg hover:bg-accent"><Copy className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { const b=new Blob([r.transcript],{type:'text/plain'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${r.filename}_transcript.txt`; a.click(); URL.revokeObjectURL(u); toast.success('تم التحميل'); }} className="p-1.5 rounded-lg hover:bg-accent"><Download className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg bg-muted/30 p-3 scrollbar-thin"><p className="text-sm leading-relaxed whitespace-pre-wrap">{r.transcript}</p></div>
            </motion.div>
          ))}
        </AnimatePresence>
        {results.length === 0 && !uploading && progress === 0 && (<div className="text-center py-8 text-muted-foreground"><FileAudio className="w-12 h-12 mx-auto mb-2 opacity-20" /><p className="text-sm">لا توجد تحليلات</p><p className="text-xs">ارفع ملف صوتي للبدء</p></div>)}
      </div>
    </div>
  );
}
