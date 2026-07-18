'use client';

import { motion } from 'framer-motion';
import {
  FileText,
  Presentation,
  Download,
  ExternalLink,
  Clock,
  RefreshCw,
  Palette,
} from 'lucide-react';
import type { DocumentGenResult } from '@/store/chat-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DocumentReadyCardProps {
  result: DocumentGenResult;
  /** Callback when user clicks "Regenerate" */
  onRegenerate?: () => void;
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} دقيقة ${remainingSeconds > 0 ? `و ${remainingSeconds} ثانية` : ''}`;
}

function getDocTypeIcon(docType: string) {
  switch (docType) {
    case 'pptx':
      return <Presentation className="size-8 text-blue-500" />;
    case 'pdf':
      return <FileText className="size-8 text-red-500" />;
    default:
      return <FileText className="size-8 text-blue-500" />;
  }
}

function getDocTypeLabel(docType: string): string {
  switch (docType) {
    case 'pptx': return 'PowerPoint';
    case 'pdf': return 'PDF';
    case 'docx': return 'Word';
    case 'xlsx': return 'Excel';
    default: return docType.toUpperCase();
  }
}

export function DocumentReadyCard({ result, onRegenerate }: DocumentReadyCardProps) {
  const { fileUrl, fileName, docType, fileSize, driveUrl, durationMs, designStyleUsed } = result;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpen = () => {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenDrive = () => {
    if (driveUrl) {
      window.open(driveUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950 overflow-hidden"
      dir="rtl"
    >
      {/* Success header */}
      <div className="relative px-4 py-3 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2.5">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="flex items-center justify-center size-9 rounded-full bg-blue-500 text-white"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-800 dark:text-blue-200">
              تم إنشاء المستند بنجاح! ✅
            </p>
            {durationMs && durationMs > 0 && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                <Clock className="size-3" />
                {formatDuration(durationMs)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* File info */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* File icon */}
          <div className="flex items-center justify-center size-12 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800 border border-blue-200 dark:border-blue-800 flex-shrink-0">
            {getDocTypeIcon(docType)}
          </div>

          {/* File details */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate" title={fileName}>
              {fileName}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                {getDocTypeLabel(docType)}
              </span>
              {fileSize && fileSize > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {formatFileSize(fileSize)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Design style used */}
        {designStyleUsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
          >
            <Palette className="size-3.5 text-blue-500" />
            <span className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">نمط التصميم:</span>
            <span className="text-[11px] text-blue-600 dark:text-blue-400 truncate">{designStyleUsed}</span>
          </motion.div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            onClick={handleOpen}
            size="sm"
            className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <ExternalLink className="size-3.5" />
            فتح المستند
          </Button>
          <Button
            onClick={handleDownload}
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
          >
            <Download className="size-3.5" />
            تحميل
          </Button>
          {driveUrl && (
            <Button
              onClick={handleOpenDrive}
              size="sm"
              variant="outline"
              className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
              title="فتح في Google Drive"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.71 3.5L1.15 15l4.58 7.5L12.29 11 7.71 3.5zm1.14 0L19.41 3.5 12.86 15H1.72l5.13-11.5zm10.01 0L13.72 15l4.58 7.5 5.55-11.5-5-7.5z" />
              </svg>
              Drive
            </Button>
          )}
          {onRegenerate && (
            <Button
              onClick={onRegenerate}
              size="sm"
              variant="outline"
              className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
              title="إعادة إنشاء المستند"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
