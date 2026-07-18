'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { getModelById } from '@/lib/models';
import { HardDrive, Unplug } from 'lucide-react';

interface DriveStatus {
  connected: boolean;
  folderId: string;
  fileCount: number;
  serviceAccount: string;
  hasWriteAccess?: boolean;
  error?: string;
}

export function StatusBar() {
  const { activeModel, isStreaming, conversations, activeConversationId } =
    useChatStore();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);

  const currentModel = getModelById(activeModel);
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );
  const messageCount = activeConversation?.messages.length || 0;

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check Google Drive connection status
  useEffect(() => {
    let mounted = true;

    async function checkDriveStatus() {
      try {
        const response = await fetch('/api/ai/drive/status');
        if (response.ok && mounted) {
          const data = await response.json();
          setDriveStatus(data);
        }
      } catch {
        // Silently fail — Drive is optional
        if (mounted) {
          setDriveStatus({ connected: false, folderId: '', fileCount: 0, serviceAccount: '' });
        }
      }
    }

    checkDriveStatus();
    // Re-check every 5 minutes
    const interval = setInterval(checkDriveStatus, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Update last update time
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeConversation?.updatedAt) {
        const date = new Date(activeConversation.updatedAt);
        const now = new Date();
        const diffMins = Math.floor(
          (now.getTime() - date.getTime()) / 60000
        );
        if (diffMins < 1) {
          setLastUpdate('الآن');
        } else if (diffMins < 60) {
          setLastUpdate(`منذ ${diffMins} دقيقة`);
        } else {
          setLastUpdate(
            date.toLocaleTimeString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit',
            })
          );
        }
      }
    }, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [activeConversation?.updatedAt]);

  return (
    <div className="flex items-center justify-between px-2 sm:px-4 py-0.5 border-t border-border card text-[9px] sm:text-[10px] text-muted-foreground">
      {/* Model + status */}
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'size-2 rounded-full',
              isStreaming
                ? 'bg-blue-500 animate-pulse'
                : isOnline
                  ? 'bg-blue-500'
                  : 'bg-red-500'
            )}
          />
          <span>
            {isStreaming ? 'يبث...' : isOnline ? 'متصل' : 'غير متصل'}
          </span>
        </div>
        {currentModel && (
          <>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1">
              <span className="hidden sm:inline">{currentModel.name}</span>
              <span className="sm:hidden">{currentModel.name}</span>
            </span>
          </>
        )}
        {/* Google Drive Status */}
        {driveStatus && (
          <>
            <span className="text-border">|</span>
            <div
              className={cn(
                'flex items-center gap-1 cursor-default',
                driveStatus.connected
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-muted-foreground'
              )}
              title={
                driveStatus.connected
                  ? `Google Drive متصل — ${driveStatus.fileCount} ملف — ${driveStatus.serviceAccount}`
                  : driveStatus.error || 'Google Drive غير متصل'
              }
            >
              {driveStatus.connected ? (
                <HardDrive className="size-3" />
              ) : (
                <Unplug className="size-3" />
              )}
              <span className="hidden sm:inline">
                {driveStatus.connected
                  ? `Drive (${driveStatus.fileCount})`
                  : 'Drive'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Message count + last update */}
      <div className="flex items-center gap-2">
        {messageCount > 0 && (
          <span>
            {messageCount} رسالة
          </span>
        )}
        {lastUpdate && (
          <>
            <span className="text-border">|</span>
            <span>{lastUpdate}</span>
          </>
        )}
      </div>
    </div>
  );
}
