'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatar: string | null;
  language: string;
  streak: number;
  isActive: boolean;
  isVerified: boolean;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

interface OtpState {
  otpId: string | null;
  otpEmail: string | null;
  otpType: 'verification' | 'reset';
  emailDelivered: boolean;
  otpSentAt: number | null;
  fallbackCode: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  language: 'ar' | 'en' | 'egyptian';

  // OTP state
  otp: OtpState;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  registerWithOtp: (name: string, email: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  sendOtp: (email: string, type: 'verification' | 'reset') => Promise<{ emailDelivered: boolean; fallbackCode?: string | null }>;
  resendOtp: () => Promise<{ emailDelivered: boolean; fallbackCode?: string | null }>;
  clearOtp: () => void;
  checkAuth: () => Promise<void>;
  setLanguage: (lang: 'ar' | 'en' | 'egyptian') => void;
  updateUser: (data: Partial<User>) => void;
  // V.14: Google OAuth session injection — called when ?google_login=TOKEN is in URL
  setGoogleSession: (token: string, name: string) => Promise<void>;
}

const initialOtpState: OtpState = {
  otpId: null,
  otpEmail: null,
  otpType: 'verification',
  emailDelivered: false,
  otpSentAt: null,
  fallbackCode: null,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      language: 'ar',
      otp: { ...initialOtpState },

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'فشل تسجيل الدخول — تأكد من البريد وكلمة المرور' }));
            throw new Error(error.message || 'فشل تسجيل الدخول — تأكد من البريد وكلمة المرور');
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            language: (data.user?.language as 'ar' | 'en' | 'egyptian') || 'ar',
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (name: string, email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Registration failed' }));
            throw new Error(error.debug || error.message || 'Registration failed');
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            language: (data.user?.language as 'ar' | 'en' | 'egyptian') || 'ar',
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      registerWithOtp: async (name: string, email: string, password: string, code: string) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/register-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, code }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Registration failed' }));
            throw new Error(error.debug || error.message || 'Registration failed');
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            otp: { ...initialOtpState },
            language: (data.user?.language as 'ar' | 'en' | 'egyptian') || 'ar',
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        const { token } = get();
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
        } catch {
          // Ignore logout API errors — we clear local state regardless
        } finally {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            language: 'ar',
            otp: { ...initialOtpState },
          });
        }
      },

      verifyOtp: async (email: string, code: string) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'OTP verification failed' }));
            throw new Error(error.message || 'OTP verification failed');
          }

          const data = await response.json();
          set((state) => ({
            user: data.user || state.user
              ? { ...(state.user!), ...data.user, isVerified: true }
              : null,
            isLoading: false,
            otp: { ...initialOtpState },
          }));
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      sendOtp: async (email: string, type: 'verification' | 'reset') => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, type }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Failed to send OTP' }));
            throw new Error(error.message || 'Failed to send OTP');
          }

          const data = await response.json();
          const otpState: OtpState = {
            otpId: data.otpId,
            otpEmail: email,
            otpType: type,
            emailDelivered: data.emailDelivered ?? false,
            otpSentAt: Date.now(),
            fallbackCode: data.fallbackCode ?? null,
          };

          set({ isLoading: false, otp: otpState });
          return { emailDelivered: data.emailDelivered ?? false, fallbackCode: data.fallbackCode ?? null };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resendOtp: async () => {
        const { otp } = get();
        if (!otp.otpEmail) throw new Error('No email to resend OTP to');
        return get().sendOtp(otp.otpEmail, otp.otpType);
      },

      clearOtp: () => {
        set({ otp: { ...initialOtpState } });
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return;
        }


        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/me', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            });
            return;
          }

          const data = await response.json();
          // ── Handle session token rotation ──
          // If the server rotated the token, update our stored token
          if (data.rotatedToken) {
            set({ token: data.rotatedToken });
          }
          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
            language: (data.user?.language as 'ar' | 'en' | 'egyptian') || 'ar',
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setLanguage: (lang: 'ar' | 'en' | 'egyptian') => {
        set({ language: lang });
      },

      updateUser: (data: Partial<User>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        }));
      },

      // V.14: Google OAuth session injection — set token then verify via /api/auth/me
      setGoogleSession: async (token: string, name: string) => {
        // Step 1: Set the token immediately so checkAuth can use it
        set({ token, isLoading: true });
        // Step 2: Fetch the full user profile
        try {
          const response = await fetch('/api/auth/me', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const data = await response.json();
            if (data.rotatedToken) set({ token: data.rotatedToken });
            set({
              user: data.user,
              isAuthenticated: true,
              isLoading: false,
              language: (data.user?.language as 'ar' | 'en' | 'egyptian') || 'ar',
            });
          } else {
            // Token invalid — clear and show auth
            set({ user: null, token: null, isAuthenticated: false, isLoading: false });
          }
        } catch {
          set({ user: null, token: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'delta-auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        language: state.language,
      }),
    }
  )
);
