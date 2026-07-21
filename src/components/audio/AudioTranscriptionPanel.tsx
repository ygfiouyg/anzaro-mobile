'use client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileAudio, Loader2, CheckCircle2, Copy, Download, Clock, Play, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';

interface TranscriptionResult {
  filename: string;
  transcript: string;
  language: string;
  duration: number;
  provider: string;
  createdAt: string;
}

function formatTimestamp(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`;
}

const CHUNK_SIZE = 7 * 1024 * 1024; // 7MB per chunk (HF proxy limit is 10MB)

export function AudioTranscriptionPanel() {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<TranscriptionResult[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [livePreview, setLivePreview] = useState(''); // V.33: live transcript preview during SSE
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);

  const addResult = useCallback((fn: string, transcript: string, lang: string, dur: number, prov: string) => {
    setResults((p) => [{
      filename: fn,
      transcript,
      language: lang || 'ar',
      duration: dur || 0,
      provider: prov || 'groq',
      createdAt: new Date().toISOString(),
    }, ...p]);
  }, []);

  /**
   * V.33: Start processing with SSE streaming.
   * Reads the SSE stream from /api/audio/process and updates UI in real-time.
   * If the stream errors/times out, falls back to DB polling.
   */
  const startProcessing = useCallback(async (rid: string, fn: string, dur: number) => {
    setProcessing(true);
    setProgress(0);
    setStatusText('جاري المعالجة (ffmpeg + Whisper)...');
    setLivePreview('');
    toast.info('بدأ التحليل... قد يستغرق عدة دقائق');

    try {
      const res = await fetch(`/api/audio/process?id=${rid}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      // If not a stream, fall back to polling
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') { gotDone = true; continue; }

          try {
            const evt = JSON.parse(payload);
            switch (evt.type) {
              case 'start':
                if (evt.resume) {
                  toast.info(`استئناف من القطعة ${evt.startSegment + 1}...`);
                  setStatusText(`استئناف من القطعة ${evt.startSegment + 1}...`);
                }
                break;
              case 'heartbeat':
                setStatusText('تحضير ffmpeg...');
                break;
              case 'progress':
                setProgress(evt.progress || 0);
                setStatusText(`تحليل القطعة ${evt.current} من ${evt.total}...`);
                if (evt.fullLength > 0) {
                  setLivePreview(`${evt.fullLength} حرف تمت معالجتها...`);
                }
                break;
              case 'done':
                setProcessing(false);
                setProgress(100);
                setStatusText('');
                setLivePreview('');
                addResult(fn, evt.transcript, evt.language, dur || evt.duration || 0, evt.provider);
                toast.success(`تم تحليل الصوت! (${evt.totalSegments} قطعة)`);
                gotDone = true;
                break;
              case 'error':
                setProcessing(false);
                setStatusText('');
                setLivePreview('');
                // If we have partial transcript in DB, try to fetch it
                if (evt.error.includes('timeout') || evt.error.includes('Timeout') || evt.error.includes('duration')) {
                  toast.error('انتهت المهلة — جاري استرجاع النص الجزئي...');
                  pollPartialTranscript(rid, fn, dur);
                } else {
                  toast.error(`فشل: ${evt.error}`);
                }
                break;
            }
          } catch { /* ignore parse errors */ }
        }
      }

      if (!gotDone && processing) {
        // Stream ended without done event — try polling for partial results
        pollPartialTranscript(rid, fn, dur);
      }
    } catch (err) {
      // Network error or stream broken — fall back to DB polling
      console.error('[Audio] Process stream error:', err);
      pollPartialTranscript(rid, fn, dur);
    }
  }, [token, processing, addResult]);

  /**
   * V.33: Poll the status endpoint for partial/final transcript.
   * Used as a fallback when the SSE stream breaks.
   */
  const pollPartialTranscript = useCallback(async (rid: string, fn: string, dur: number) => {
    setProcessing(true);
    setStatusText('جاري استرجاع النتائج...');
    for (let a = 0; a < 120; a++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/audio/status?id=${rid}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) continue;
        const data = await res.json();

        if (data.status === 'completed' && data.transcript) {
          setProcessing(false);
          setProgress(100);
          setStatusText('');
          setLivePreview('');
          addResult(fn, data.transcript, data.language || 'ar', dur || data.duration || 0, data.provider || 'groq');
          toast.success('تم تحليل الصوت!');
          return;
        }
        if (data.status === 'failed') {
          // V.33: Even if failed, check if there's a partial transcript
          if (data.transcript && data.transcript.length > 50) {
            setProcessing(false);
            setProgress(100);
            setStatusText('');
            setLivePreview('');
            addResult(fn, data.transcript + '\n\n[تحليل جزئي — انقطع قبل الاكتمال]', data.language || 'ar', dur || data.duration || 0, 'partial');
            toast.warning('تم استرجاع نص جزئي');
            return;
          }
          setProcessing(false);
          setStatusText('');
          toast.error(`فشل: ${data.errorMessage || 'خطأ'}`);
          return;
        }
        if (data.status === 'not_found') {
          setProcessing(false);
          setStatusText('');
          toast.error('انتهت الجلسة');
          return;
        }
        // Still processing — update progress
        setProgress(data.progress || 0);
        setStatusText(`تحليل القطعة ${data.processedChunks || 0} من ${data.chunksCount || '?'}...`);
      } catch {}
    }
    setProcessing(false);
    toast.error('انتهت المهلة');
  }, [token, addResult]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExts = ['mp3', 'wav', 'm4a', 'mp4', 'ogg', 'aac', 'webm', 'flac', 'opus', 'wma'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!validExts.includes(ext || '')) { toast.error('نوع غير مدعوم'); return; }
    if (file.size > 500 * 1024 * 1024) { toast.error('حجم كبير (الحد 500 ميجا)'); return; }

    setUploading(true);
    setProgress(0);
    setStatusText('');
    setLivePreview('');
    const mimeType = file.type || `audio/${ext}`;
    let rid: string | null = null;

    if (file.size < 9 * 1024 * 1024) {
      // ── Small file: single upload ──
      toast.info(`جاري رفع "${file.name}"...`);
      try {
        const fd = new FormData();
        fd.append('audio', file);
        const res = await fetch('/api/audio/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل الرفع');
        if (data.id) { rid = data.id; }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'فشل الرفع');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
      // ── Large file: chunked upload (7MB per chunk) ──
      const cc = Math.ceil(file.size / CHUNK_SIZE);
      const uid = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      toast.info(`ملف كبير — هرفعه على ${cc} قطعة...`);

      for (let i = 0; i < cc; i++) {
        const s = i * CHUNK_SIZE;
        const end = Math.min(s + CHUNK_SIZE, file.size);
        const ch = file.slice(s, end);
        setProgress(Math.round((i / cc) * 100));
        setStatusText(`رفع القطعة ${i + 1} من ${cc}...`);

        try {
          const fd = new FormData();
          fd.append('audio', ch);
          fd.append('chunkIndex', String(i));
          fd.append('totalChunks', String(cc));
          fd.append('uploadId', uid);
          fd.append('filename', file.name);
          fd.append('mimeType', mimeType);
          const res = await fetch('/api/audio/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json();
          if (!res.ok && !data.status) throw new Error(data.error || `فشل القطعة ${i + 1}`);
          if (data.id) { rid = data.id; break; } // last chunk returns record ID
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل الرفع');
          setUploading(false);
          setProgress(0);
          setStatusText('');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }
      setUploading(false);
    }

    if (rid) {
      setPendingId(rid);
      setPendingName(file.name);
      setProgress(0);
      setStatusText('تم الرفع! اضغط "بدء التحليل"');
      toast.success('تم الرفع! اضغط "بدء التحليل"');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full" dir="rtl">
      <div className="p-4 border-b border-border/40">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileAudio className="w-5 h-5 text-primary" />
          تحليل الريكوردات الصوتية
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Whisper (مجاني، 99 لغة) — معالجة بث مباشر
        </p>
      </div>

      <div className="p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm,.flac,.opus"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || processing}
          className="w-full p-8 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center gap-3 disabled:opacity-50"
        >
          {uploading || processing ? (
            <>
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <span className="text-sm font-medium">
                {progress > 0 ? `${progress}%` : 'جاري الرفع...'}
              </span>
              {statusText && (
                <span className="text-xs text-muted-foreground">{statusText}</span>
              )}
              {progress > 0 && (
                <div className="w-full max-w-xs h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {livePreview && (
                <span className="text-xs text-primary/70 font-mono">{livePreview}</span>
              )}
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-semibold">اضغط لرفع ملف صوتي</p>
                <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A — حد 500 ميجا</p>
              </div>
            </>
          )}
        </button>

        {pendingId && !processing && !uploading && (
          <button
            onClick={() => startProcessing(pendingId, pendingName, 0)}
            className="w-full mt-3 py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
          >
            <Play className="w-5 h-5" />
            بدء التحليل
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-thin max-h-[calc(100vh-300px)]">
        <AnimatePresence>
          {results.map((r, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl border border-border/50 bg-card/60 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {r.provider === 'partial' ? (
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.filename}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      {r.duration > 0 ? formatTimestamp(r.duration) : '?'}
                      {r.language && ` • ${r.language === 'ar' ? 'عربي' : r.language}`}
                      {' • '}
                      <span className={r.provider === 'partial' ? 'text-amber-500' : ''}>
                        {r.provider === 'partial' ? 'جزئي' : r.provider}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(r.transcript);
                      toast.success('تم النسخ');
                    }}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                    title="نسخ"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      const b = new Blob([r.transcript], { type: 'text/plain;charset=utf-8' });
                      const u = URL.createObjectURL(b);
                      const a = document.createElement('a');
                      a.href = u;
                      a.download = `${r.filename}_transcript.txt`;
                      a.click();
                      URL.revokeObjectURL(u);
                      toast.success('تم التحميل');
                    }}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                    title="تحميل"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg bg-muted/30 p-3 scrollbar-thin">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.transcript}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {results.length === 0 && !uploading && !processing && progress === 0 && !pendingId && (
          <div className="text-center py-8 text-muted-foreground">
            <FileAudio className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm">لا توجد تحليلات</p>
            <p className="text-xs">ارفع ملف صوتي للبدء</p>
          </div>
        )}
      </div>
    </div>
  );
}
