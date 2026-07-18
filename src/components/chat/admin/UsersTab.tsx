'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  Shield,
  Eye,
  EyeOff,
  Lock,
  Search,
  Ban,
  Trash2,
  Crown,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  MessageCircle,
  MessageSquare,
  Activity,
  ChevronLeft,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUser } from './types';

interface UsersTabProps {
  token: string | null;
}

function UsersTab({ token }: UsersTabProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // View Conversations dialog state
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingUserName, setViewingUserName] = useState<string>('');
  const [conversations, setConversations] = useState<Array<{
    id: string;
    title: string | null;
    model: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      content: string;
      role: string;
      model: string | null;
      emotion: string | null;
      createdAt: string;
    }>;
  }>>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null);

  // Change Password dialog state
  const [changingPasswordUserId, setChangingPasswordUserId] = useState<string | null>(null);
  const [changingPasswordUserName, setChangingPasswordUserName] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  // Verify Password state
  const [verifyPasswordValue, setVerifyPasswordValue] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchUsers = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/users?search=${encodeURIComponent(search)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.users) setUsers(data.users);
      })
      .catch(() => toast.error('خطأ في تحميل المستخدمين'))
      .finally(() => setLoading(false));
  }, [token, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAction = async (userId: string, action: 'block' | 'unblock' | 'promote' | 'demote' | 'delete') => {
    if (!token) return;
    const actionLabels: Record<string, string> = {
      block: 'حظر',
      unblock: 'إلغاء الحظر',
      promote: 'ترقية',
      demote: 'إلغاء الترقية',
      delete: 'حذف',
    };
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      toast.success(`تم ${actionLabels[action]} بنجاح`);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  // Fetch user conversations
  const handleViewConversations = async (userId: string, userName: string) => {
    if (!token) return;
    setViewingUserId(userId);
    setViewingUserName(userName);
    setConvLoading(true);
    setExpandedConvId(null);
    try {
      const res = await fetch(`/api/admin/user-conversations?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
      }
    } catch {
      toast.error('خطأ في تحميل المحادثات');
    } finally {
      setConvLoading(false);
    }
  };

  // Open change password dialog
  const openChangePassword = (userId: string, userName: string) => {
    setChangingPasswordUserId(userId);
    setChangingPasswordUserName(userName);
    setNewPassword('');
    setConfirmNewPassword('');
    setShowNewPassword(false);
    setPasswordChanged(false);
    setVerifyPasswordValue('');
    setVerifyResult(null);
  };

  // Handle change password
  const handleChangePassword = async () => {
    if (!token || !changingPasswordUserId) return;
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('كلمة المرور غير متطابقة');
      return;
    }
    try {
      setChangingPassword(true);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: changingPasswordUserId,
          action: 'change-password',
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      setPasswordChanged(true);
      toast.success('تم تغيير كلمة المرور بنجاح');
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setChangingPassword(false);
    }
  };

  // Handle verify password
  const handleVerifyPassword = async () => {
    if (!token || !changingPasswordUserId || !verifyPasswordValue) return;
    try {
      setVerifying(true);
      setVerifyResult(null);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: changingPasswordUserId,
          action: 'verify-password',
          newPassword: verifyPasswordValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      setVerifyResult({ valid: data.valid, message: data.message });
    } catch (err) {
      setVerifyResult({ valid: false, message: err instanceof Error ? err.message : 'حدث خطأ' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="بحث عن مستخدم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Button
          variant={showPasswords ? 'default' : 'outline'}
          size="icon"
          onClick={() => setShowPasswords(!showPasswords)}
          title={showPasswords ? 'إخفاء كلمات المرور' : 'إظهار كلمات المرور'}
          className={showPasswords ? 'bg-blue-500 hover:bg-blue-600' : ''}
        >
          {showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={fetchUsers} title="تحديث">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <ScrollArea className="h-[450px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">لا يوجد مستخدمين</div>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <Card key={u.id} className="border-border">
                <CardContent className="p-4">
                  {/* User Header Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${u.role === 'admin' ? 'bg-blue-500' : 'muted'}`}>
                        {u.role === 'admin' ? (
                          <Crown className="size-4 text-blue-500" />
                        ) : (
                          <Users className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{u.name || '—'}</span>
                          <Badge
                            variant={u.role === 'admin' ? 'default' : 'secondary'}
                            className={u.role === 'admin' ? 'bg-blue-500 text-blue-600 dark:text-blue-400 text-[9px]' : 'text-[9px]'}
                          >
                            {u.role === 'admin' ? 'مدير' : 'مستخدم'}
                          </Badge>
                          <Badge variant={u.isActive ? 'default' : 'destructive'} className="text-[9px]">
                            {u.isActive ? 'نشط' : 'محظور'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground" dir="ltr">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                        title="تفاصيل"
                      >
                        {expandedUserId === u.id ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-blue-500 hover:text-blue-600"
                        onClick={() => handleViewConversations(u.id, u.name || u.email)}
                        title="محادثات"
                      >
                        <MessageCircle className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-blue-500 hover:text-blue-600"
                        onClick={() => openChangePassword(u.id, u.name || u.email)}
                        title="تغيير كلمة المرور"
                      >
                        <KeyRound className="size-3" />
                      </Button>
                      {u.isActive ? (
                        <Button variant="ghost" size="icon" className="size-7 text-blue-500" onClick={() => handleAction(u.id, 'block')} title="حظر">
                          <Ban className="size-3" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="size-7 text-blue-500" onClick={() => handleAction(u.id, 'unblock')} title="إلغاء الحظر">
                          <CheckCircle className="size-3" />
                        </Button>
                      )}
                      {u.role !== 'admin' ? (
                        <Button variant="ghost" size="icon" className="size-7 text-blue-500" onClick={() => handleAction(u.id, 'promote')} title="ترقية">
                          <Crown className="size-3" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => handleAction(u.id, 'demote')} title="إلغاء ترقية">
                          <ChevronLeft className="size-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => handleAction(u.id, 'delete')} title="حذف">
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedUserId === u.id && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      {/* Password */}
                      <div className="flex items-center gap-2">
                        <Lock className="size-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground flex-shrink-0">كلمة المرور:</span>
                        <code className="text-[11px] muted px-2 py-0.5 rounded font-mono break-all" dir="ltr">
                          {showPasswords ? u.password : '••••••••••••••••'}
                        </code>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>آخر ظهور: {new Date(u.lastSeen).toLocaleDateString('ar-EG')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="size-3" />
                          <span>{u._count?.conversations ?? 0} محادثة</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          <span>{u._count?.messages ?? 0} رسالة</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Activity className="size-3" />
                          <span>{u._count?.sessions ?? 0} جلسة</span>
                        </div>
                      </div>

                      {/* Sessions */}
                      {u.sessions && u.sessions.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Shield className="size-3 text-blue-500" />
                            <span>الجلسات ({u.sessions.length})</span>
                          </div>
                          <div className="space-y-1">
                            {u.sessions.map((s) => {
                              const isExpired = new Date(s.expiresAt) < new Date();
                              return (
                                <div key={s.id} className="flex items-center justify-between text-[10px] bg-muted rounded px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={isExpired ? 'destructive' : 'default'} className="text-[8px] px-1 py-0">
                                      {isExpired ? 'منتهية' : 'نشطة'}
                                    </Badge>
                                    <code className="text-[9px] font-mono text-muted-foreground truncate max-w-[140px]" dir="ltr">
                                      {s.token ? `${s.token.slice(0, 20)}...` : '(no token)'}
                                    </code>
                                    {s.device && <span className="text-muted-foreground">({s.device})</span>}
                                    {s.ip && <span className="text-muted-foreground" dir="ltr">IP: {s.ip}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <span>بدأت: {new Date(s.createdAt).toLocaleDateString('ar-EG')}</span>
                                    <span>تنتهي: {new Date(s.expiresAt).toLocaleDateString('ar-EG')}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Registration date */}
                      <div className="text-[10px] text-muted-foreground">
                        تاريخ التسجيل: {new Date(u.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* View Conversations Dialog */}
      <Dialog open={!!viewingUserId} onOpenChange={(open) => { if (!open) setViewingUserId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base" dir="rtl">
              <MessageCircle className="size-5 text-blue-500" />
              محادثات: {viewingUserName}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 overflow-y-auto max-h-[60vh]" dir="rtl">
            {convLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <MessageCircle className="size-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">لا توجد محادثات لهذا المستخدم</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conversations.map((conv) => (
                  <Card key={conv.id} className="border-border">
                    <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedConvId(expandedConvId === conv.id ? null : conv.id)}>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium truncate max-w-[70%]">
                          {conv.title || 'محادثة بدون عنوان'}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1">{conv.model}</Badge>
                          <Badge variant="secondary" className="text-[10px] px-1">{conv.messages.length} رسالة</Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(conv.updatedAt).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    {expandedConvId === conv.id && (
                      <CardContent className="pt-0">
                        <ScrollArea className="max-h-96">
                          <div className="space-y-2">
                            {conv.messages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`p-2 rounded-lg text-xs ${
                                  msg.role === 'user'
                                    ? 'bg-blue-500 mr-4'
                                    : 'muted ml-4'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Badge
                                    variant={msg.role === 'user' ? 'default' : 'secondary'}
                                    className="text-[9px] px-1 py-0"
                                  >
                                    {msg.role === 'user' ? 'مستخدم' : 'مساعد'}
                                  </Badge>
                                  {msg.model && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">{msg.model}</Badge>
                                  )}
                                  {msg.emotion && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">{msg.emotion}</Badge>
                                  )}
                                  <span className="text-[9px] text-muted-foreground">
                                    {new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words leading-relaxed line-clamp-6">
                                  {msg.content.slice(0, 500)}
                                  {msg.content.length > 500 ? '...' : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!changingPasswordUserId} onOpenChange={(open) => { if (!open) setChangingPasswordUserId(null); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base" dir="rtl">
              <KeyRound className="size-5 text-blue-500" />
              تغيير كلمة المرور: {changingPasswordUserName}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6" dir="rtl">
            {!passwordChanged ? (
              <div className="space-y-4">
                {/* New Password */}
                <div className="space-y-2">
                  <Label className="text-sm">كلمة المرور الجديدة</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="6 أحرف على الأقل"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pr-10 pl-10"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label className="text-sm">تأكيد كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="أعد كتابة كلمة المرور"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="pr-10"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* Password Match Indicator */}
                {newPassword && confirmNewPassword && (
                  <div className={`flex items-center gap-1.5 text-xs ${newPassword === confirmNewPassword ? 'text-blue-500' : 'text-red-500'}`}>
                    {newPassword === confirmNewPassword ? (
                      <>
                        <CheckCircle className="size-3.5" />
                        <span>كلمات المرور متطابقة</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="size-3.5" />
                        <span>كلمات المرور غير متطابقة</span>
                      </>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword || newPassword.length < 6}
                  className="w-full bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>جاري التغيير...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-4 ml-1.5" />
                      <span>تغيير كلمة المرور</span>
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Success Message */}
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="p-3 rounded-full bg-blue-500">
                    <CheckCircle className="size-8 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">تم تغيير كلمة المرور بنجاح!</p>
                  <p className="text-xs text-muted-foreground">تم تسجيل خروج المستخدم من جميع الجلسات</p>
                </div>

                {/* Verify Section */}
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-blue-500" />
                    <span className="text-sm font-medium">التحقق من كلمة المرور الجديدة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="اكتب كلمة المرور للتحقق..."
                        value={verifyPasswordValue}
                        onChange={(e) => { setVerifyPasswordValue(e.target.value); setVerifyResult(null); }}
                        className="pr-9 h-9 text-sm"
                        dir="ltr"
                      />
                    </div>
                    <Button
                      onClick={handleVerifyPassword}
                      disabled={verifying || !verifyPasswordValue}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {verifying ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="size-3.5" />
                      )}
                    </Button>
                  </div>
                  {verifyResult && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${verifyResult.valid ? 'bg-blue-500 border border-blue-500' : 'bg-red-500 border border-red-500'}`}>
                      {verifyResult.valid ? (
                        <CheckCircle className="size-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="size-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className={`text-sm font-medium ${verifyResult.valid ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                        {verifyResult.message}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => setChangingPasswordUserId(null)}
                  variant="outline"
                  className="w-full"
                >
                  إغلاق
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UsersTab;
