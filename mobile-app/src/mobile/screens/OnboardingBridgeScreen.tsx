/**
 * Anzaro Mobile — Onboarding Bridge Screen
 * V.14: Shown when identityMatrix is null. Guides user to complete identity wizard.
 * Provides a "Connect to Cloud Brain" option that authenticates + syncs.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brain, Sparkles, Cloud, ArrowRight } from 'lucide-react-native';
import { useIdentity } from '../context/IdentityContext';
import { ANZARO_API_URL, COLORS, EMPTY_MATRIX } from '../../config';

export default function OnboardingBridgeScreen() {
  const { setToken, setMatrix } = useIdentity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email?.trim() || !password?.trim()) {
      setError('اكتب البريد وكلمة المرور');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${ANZARO_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res?.ok) {
        const errData = await res?.json?.().catch(() => ({}));
        throw new Error(errData?.message ?? 'فشل تسجيل الدخول');
      }

      const data = await res.json();
      const token = data?.token;

      if (!token) {
        throw new Error('لم يتم استلام رمز المصادقة');
      }

      // Save token → triggers fetchMatrixFromServer
      await setToken(token);

      // If server has no matrix, set a placeholder so user can proceed
      // The actual onboarding wizard would run here in production
      await setMatrix({
        ...EMPTY_MATRIX,
        primaryArchetype: 'new_user',
        personaVersion: 'v0.1',
      });
    } catch (err: any) {
      setError(err?.message ?? 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    // V.14: Set empty matrix — user can explore in limited mode
    await setMatrix({ ...EMPTY_MATRIX, primaryArchetype: 'guest', personaVersion: 'v0.1-guest' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Smart Ball Orb (simplified) */}
        <View style={styles.orbContainer}>
          <View style={styles.orb} />
          <View style={styles.orbGlow} />
        </View>

        <Text style={styles.title}>Anzaro AI</Text>
        <Text style={styles.subtitle}>الكرة الذكية — عقلك في بيتك</Text>

        {/* Identity Status */}
        <View style={styles.statusCard}>
          <Brain size={20} color={COLORS.primary} />
          <Text style={styles.statusText}>
            مفيش ملف شخصية لسه. سجل دخول علشان نبدأ تحليل شخصيتك.
          </Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="البريد الإلكتروني"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="كلمة المرور"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Cloud size={18} color="#fff" />
                <Text style={styles.loginBtnText}>اتصل بالـ Cloud Brain</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.guestBtn} onPress={handleGuest} activeOpacity={0.7}>
            <Text style={styles.guestBtnText}>الدخول كضيف</Text>
            <ArrowRight size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  orbContainer: { width: 80, height: 80, marginBottom: 20, position: 'relative' },
  orb: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  orbGlow: {
    position: 'absolute', inset: -10, borderRadius: 50,
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  title: { color: COLORS.text, fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: 13, marginBottom: 30 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 20, width: '100%',
  },
  statusText: { color: COLORS.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },
  form: { width: '100%', gap: 10 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.text, fontSize: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  errorText: { color: COLORS.danger, fontSize: 12, textAlign: 'center' },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, marginTop: 4,
  },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  guestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  guestBtnText: { color: COLORS.textMuted, fontSize: 13 },
});
