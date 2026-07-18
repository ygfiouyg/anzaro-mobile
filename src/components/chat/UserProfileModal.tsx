'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Edit3, MessageSquare, FileText, Image as ImageIcon, Flame } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';

interface UserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Rank display based on streak
function getRankInfo(streak: number): { title: string; icon: string; color: string } {
  if (streak >= 100) return { title: 'أسطورة', icon: '👑', color: 'text-blue-500' };
  if (streak >= 50) return { title: 'خبير', icon: '💎', color: 'text-blue-500' };
  if (streak >= 20) return { title: 'محترف', icon: '⭐', color: 'text-blue-500' };
  if (streak >= 10) return { title: 'متقدم', icon: '🌟', color: 'text-blue-500' };
  if (streak >= 5) return { title: 'نشط', icon: '🔥', color: 'text-blue-500' };
  return { title: 'مبتدئ', icon: '🌱', color: 'text-green-500' };
}

export function UserProfileModal({ open, onOpenChange }: UserProfileModalProps) {
  const { user, token, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [stats, setStats] = useState({
    messages: 0,
    conversations: 0,
    pdfs: 0,
    images: 0,
  });

  // Sync editName from user whenever the modal is rendered with a user
  const userName = user?.name || '';
  useEffect(() => {
    setEditName(userName);
  }, [userName]);

  // Fetch stats when dialog opens
  const fetchStats = useCallback(() => {
    if (token) {
      fetch('/api/user/stats', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setStats({
            messages: data.messages || 0,
            conversations: data.conversations || 0,
            pdfs: data.pdfs || 0,
            images: data.images || 0,
          });
        })
        .catch(() => {
          // API unavailable — keep default zeros (no silent failure)
          console.warn('[Profile] Failed to fetch stats — using defaults');
        });
    }
  }, [token]);

  useEffect(() => {
    if (open) fetchStats();
  }, [open, fetchStats]);

  const handleSaveName = async () => {
    if (!editName.trim()) {
      toast.error('يرجى إدخال اسم');
      return;
    }
    updateUser({ name: editName.trim() });
    setIsEditing(false);
    toast.success('تم تحديث الاسم');
  };

  if (!user) return null;

  const rank = getRankInfo(user.streak);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>الملف الشخصي</DialogTitle>
          <DialogDescription>معلوماتك وإحصائياتك على Anzaro AI</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Avatar & Name */}
          <div className="flex items-center gap-4">
            <Avatar className="size-16 border-2 border-blue-500">
              <AvatarImage src={user.avatar || undefined} alt={user.name || 'المستخدم'} />
              <AvatarFallback className="bg-blue-600 dark:bg-blue-500 text-white dark:text-black text-xl">
                {user.name ? user.name.slice(0, 2) : '👤'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-sm"
                    dir="auto"
                  />
                  <Button size="sm" onClick={handleSaveName} className="bg-blue-600 dark:bg-blue-500 text-white dark:text-black h-8">
                    حفظ
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-8">
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold">{user.name}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit3 className="size-3.5" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px]">
                  {user.role === 'admin' ? '🛡️ مدير' : '👤 مستخدم'}
                </Badge>
                {user.isVerified && (
                  <Badge variant="secondary" className="text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                    ✓ موثق
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Streak & Rank */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-l from-blue-50 to-transparent dark:from-blue-950 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <Flame className="size-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">سلسلة النشاط</p>
                <p className="text-sm font-bold">{user.streak} يوم</p>
              </div>
            </div>
            <div className="text-center">
              <span className="text-2xl">{rank.icon}</span>
              <p className={`text-xs font-semibold ${rank.color}`}>{rank.title}</p>
            </div>
          </div>

          <Separator />

          {/* Statistics */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">الإحصائيات</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg muted text-center">
                <MessageSquare className="size-4 mx-auto mb-1 text-blue-500" />
                <p className="text-lg font-bold">{stats.messages}</p>
                <p className="text-[10px] text-muted-foreground">رسالة</p>
              </div>
              <div className="p-3 rounded-lg muted text-center">
                <MessageSquare className="size-4 mx-auto mb-1 text-blue-500" />
                <p className="text-lg font-bold">{stats.conversations}</p>
                <p className="text-[10px] text-muted-foreground">محادثة</p>
              </div>
              <div className="p-3 rounded-lg muted text-center">
                <FileText className="size-4 mx-auto mb-1 text-red-500" />
                <p className="text-lg font-bold">{stats.pdfs}</p>
                <p className="text-[10px] text-muted-foreground">PDF</p>
              </div>
              <div className="p-3 rounded-lg muted text-center">
                <ImageIcon className="size-4 mx-auto mb-1 text-blue-500" />
                <p className="text-lg font-bold">{stats.images}</p>
                <p className="text-[10px] text-muted-foreground">صورة</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Member since */}
          <p className="text-[10px] text-muted-foreground text-center">
            عضو منذ {new Date(user.createdAt).toLocaleDateString('ar-EG', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
