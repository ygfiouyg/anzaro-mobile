'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/auth-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Brain,
  MessageSquare,
  Globe,
  BookOpen,
  Zap,
  Shield,
  Mail,
  Lock,
  User,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { IOSThemeToggle } from '@/components/ui/ios-theme-toggle';

// ========================================
// Types
// ========================================
type AuthView = 'login' | 'register' | 'otp' | 'forgot-password' | 'reset-otp' | 'reset-password';

// ========================================
// Animation Variants — iOS spring-like curves
// ========================================
const viewVariants = {
  initial: { opacity: 0, x: 30, filter: 'blur(6px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -30, filter: 'blur(6px)' },
};

const featureVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.32, 0.72, 0, 1] as const },
  }),
};

// ========================================
// Features Data
// ========================================
const features = [
  { icon: Brain, title: 'ذكاء اصطناعي متقدم', description: '36+ نموذج ذكاء اصطناعي متخصص', color: '#007AFF' },
  { icon: MessageSquare, title: 'محادثات ذكية', description: 'محادثات تفاعلية بلا حدود', color: '#5AC8FA' },
  { icon: Globe, title: 'دعم متعدد اللغات', description: 'عربي، إنجليزي، ومصري', color: '#34C759' },
  { icon: BookOpen, title: 'قاعدة معرفية واسعة', description: 'معلومات شاملة في كل المجالات', color: '#FF9500' },
  { icon: Zap, title: 'استجابة فورية', description: 'سرعة عالية في المعالجة', color: '#AF52DE' },
  { icon: Shield, title: 'خصوصية تامة', description: 'حماية بياناتك أولويتنا', color: '#FF2D55' },
];

// ========================================
// Countdown Timer Component
// ========================================
function CountdownTimer({
  seconds,
  active,
  onCanResend,
}: {
  seconds: number;
  active: boolean;
  onCanResend: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startTimeRef.current = null;
      return;
    }

    startTimeRef.current = Date.now();

    const tick = () => {
      if (!startTimeRef.current) return;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, seconds - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) {
        onCanResend();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [seconds, active, onCanResend]);

  if (!active) return null;

  return (
    <p className="text-sm text-muted-foreground">
      إعادة الإرسال بعد{' '}
      <span className="text-foreground font-medium tabular-nums">{timeLeft}</span> ثانية
    </p>
  );
}

