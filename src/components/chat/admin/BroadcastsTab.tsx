'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Trash2,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';

interface BroadcastsTabProps {
  token: string | null;
}

function BroadcastsTab({ token }: BroadcastsTabProps) {
  const [message, setMessage] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [history, setHistory] = useState<Array<{
    id: string;
    title: string | null;
    audioUrl: string;
    createdAt: string;
    playedCount: number;
  }>>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/broadcast', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.broadcasts) setHistory(data.broadcasts);
      })
      .catch(() => {});
  }, [token]);

  // Voice broadcast (original)
  const handleSend = async () => {
    if (!message.trim() || !token) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم إرسال البث الصوتي بنجاح');
      setMessage('');
      if (data.broadcast) {
        setHistory((h) => [data.broadcast, ...h]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في الإرسال');
    } finally {
      setSending(false);
    }
  };

  // Text message to all users (creates a VoiceBroadcast record with empty audioUrl)
  const handleSendBroadcastMessage = async () => {
    if (!broadcastMessage.trim() || !token) return;
    setSendingBroadcast(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: broadcastMessage, type: 'text' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم إرسال الرسالة لجميع المستخدمين بنجاح');
      setBroadcastMessage('');
      if (data.broadcast) {
        setHistory((h) => [data.broadcast, ...h]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في إرسال الرسالة');
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Delete a broadcast
  const handleDeleteBroadcast = async (broadcastId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/broadcast?id=${broadcastId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success('تم حذف الرسالة بنجاح');
      setHistory((h) => h.filter((b) => b.id !== broadcastId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في حذف الرسالة');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Message All Users Section */}
      <Card className="border-blue-500 bg-blue-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Megaphone className="size-4 text-blue-500" />
            رسالة لجميع المستخدمين
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            ستظهر هذه الرسالة كشريط ثابت أعلى شاشة جميع المستخدمين حتى يتم حذفها.
          </p>
          <Textarea
            placeholder="اكتب رسالة جماعية لجميع المستخدمين..."
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            rows={3}
          />
          <Button
            onClick={handleSendBroadcastMessage}
            disabled={sendingBroadcast || !broadcastMessage.trim()}
            className="w-full bg-gradient-to-l from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500"
          >
            {sendingBroadcast ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2" />
            ) : (
              <Send className="size-4 ml-2" />
            )}
            {sendingBroadcast ? 'جاري الإرسال...' : 'إرسال لجميع المستخدمين'}
          </Button>
        </CardContent>
      </Card>

      {/* Voice Broadcast Section */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Send className="size-4 text-blue-500" />
            بث صوتي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="اكتب نص البث الصوتي..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <Button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="w-full bg-gradient-to-l from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500"
          >
            {sending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2" />
            ) : (
              <Send className="size-4 ml-2" />
            )}
            {sending ? 'جاري الإرسال...' : 'بث صوتي'}
          </Button>
        </CardContent>
      </Card>

      {/* Broadcast History */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">سجل الرسائل والبث</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">لا توجد رسائل سابقة</p>
            ) : (
              <div className="space-y-2">
                {history.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-2 rounded-lg muted">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {b.audioUrl ? (
                          <Badge variant="outline" className="text-[9px] px-1 text-blue-500 border-blue-500">صوتي</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 text-blue-500 border-blue-500">نصي</Badge>
                        )}
                        <p className="text-sm truncate">{b.title || 'رسالة بدون عنوان'}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(b.createdAt).toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{b.playedCount} تشغيل</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteBroadcast(b.id)}
                        title="حذف"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default BroadcastsTab;
