'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  KeyRound,
  Smartphone,
} from 'lucide-react';

type Mode = 'login' | 'register';
type Step = 'form' | 'otp';

export function AuthScreen() {
  const {
    login,
    register,
    sendOtp,
    registerWithOtp,
    resendOtp,
    otp,
    clearOtp,
    isLoading,
  } = useAuthStore();

  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend OTP countdown
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (step === 'otp' && otp.otpSentAt) {
      const elapsed = Math.floor((Date.now() - otp.otpSentAt) / 1000);
      setCountdown(Math.max(0, 60 - elapsed));
    }
  }, [step, otp.otpSentAt]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep('form');
    clearOtp();
    setCode(['', '', '', '', '', '']);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('أهلاً بيك تاني! 🎉');
      } else {
        // Register → send OTP first, then verify
        await sendOtp(email, 'verification');
        setStep('otp');
        toast.success('بعتنا كود التحقق على بريدك الإلكتروني');
        setCountdown(60);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حصل خطأ، حاول تاني');
    }
  };

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[idx] = val;
    setCode(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((c, i) => (next[i] = c));
    setCode(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      toast.error('اكتب الكود كامل (٦ أرقام)');
      return;
    }
    try {
      await registerWithOtp(name, email, password, fullCode);
      toast.success('تم إنشاء حسابك! أهلاً بيك في Anzaro 🚀');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'الكود غلط، حاول تاني');
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await resendOtp();
      setCountdown(60);
      toast.success('بعتنا كود جديد');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إعادة الإرسال');
    }
  };

  const handleGoogle = () => {
    window.location.href = '/api/auth/google';
  };

  const handleGuest = async () => {
    // V.45: Guest login — creates a throwaway account via API (not Google OAuth)
    // Previously redirected to /api/auth/google?guest=1 which was wrong —
    // the google route doesn't handle ?guest= param, so it always did Google OAuth.
    try {
      const resp = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await resp.json();
      if (resp.ok && data.token) {
        // Set the token in auth store
        window.location.href = `/?google_login=${data.token}&google_name=${encodeURIComponent(data.user?.name || 'زائر')}`;
      } else {
        console.error('Guest login failed:', data.error);
      }
    } catch (err) {
      console.error('Guest login error:', err);
    }
  };

  const canSubmit =
    email.trim() && password.trim().length >= 6 && (mode === 'login' || name.trim().length >= 2);

  return (
    <div
      className="min-h-screen flex flex-col bg-aurora bg-grid relative overflow-hidden"
      dir="rtl"
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[28rem] h-[28rem] rounded-full bg-primary/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-[28rem] h-[28rem] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-fuchsia-500/10 blur-[100px]" />

      {/* Top brand */}
      <header className="relative z-10 pt-12 pb-4 px-6 flex flex-col items-center">
        <div className="relative w-24 h-24 mb-4 animate-ball-breathe">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 32% 28%, hsl(0 0% 100% / 35%), hsl(var(--primary)) 35%, hsl(var(--primary) / 0.7) 70%, hsl(var(--primary) / 0.5) 100%)',
              boxShadow:
                'inset 0 2px 10px hsl(0 0% 100% / 40%), inset 0 -10px 28px hsl(0 0% 0% / 45%), 0 0 50px -4px hsl(var(--primary) / 0.55)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: '16%',
              left: '22%',
              width: '32%',
              height: '24%',
              background: 'radial-gradient(ellipse, hsl(0 0% 100% / 75%), transparent 70%)',
              filter: 'blur(2px)',
            }}
          />
        </div>
        <h1 className="text-3xl font-extrabold text-gradient tracking-tight">Anzaro AI</h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          الكرة الذكية — رفيقك العربي
        </p>
      </header>

      {/* Card */}
      <main className="relative z-10 flex-1 flex items-start justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          {/* Mode tabs */}
          {step === 'form' && (
            <div className="flex p-1 mb-5 rounded-2xl bg-muted/60 backdrop-blur-sm border border-border/40">
              <button
                onClick={() => switchMode('login')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === 'login'
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                onClick={() => switchMode('register')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === 'register'
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                حساب جديد
              </button>
            </div>
          )}

          {/* Step: Form */}
          {step === 'form' && (
            <form
              onSubmit={handleSubmit}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl shadow-primary/5 space-y-4"
            >
              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    الاسم
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="اكتب اسمك"
                    autoComplete="name"
                    className="h-12 rounded-xl bg-background/60 border-border/50 text-base"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  البريد الإلكتروني
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  dir="ltr"
                  className="h-12 rounded-xl bg-background/60 border-border/50 text-base text-left"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    dir="ltr"
                    className="h-12 rounded-xl bg-background/60 border-border/50 text-base text-left pl-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'إخفاء' : 'إظهار'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'register' && password && password.length < 6 && (
                  <p className="text-xs text-amber-500">كلمة المرور لازم ٦ أحرف على الأقل</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={!canSubmit || isLoading}
                className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : mode === 'login' ? (
                  'ادخل'
                ) : (
                  'إنشاء الحساب'
                )}
              </Button>

              {/* Divider */}
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/40" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground">أو</span>
                </div>
              </div>

              {/* Google + Guest */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogle}
                  className="h-11 rounded-xl bg-background/60 border-border/50 font-semibold"
                >
                  <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
                  </svg>
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGuest}
                  className="h-11 rounded-xl bg-background/60 border-border/50 font-semibold"
                >
                  <Smartphone className="w-4 h-4 ml-1" />
                  زائر سريع
                </Button>
              </div>

              <p className="text-[11px] text-center text-muted-foreground leading-relaxed pt-1">
                باستخدامك للتطبيق، أنت بتوافق على شروط الاستخدام وسياسة الخصوصية.
                بياناتك محفوظة محلياً على جهازك.
              </p>
            </form>
          )}

          {/* Step: OTP */}
          {step === 'otp' && (
            <form
              onSubmit={handleVerify}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl shadow-primary/5 space-y-5"
            >
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  clearOtp();
                  setCode(['', '', '', '', '', '']);
                }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 rotate-180" />
                رجوع
              </button>

              <div className="text-center space-y-1.5">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <KeyRound className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-bold">تحقق من بريدك</h2>
                <p className="text-sm text-muted-foreground">
                  بعتنا كود من ٦ أرقام لـ
                </p>
                <p className="text-sm font-semibold text-foreground" dir="ltr">
                  {otp.otpEmail || email}
                </p>
              </div>

              {/* OTP boxes */}
              <div className="flex gap-2 justify-center" dir="ltr" onPaste={handleOtpPaste}>
                {code.map((c, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={c}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKey(i, e)}
                    className="w-11 h-14 text-center text-2xl font-bold rounded-xl bg-background/70 border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                ))}
              </div>

              {/* Fallback code (dev mode — email not delivered) */}
              {otp.fallbackCode && !otp.emailDelivered && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-center">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    وضع التطوير — الكود:
                  </p>
                  <p className="text-lg font-bold tracking-[0.3em] text-amber-600 dark:text-amber-400 mt-0.5" dir="ltr">
                    {otp.fallbackCode}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={code.join('').length !== 6 || isLoading}
                className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/25"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'تأكيد الكود'}
              </Button>

              <div className="text-center text-sm">
                {countdown > 0 ? (
                  <span className="text-muted-foreground">
                    إعادة الإرسال خلال <span className="font-bold text-foreground">{countdown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-primary hover:underline font-semibold"
                  >
                    إعادة إرسال الكود
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Footer hint */}
          <p className="text-center text-xs text-muted-foreground/70 mt-6">
            Anzaro AI · يعمل بالكامل على المتصفح والموبايل
          </p>
        </div>
      </main>
    </div>
  );
}