// ========================================
// Main AuthPage Component — iOS Style
// ========================================
export default function AuthPage() {
  const {
    login,
    registerWithOtp,
    sendOtp,
    resendOtp,
    clearOtp,
    isLoading,
    otp,
  } = useAuthStore();

  // View state
  const [authView, setAuthView] = useState<AuthView>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  // OTP state
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [canResend, setCanResend] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // ========================================
  // Send OTP Handler
  // ========================================
  const handleSendOtp = useCallback(async () => {
    if (!regEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail)) {
      toast.error('صيغة البريد الإلكتروني غير صحيحة');
      return;
    }

    try {
      setOtpSending(true);
      setCanResend(false);
      const result = await sendOtp(regEmail.trim(), 'verification');

      if (result.emailDelivered) {
        toast.success('تم إرسال كود التحقق إلى بريدك الإلكتروني');
      } else if (result.fallbackCode) {
        toast.success(`كود التحقق: ${result.fallbackCode}`, { duration: 30000 });
      } else {
        toast.info('تم إنشاء كود التحقق — تأكد من إعداد خدمة البريد', { duration: 5000 });
      }

      setAuthView('otp');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'فشل إرسال كود التحقق'
      );
    } finally {
      setOtpSending(false);
    }
  }, [regEmail, sendOtp]);

  // ========================================
  // Resend OTP Handler
  // ========================================
  const handleResendOtp = useCallback(async () => {
    if (!canResend) return;

    try {
      setOtpSending(true);
      setCanResend(false);
      const result = await resendOtp();
      setOtpCode('');

      if (result.emailDelivered) {
        toast.success('تم إعادة إرسال كود التحقق');
      } else if (result.fallbackCode) {
        toast.success(`كود التحقق: ${result.fallbackCode}`, { duration: 30000 });
      } else {
        toast.info('تم إنشاء كود تحقق جديد — تأكد من إعداد خدمة البريد', { duration: 5000 });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'فشل إعادة الإرسال'
      );
    } finally {
      setOtpSending(false);
    }
  }, [canResend, resendOtp]);

  // ========================================
  // Verify OTP & Register Handler
  // ========================================
  const handleVerifyAndRegister = useCallback(async () => {
    if (otpCode.length !== 6) {
      toast.error('يرجى إدخال كود التحقق كاملاً (6 أرقام)');
      return;
    }

    try {
      setOtpLoading(true);
      await registerWithOtp(regName.trim(), regEmail.trim(), regPassword, otpCode);
      toast.success('تم إنشاء الحساب بنجاح! مرحباً بك في Anzaro AI 🎉');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'كود التحقق غير صحيح'
      );
    } finally {
      setOtpLoading(false);
    }
  }, [otpCode, regName, regEmail, regPassword, registerWithOtp]);

  // ========================================
  // Go to OTP view from register
  // ========================================
  const goToOtp = useCallback(() => {
    if (!regName.trim()) {
      toast.error('يرجى إدخال اسمك');
      return;
    }
    if (!regEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail)) {
      toast.error('صيغة البريد الإلكتروني غير صحيحة');
      return;
    }
    if (regPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      toast.error('كلمة المرور غير متطابقة');
      return;
    }

    handleSendOtp();
  }, [regName, regEmail, regPassword, regConfirmPassword, handleSendOtp]);

  // ========================================
  // Login Handler
  // ========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail)) {
      toast.error('صيغة البريد الإلكتروني غير صحيحة');
      return;
    }
    if (!loginPassword) {
      toast.error('يرجى إدخال كلمة المرور');
      return;
    }

    try {
      setLoginLoading(true);
      await login(loginEmail.trim(), loginPassword);
      toast.success('تم تسجيل الدخول بنجاح! 🎉');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const isSubmitting = isLoading || loginLoading || regLoading || otpLoading || otpSending || forgotLoading || resetLoading;

  // ========================================
  // Forgot Password — Send OTP Handler
  // ========================================
  const handleForgotSendOtp = useCallback(async () => {
    if (!forgotEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail)) {
      toast.error('صيغة البريد الإلكتروني غير صحيحة');
      return;
    }

    try {
      setForgotLoading(true);
      setCanResend(false);
      const result = await sendOtp(forgotEmail.trim(), 'reset');

      if (result.emailDelivered) {
        toast.success('تم إرسال كود التحقق إلى بريدك الإلكتروني');
      } else if (result.fallbackCode) {
        toast.success(`كود التحقق: ${result.fallbackCode}`, { duration: 30000 });
      } else {
        toast.info('تم إنشاء كود التحقق', { duration: 5000 });
      }

      setAuthView('reset-otp');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'فشل إرسال كود التحقق'
      );
    } finally {
      setForgotLoading(false);
    }
  }, [forgotEmail, sendOtp]);

  // ========================================
  // Forgot Password — Resend OTP Handler
  // ========================================
  const handleResetResendOtp = useCallback(async () => {
    if (!canResend) return;

    try {
      setOtpSending(true);
      setCanResend(false);
      const result = await resendOtp();
      setResetOtpCode('');

      if (result.emailDelivered) {
        toast.success('تم إعادة إرسال كود التحقق');
      } else if (result.fallbackCode) {
        toast.success(`كود التحقق: ${result.fallbackCode}`, { duration: 30000 });
      } else {
        toast.info('تم إنشاء كود تحقق جديد', { duration: 5000 });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'فشل إعادة الإرسال'
      );
    } finally {
      setOtpSending(false);
    }
  }, [canResend, resendOtp]);

  // ========================================
  // Forgot Password — Verify OTP & Go to Reset
  // ========================================
  const handleResetVerifyOtp = useCallback(async () => {
    if (resetOtpCode.length !== 6) {
      toast.error('يرجى إدخال كود التحقق كاملاً (6 أرقام)');
      return;
    }

    try {
      setOtpLoading(true);
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), code: resetOtpCode }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'كود التحقق غير صحيح' }));
        throw new Error(error.message || 'كود التحقق غير صحيح');
      }

      setAuthView('reset-password');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'كود التحقق غير صحيح'
      );
    } finally {
      setOtpLoading(false);
    }
  }, [resetOtpCode, forgotEmail]);

  // ========================================
  // Forgot Password — Reset Password Handler
  // ========================================
  const handleResetPassword = useCallback(async () => {
    if (resetNewPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error('كلمة المرور غير متطابقة');
      return;
    }

    try {
      setResetLoading(true);
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          newPassword: resetNewPassword,
          otpCode: resetOtpCode,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'فشل إعادة تعيين كلمة المرور' }));
        throw new Error(error.message || 'فشل إعادة تعيين كلمة المرور');
      }

      toast.success('تم إعادة تعيين كلمة المرور بنجاح! يمكنك تسجيل الدخول الآن');
      setAuthView('login');
      setLoginEmail(forgotEmail.trim());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'فشل إعادة تعيين كلمة المرور'
      );
    } finally {
      setResetLoading(false);
    }
  }, [resetNewPassword, resetConfirmPassword, forgotEmail, resetOtpCode]);

  // Helper to switch views cleanly
  const switchView = (view: AuthView) => {
    if (view !== 'otp') {
      clearOtp();
      setOtpCode('');
      setCanResend(false);
    }
    setAuthView(view);
  };

  // ========================================
  // Render — iOS Lock Screen / Apple ID Style
  // ========================================
  return (
    <div
      className="min-h-screen flex flex-col md:flex-row bg-background"
      dir="rtl"
      style={{ fontFamily: "var(--font-cairo), -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}
    >
      {/* ========================================
          Left Side — iOS-style Hero (hidden on mobile)
          Full-height gradient panel with floating feature cards
          ======================================== */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative overflow-hidden flex-col">
        {/* iOS-inspired gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)",
          }}
        />
        {/* Mesh overlay for depth */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              radial-gradient(at 20% 30%, #3b82f6 0px, #2563eb 50%),
              radial-gradient(at 80% 70%, #1d4ed8 0px, #1e40af 50%),
              radial-gradient(at 50% 100%, #1e40af 0px, #1e3a8a 50%)
            `,
          }}
        />
        {/* Subtle noise/grain texture */}
        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' /%3E%3C/svg%3E\")",
          }}
        />

        {/* Theme toggle in top-right (over gradient) */}
        <div className="absolute top-6 left-6 z-30">
          <IOSThemeToggle />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center p-8 lg:p-14 w-full text-white">
          {/* Logo + Brand */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="flex items-center justify-center w-14 h-14 rounded-[16px]"
                style={{
                  background: "rgb(59, 130, 246)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgb(255, 255, 255)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                }}
              >
                <Sparkles className="size-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
                  Anzaro AI
                </h1>
                <p className="text-blue-700 dark:text-blue-300 text-sm">ذكاء اصطناعي عربي</p>
              </div>
            </div>

            <h2 className="text-3xl lg:text-[40px] font-bold leading-tight" style={{ letterSpacing: "-0.035em", lineHeight: 1.15 }}>
              منصة الذكاء الاصطناعي
              <br />
              <span className="text-blue-600 dark:text-blue-400">العربية الأولى</span>
            </h2>
            <p className="text-blue-700 dark:text-blue-300 mt-3 text-lg leading-relaxed">
              تجربة مصممة بعناية — بأسلوب iOS — تجمع القوة والبساطة في مكان واحد
            </p>
          </motion.div>

          {/* Feature cards — iOS-style grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                custom={i}
                variants={featureVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.02, y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="flex items-start gap-3 p-4 rounded-2xl"
                style={{
                  background: "rgb(37, 99, 235)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  border: "1px solid rgb(219, 234, 254)",
                }}
              >
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center"
                  style={{ background: `${feature.color}33` }}
                >
                  <feature.icon className="size-5" style={{ color: feature.color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm leading-tight">{feature.title}</h3>
                  <p className="text-blue-600 dark:text-blue-400 text-xs mt-1 leading-snug">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom stats — iOS-style */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="flex items-center gap-4 text-blue-600 dark:text-blue-400 text-sm"
          >
            <div className="flex items-center gap-2">
              <Brain className="size-4" />
              <span className="font-semibold">36+ نموذج</span>
            </div>
            <div className="w-px h-4 bg-blue-100 dark:bg-blue-900" />
            <div className="flex items-center gap-2">
              <Globe className="size-4" />
              <span className="font-semibold">3 لغات</span>
            </div>
            <div className="w-px h-4 bg-blue-100 dark:bg-blue-900" />
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4" />
              <span className="font-semibold">∞ محادثات</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ========================================
          Right Side — iOS-style Form
          ======================================== */}
      <div className="flex-1 md:w-1/2 lg:w-[45%] flex items-center justify-center p-6 md:p-8 relative bg-background">
        {/* Mobile theme toggle */}
        <div className="md:hidden absolute top-4 left-4 z-20">
          <IOSThemeToggle compact />
        </div>

        {/* Form Container */}
        <div className="relative z-10 w-full max-w-[400px]">
          {/* Logo (mobile shows it here, desktop shows in left panel) */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-3 mb-8 md:hidden"
          >
            <div
              className="flex items-center justify-center w-12 h-12 rounded-[14px]"
              style={{
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                boxShadow: "0 4px 16px rgba(0, 122, 255, 0.3)",
              }}
            >
              <Sparkles className="size-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.03em" }}>Anzaro AI</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">ذكاء اصطناعي عربي</p>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* ========================================
                LOGIN VIEW
                ======================================== */}
            {authView === 'login' && (
              <motion.div
                key="login"
                variants={viewVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="mb-7">
                  <h2 className="text-[28px] font-bold text-foreground" style={{ letterSpacing: "-0.035em" }}>
                    مرحباً بعودتك
                  </h2>
                  <p className="text-muted-foreground mt-1 text-[15px]">
                    سجّل دخولك لمتابعة محادثاتك
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-[13px] font-medium text-muted-foreground">
                      البريد الإلكتروني
                    </Label>
                    <div className="relative">
                      <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="example@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pr-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password" className="text-[13px] font-medium text-muted-foreground">
                      كلمة المرور
                    </Label>
                    <div className="relative">
                      <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="أدخل كلمة المرور"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pr-11 pl-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showLoginPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit button — iOS Blue, large */}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[50px] rounded-[14px] text-[17px] font-semibold ios-button-primary mt-2 border-0"
                    size="lg"
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        <span>جاري تسجيل الدخول...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="size-5 ml-1.5" />
                        <span>تسجيل الدخول</span>
                      </>
                    )}
                  </Button>
                </form>

                {/* Navigation Links — iOS-style */}
                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => switchView('register')}
                    className="ios-pressable flex items-center justify-center gap-2 text-[15px] text-[hsl(var(--primary))] font-medium"
                  >
                    <UserPlus className="size-4" />
                    إنشاء حساب جديد
                  </button>
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(loginEmail); switchView('forgot-password'); }}
                    className="ios-pressable flex items-center justify-center gap-2 text-[14px] text-muted-foreground hover:text-foreground"
                  >
                    <KeyRound className="size-3.5" />
                    نسيت كلمة المرور؟
                  </button>
                </div>

                {/* Admin hint */}
                <div className="mt-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    <Shield className="inline size-3 ml-1" />
                    المشرفين يمكنهم الدخول بنفس الطريقة
                  </p>
                </div>
              </motion.div>
            )}

            {/* ========================================
                REGISTRATION VIEW
                ======================================== */}
            {authView === 'register' && (
              <motion.div
                key="register"
                variants={viewVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="mb-7">
                  <h2 className="text-[28px] font-bold text-foreground" style={{ letterSpacing: "-0.035em" }}>
                    إنشاء حساب
                  </h2>
                  <p className="text-muted-foreground mt-1 text-[15px]">
                    ابدأ رحلتك مع Anzaro AI
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); goToOtp(); }} className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name" className="text-[13px] font-medium text-muted-foreground">
                      الاسم الكامل
                    </Label>
                    <div className="relative">
                      <User className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="reg-name"
                        type="text"
                        placeholder="أدخل اسمك"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="pr-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        autoComplete="name"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email" className="text-[13px] font-medium text-muted-foreground">
                      البريد الإلكتروني
                    </Label>
                    <div className="relative">
                      <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="example@email.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="pr-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password" className="text-[13px] font-medium text-muted-foreground">
                      كلمة المرور
                    </Label>
                    <div className="relative">
                      <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="reg-password"
                        type={showRegPassword ? 'text' : 'password'}
                        placeholder="6 أحرف على الأقل"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="pr-11 pl-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showRegPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-confirm" className="text-[13px] font-medium text-muted-foreground">
                      تأكيد كلمة المرور
                    </Label>
                    <div className="relative">
                      <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="reg-confirm"
                        type={showRegPassword ? 'text' : 'password'}
                        placeholder="أعد إدخال كلمة المرور"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className="pr-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[50px] rounded-[14px] text-[17px] font-semibold ios-button-primary mt-2 border-0"
                    size="lg"
                  >
                    {otpSending ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        <span>جاري إرسال الكود...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="size-5 ml-1.5" />
                        <span>التالي — إرسال كود التحقق</span>
                      </>
                    )}
                  </Button>
                </form>

                {/* Back to login */}
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="ios-pressable flex items-center justify-center gap-2 text-[15px] text-muted-foreground hover:text-foreground mx-auto"
                  >
                    <ArrowRight className="size-3.5" />
                    <span>لديك حساب؟ تسجيل الدخول</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ========================================
                OTP VERIFICATION VIEW
                ======================================== */}
            {authView === 'otp' && (
              <motion.div
                key="otp"
                variants={viewVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="mb-7">
                  <h2 className="text-[28px] font-bold text-foreground" style={{ letterSpacing: "-0.035em" }}>
                    التحقق
                  </h2>
                  <p className="text-muted-foreground mt-1 text-[15px]">
                    أدخل الكود المُرسل إلى{' '}
                    <span className="text-foreground font-medium" dir="ltr">
                      {otp.otpEmail || regEmail}
                    </span>
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-4 py-2">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={setOtpCode}
                      dir="ltr"
                      disabled={otpLoading}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {otp.emailDelivered && (
                    <div className="flex items-center justify-center gap-2 text-sm text-[hsl(var(--chart-2))]">
                      <CheckCircle2 className="size-4" />
                      <span>تم إرسال الكود إلى بريدك الإلكتروني</span>
                    </div>
                  )}

                  {otp.fallbackCode && !otp.emailDelivered && (
                    <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-[12px] p-3">
                      <AlertCircle className="size-4 flex-shrink-0" />
                      <span>كود التحقق: <strong dir="ltr" className="text-lg">{otp.fallbackCode}</strong></span>
                    </div>
                  )}

                  <Button
                    onClick={handleVerifyAndRegister}
                    disabled={otpCode.length !== 6 || otpLoading}
                    className="w-full h-[50px] rounded-[14px] text-[17px] font-semibold ios-button-primary border-0"
                    size="lg"
                  >
                    {otpLoading ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-5 ml-1.5" />
                        <span>تحقق وإنشاء الحساب</span>
                      </>
                    )}
                  </Button>

                  <div className="flex flex-col items-center gap-3">
                    {canResend ? (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={otpSending}
                        className="ios-pressable flex items-center gap-2 text-[15px] text-[hsl(var(--primary))] font-medium"
                      >
                        {otpSending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                        إعادة إرسال الكود
                      </button>
                    ) : (
                      <CountdownTimer
                        seconds={60}
                        active={authView === 'otp'}
                        onCanResend={() => setCanResend(true)}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => switchView('register')}
                      className="ios-pressable flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground"
                    >
                      <ArrowRight className="size-3.5" />
                      <span>تعديل البيانات</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ========================================
                FORGOT PASSWORD VIEW
                ======================================== */}
            {authView === 'forgot-password' && (
              <motion.div
                key="forgot-password"
                variants={viewVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="mb-7">
                  <h2 className="text-[28px] font-bold text-foreground" style={{ letterSpacing: "-0.035em" }}>
                    نسيت كلمة المرور؟
                  </h2>
                  <p className="text-muted-foreground mt-1 text-[15px]">
                    أدخل بريدك وسنرسل كود التحقق
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleForgotSendOtp(); }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-[13px] font-medium text-muted-foreground">
                      البريد الإلكتروني
                    </Label>
                    <div className="relative">
                      <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="example@email.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="pr-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[50px] rounded-[14px] text-[17px] font-semibold ios-button-primary mt-2 border-0"
                    size="lg"
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="size-5 ml-1.5" />
                        <span>إرسال كود التحقق</span>
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="ios-pressable flex items-center justify-center gap-2 text-[15px] text-muted-foreground hover:text-foreground mx-auto"
                  >
                    <ArrowRight className="size-3.5" />
                    <span>العودة لتسجيل الدخول</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ========================================
                RESET OTP VIEW
                ======================================== */}
            {authView === 'reset-otp' && (
              <motion.div
                key="reset-otp"
                variants={viewVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="mb-7">
                  <h2 className="text-[28px] font-bold text-foreground" style={{ letterSpacing: "-0.035em" }}>
                    التحقق
                  </h2>
                  <p className="text-muted-foreground mt-1 text-[15px]">
                    أدخل الكود المُرسل إلى{' '}
                    <span className="text-foreground font-medium" dir="ltr">
                      {otp.otpEmail || forgotEmail}
                    </span>
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-4 py-2">
                    <InputOTP
                      maxLength={6}
                      value={resetOtpCode}
                      onChange={setResetOtpCode}
                      dir="ltr"
                      disabled={otpLoading}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {otp.fallbackCode && !otp.emailDelivered && (
                    <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-[12px] p-3">
                      <AlertCircle className="size-4 flex-shrink-0" />
                      <span>كود التحقق: <strong dir="ltr" className="text-lg">{otp.fallbackCode}</strong></span>
                    </div>
                  )}

                  {otp.emailDelivered && (
                    <div className="flex items-center justify-center gap-2 text-sm text-[hsl(var(--chart-2))]">
                      <CheckCircle2 className="size-4" />
                      <span>تم إرسال الكود إلى بريدك الإلكتروني</span>
                    </div>
                  )}

                  <Button
                    onClick={handleResetVerifyOtp}
                    disabled={resetOtpCode.length !== 6 || otpLoading}
                    className="w-full h-[50px] rounded-[14px] text-[17px] font-semibold ios-button-primary border-0"
                    size="lg"
                  >
                    {otpLoading ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-5 ml-1.5" />
                        <span>تحقق من الكود</span>
                      </>
                    )}
                  </Button>

                  <div className="flex flex-col items-center gap-3">
                    {canResend ? (
                      <button
                        type="button"
                        onClick={handleResetResendOtp}
                        disabled={otpSending}
                        className="ios-pressable flex items-center gap-2 text-[15px] text-[hsl(var(--primary))] font-medium"
                      >
                        {otpSending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                        إعادة إرسال الكود
                      </button>
                    ) : (
                      <CountdownTimer
                        seconds={60}
                        active={authView === 'reset-otp'}
                        onCanResend={() => setCanResend(true)}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => switchView('forgot-password')}
                      className="ios-pressable flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground"
                    >
                      <ArrowRight className="size-3.5" />
                      <span>تغيير البريد الإلكتروني</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ========================================
                RESET PASSWORD VIEW
                ======================================== */}
            {authView === 'reset-password' && (
              <motion.div
                key="reset-password"
                variants={viewVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="mb-7">
                  <h2 className="text-[28px] font-bold text-foreground" style={{ letterSpacing: "-0.035em" }}>
                    كلمة مرور جديدة
                  </h2>
                  <p className="text-muted-foreground mt-1 text-[15px]">
                    أدخل كلمة المرور الجديدة لحسابك
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-new-password" className="text-[13px] font-medium text-muted-foreground">
                      كلمة المرور الجديدة
                    </Label>
                    <div className="relative">
                      <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="reset-new-password"
                        type={showResetPassword ? 'text' : 'password'}
                        placeholder="6 أحرف على الأقل"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        className="pr-11 pl-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="new-password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showResetPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reset-confirm-password" className="text-[13px] font-medium text-muted-foreground">
                      تأكيد كلمة المرور
                    </Label>
                    <div className="relative">
                      <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted-foreground" />
                      <Input
                        id="reset-confirm-password"
                        type={showResetPassword ? 'text' : 'password'}
                        placeholder="أعد إدخال كلمة المرور"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        className="pr-11 h-[50px] rounded-[14px] text-[16px] bg-card border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                        dir="ltr"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[50px] rounded-[14px] text-[17px] font-semibold ios-button-primary mt-2 border-0"
                    size="lg"
                  >
                    {resetLoading ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        <span>جاري الإعادة التعيين...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="size-5 ml-1.5" />
                        <span>إعادة تعيين كلمة المرور</span>
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="ios-pressable flex items-center justify-center gap-2 text-[15px] text-muted-foreground hover:text-foreground mx-auto"
                  >
                    <ArrowRight className="size-3.5" />
                    <span>العودة لتسجيل الدخول</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
