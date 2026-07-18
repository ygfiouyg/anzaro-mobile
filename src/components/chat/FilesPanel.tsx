'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Image as ImageIcon,
  Video,
  File,
  Download,
  Trash2,
  LayoutGrid,
  List,
  FolderOpen,
  Filter,
  CloudUpload,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/store/chat-store';
import { useAuthStore } from '@/store/auth-store';

type FileFilter = 'all' | 'pdf' | 'image' | 'video' | 'document';
type ViewMode = 'grid' | 'list';

const FILE_FILTERS: { key: FileFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'الكل', icon: '📁' },
  { key: 'pdf', label: 'PDF', icon: '📄' },
  { key: 'image', label: 'صور', icon: '🖼️' },
  { key: 'video', label: 'فيديو', icon: '🎬' },
  { key: 'document', label: 'مستندات', icon: '📝' },
];

function getFileIcon(type: string) {
  if (type === 'pdf') return <FileText className="size-5 text-red-500" />;
  if (type === 'image') return <ImageIcon className="size-5 text-blue-500" />;
  if (type === 'video') return <Video className="size-5 text-blue-500" />;
  return <File className="size-5 text-blue-500" />;
}

function getFileTypeFromName(name: string): FileFilter {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return 'video';
  return 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

interface FilesPanelProps {
  onClose?: () => void;
}

export function FilesPanel({ onClose }: FilesPanelProps) {
  const { generatedFiles, removeGeneratedFile } = useChatStore();
  const { token } = useAuthStore();
  const [filter, setFilter] = useState<FileFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveUploadResult, setDriveUploadResult] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    if (filter === 'all') return generatedFiles;
    return generatedFiles.filter((f) => getFileTypeFromName(f.name) === filter);
  }, [generatedFiles, filter]);

  const handleDelete = async (fileId: string) => {
    try {
      // FIX M7: Actually delete from server (disk + DB), not just frontend state
      await fetch(`/api/chat/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (err) {
      console.error('Failed to delete file from server:', err);
    }
    // Also remove from frontend state
    removeGeneratedFile(fileId);
  };

  const handleDownload = (file: { name: string; url: string }) => {
    // Include auth token in download URL so the server-side endpoint can verify access
    const downloadUrl = token
      ? `${file.url}?download=1&token=${token}`
      : `${file.url}?download=1`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleUploadToDrive = async () => {
    setIsUploadingToDrive(true);
    setDriveUploadResult(null);

    try {
      const response = await fetch('/api/ai/drive/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: 'download-folder' }),
      });

      const data = await response.json();

      if (data.success) {
        setDriveUploadResult(`✅ ${data.message}`);
      } else {
        setDriveUploadResult(`❌ ${data.error || 'فشل الرفع'}`);
      }
    } catch (error) {
      setDriveUploadResult('❌ خطأ في الاتصال بالخادم');
    } finally {
      setIsUploadingToDrive(false);
      // Auto-hide result after 5 seconds
      setTimeout(() => setDriveUploadResult(null), 5000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background bg-gradient-to-br from-background via-background to-muted/30 border-l border-border/60 dark:border-white/10 shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40" dir="rtl">
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <FolderOpen className="size-5 text-blue-600 dark:text-blue-400" />
            ملفاتي
            {generatedFiles.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {generatedFiles.length}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUploadToDrive}
              disabled={isUploadingToDrive || generatedFiles.length === 0}
              className="size-8 text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
              aria-label="رفع على درايف"
              title="رفع كل الملفات على Google Drive"
            >
              {isUploadingToDrive ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="size-8 text-muted-foreground"
              aria-label={viewMode === 'grid' ? 'عرض قائمة' : 'عرض شبكة'}
            >
              {viewMode === 'grid' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8 text-muted-foreground sm:hidden"
                aria-label="إغلاق"
              >
                ✕
              </Button>
            )}
          </div>
        </div>

        {/* Drive Upload Result */}
        {driveUploadResult && (
          <div className="mb-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            {driveUploadResult}
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {FILE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                filter === f.key
                  ? 'bg-blue-600 dark:bg-blue-500 text-white'
                  : 'muted text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Files List */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {filteredFiles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="size-16 rounded-2xl muted flex items-center justify-center mb-4">
                <FolderOpen className="size-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">لا توجد ملفات بعد</p>
              <p className="text-xs text-muted-foreground">
                الملفات المُنشأة ستظهر هنا
              </p>
            </motion.div>
          ) : viewMode === 'list' ? (
            <AnimatePresence initial={false}>
              <div className="space-y-2">
                {filteredFiles.map((file) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-blue-500 transition-colors group"
                  >
                    <div className="flex-shrink-0 size-10 rounded-lg muted flex items-center justify-center">
                      {getFileIcon(getFileTypeFromName(file.name))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(file.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(file)}
                        className="size-8 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        aria-label="تحميل"
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.id)}
                        className="size-8 text-red-500 hover:text-red-600"
                        aria-label="حذف"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredFiles.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center p-3 rounded-xl border border-border bg-card hover:border-blue-500 transition-colors group cursor-pointer"
                  onClick={() => handleDownload(file)}
                >
                  <div className="size-12 rounded-lg muted flex items-center justify-center mb-2">
                    {getFileIcon(getFileTypeFromName(file.name))}
                  </div>
                  <p className="text-xs font-medium text-foreground truncate w-full text-center">
                    {file.name}
                  </p>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {formatFileSize(file.size)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
