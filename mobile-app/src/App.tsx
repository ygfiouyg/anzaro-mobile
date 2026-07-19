/**
 * Anzaro Mobile — Root App (V.14 Crash-Safe)
 * ============================================
 * Error Boundary + Safe Fallback + No external native deps that cause crashes.
 * Uses only @expo/vector-icons (built-in, no native module needed).
 */

import React, { Component, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════
const ANZARO_API = 'https://kopabdo-delta-ai-v2.hf.space';

const C = {
  bg: '#0f0f1e',
  card: '#1a1a2e',
  primary: '#7c3aed',
  primaryL: '#a78bfa',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  border: 'rgba(255,255,255,0.08)',
};

// ═══════════════════════════════════════════════════
// ERROR BOUNDARY — catches any render crash
// ═══════════════════════════════════════════════════
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error?.message ?? 'Unknown crash' };
  }

  componentDidCatch(error: Error) {
    console.error('[Anzaro] Root crash caught:', error?.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorOrb} />
          <Text style={styles.errorTitle}>Anzaro</Text>
          <Text style={styles.errorText}>حدث خطأ غير متوقع</Text>
          <Text style={styles.errorDetail}>{this.state.error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => this.setState({ hasError: false, error: '' })}
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════
// SAFE LOADING SCREEN — never return null
// ═══════════════════════════════════════════════════
function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <View style={styles.loadingOrb} />
      <Text style={styles.loadingTitle}>Anzaro</Text>
      <Text style={styles.loadingText}>جاري التحميل...</Text>
      <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 12 }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════
// DASHBOARD SCREEN
// ═══════════════════════════════════════════════════
function DashboardScreen() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasIdentity, setHasIdentity] = useState<boolean | null>(null);

  const checkAll = async () => {
    setRefreshing(true);
    // Check cloud
    try {
      const res = await fetch(`${ANZARO_API}/api/status`, { signal: AbortSignal.timeout(5000) });
      setConnected(res?.ok ?? false);
    } catch {
      setConnected(false);
    }
    // Check identity
    try {
      const stored = await AsyncStorage?.getItem?.('@anzaro_identity');
      setHasIdentity(!!stored);
    } catch {
      setHasIdentity(false);
    }
    setRefreshing(false);
  };

  useEffect(() => { checkAll(); }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={checkAll} tintColor={C.primary} />}
      >
        {/* Orb */}
        <View style={styles.orb}>
          <View style={styles.orbInner} />
        </View>
        <Text style={styles.brandTitle}>Anzaro</Text>
        <Text style={styles.brandSub}>الكرة الذكية</Text>

        {/* Cloud Status */}
        <View style={[styles.card, connected === false && styles.cardWarning, connected === true && styles.cardSuccess]}>
          <View style={styles.cardRow}>
            <Ionicons name={connected === true ? 'cloud' : connected === false ? 'cloud-offline' : 'hourglass'} size={20} color={connected === true ? C.success : connected === false ? C.warning : C.muted} />
            <Text style={styles.cardLabel}>Cloud Brain</Text>
            <Text style={[styles.cardValue, connected === true && styles.valueSuccess, connected === false && styles.valueWarning]}>
              {connected === true ? 'متصل ✅' : connected === false ? 'غير متصل ❌' : '...'}
            </Text>
          </View>
          <Text style={styles.cardUrl}>{ANZARO_API}</Text>
        </View>

        {/* Identity */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="person-circle" size={20} color={C.primary} />
            <Text style={styles.cardLabel}>Identity Matrix</Text>
            <Text style={styles.cardValue}>{hasIdentity === true ? 'جاهز ✅' : hasIdentity === false ? 'غير مُهيأ' : '...'}</Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="cube" size={16} color={C.primaryL} />
            <Text style={styles.statValue}>68</Text>
            <Text style={styles.statLabel}>أدوات</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="hardware-chip" size={16} color={C.primaryL} />
            <Text style={styles.statValue}>26</Text>
            <Text style={styles.statLabel}>نماذج</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="bulb" size={16} color={C.primaryL} />
            <Text style={styles.statValue}>8</Text>
            <Text style={styles.statLabel}>أجهزة</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// CHAT SCREEN (simplified, crash-safe)
// ═══════════════════════════════════════════════════
interface Msg { id: string; role: 'user' | 'assistant'; text: string; }

function ChatScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: '1', role: 'assistant', text: 'أهلاً! أنا أنظاره. كيف أقدر أساعدك النهاردة؟ 🤖' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = input?.trim();
    if (!text || sending) return;

    const userMsg: Msg = { id: `u_${Date.now()}`, role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Try to call Cloud Brain
    try {
      const token = await AsyncStorage?.getItem?.('@anzaro_token');
      const res = await fetch(`${ANZARO_API}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, model: 'delta-general', language: 'ar' }),
        signal: AbortSignal.timeout(30000),
      });

      if (res?.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk?.split('\n') ?? []) {
            if (line?.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed?.content) fullText += parsed.content;
              } catch {}
            }
          }
        }
        if (fullText) {
          setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: fullText }]);
        } else {
          setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: 'تمام، فهمت 👍' }]);
        }
      } else {
        setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: 'مش قادر أوصل للسيرفر دلوقتي. جرّب تاني.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: 'فيه مشكلة في النت. اتأكد من الاتصال.' }]);
    }
    setSending(false);
  };

  const renderMsg = ({ item }: { item: Msg }) => (
    <View style={[styles.msgBubble, item.role === 'user' ? styles.msgUser : styles.msgAI]}>
      <Text style={styles.msgText}>{item.text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMsg}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        inverted={false}
        onContentSizeChange={() => {}}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="اكتب لـ Anzaro..."
          placeholderTextColor={C.muted}
          multiline
          editable={!sending}
        />
        <TouchableOpacity style={[styles.sendBtn, (!input?.trim() || sending) && styles.sendDisabled]} onPress={send} disabled={!input?.trim() || sending}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// HOME ASSISTANT SCREEN
// ═══════════════════════════════════════════════════
function HomeScreen() {
  const [devices, setDevices] = useState([
    { id: '1', name: 'Living Room Light', domain: 'light', state: 'off' },
    { id: '2', name: 'Office Light', domain: 'light', state: 'off' },
    { id: '3', name: 'Smart Plug', domain: 'switch', state: 'off' },
    { id: '4', name: 'Phone DND', domain: 'switch', state: 'off' },
    { id: '5', name: 'Living Room AC', domain: 'climate', state: 'off' },
    { id: '6', name: 'Temperature', domain: 'sensor', state: '24.5°C' },
    { id: '7', name: 'Humidity', domain: 'sensor', state: '55%' },
  ]);
  const [refreshing, setRefreshing] = useState(false);

  const toggle = (id: string) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, state: d.state === 'on' ? 'off' : 'on' } : d));
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const domainIcons: Record<string, string> = {
    light: 'bulb', switch: 'power', climate: 'snow', sensor: 'speedometer',
  };
  const domainColors: Record<string, string> = {
    light: '#f59e0b', switch: '#3b82f6', climate: '#06b6d4', sensor: '#10b981',
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        <Text style={styles.sectionTitle}>الأجهزة</Text>
        <View style={styles.deviceGrid}>
          {devices.map(d => {
            const isOn = d.state === 'on';
            const color = domainColors[d.domain] ?? C.muted;
            return (
              <TouchableOpacity
                key={d.id}
                style={[styles.deviceCard, isOn && { borderColor: color + '40', backgroundColor: color + '0D' }]}
                onPress={() => d.domain !== 'sensor' && toggle(d.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.deviceIcon, { backgroundColor: isOn ? color + '22' : 'rgba(255,255,255,0.05)' }]}>
                  <Ionicons name={domainIcons[d.domain] ?? 'hardware-chip'} size={18} color={isOn ? color : C.muted} />
                </View>
                <Text style={styles.deviceName} numberOfLines={1}>{d.name}</Text>
                <Text style={[styles.deviceState, { color: isOn ? color : C.muted }]}>{d.state}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════
function SettingsScreen() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage?.getItem?.('@anzaro_token').then(t => setToken(t)).catch(() => setToken(null));
  }, []);

  const logout = async () => {
    try {
      await AsyncStorage?.multiRemove?.(['@anzaro_token', '@anzaro_identity']);
    } catch {}
    setToken(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.brandTitle}>الإعدادات</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="information-circle" size={20} color={C.primary} />
            <Text style={styles.cardLabel}>التطبيق</Text>
            <Text style={styles.cardValue}>Anzaro v2.1.0</Text>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="server" size={20} color={C.success} />
            <Text style={styles.cardLabel}>Cloud Brain</Text>
          </View>
          <Text style={styles.cardUrl}>{ANZARO_API}</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="key" size={20} color={token ? C.success : C.warning} />
            <Text style={styles.cardLabel}>الحالة</Text>
            <Text style={styles.cardValue}>{token ? 'مسجل دخول' : 'ضيف'}</Text>
          </View>
        </View>
        {token && (
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
            <Ionicons name="log-out" size={18} color={C.danger} />
            <Text style={styles.logoutText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.versionText}>Anzaro AI · V.14 · Smart Ball</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════
const Tab = createBottomTabNavigator();

function AppContent() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // V.14: Safe hydration — never crash on null storage
    const init = async () => {
      try {
        // Test AsyncStorage access
        await AsyncStorage?.getItem?.('@anzaro_init_test');
      } catch {}
      setReady(true);
    };
    // Short timeout fallback — don't hang forever
    const timeout = setTimeout(() => setReady(true), 2000);
    init();
    return () => clearTimeout(timeout);
  }, []);

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: C.primary,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: {
            backgroundColor: C.bg,
            borderTopColor: C.border,
            paddingBottom: 5,
            height: 60,
          },
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: 'الرئيسية',
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size ?? 24} color={color ?? C.primary} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: 'أنظاره',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble" size={size ?? 24} color={color ?? C.primary} />,
          }}
        />
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'المنزل',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size ?? 24} color={color ?? C.primary} />,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'الإعدادات',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size ?? 24} color={color ?? C.primary} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// ═══════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════
const styles = StyleSheet.create({
  // Error
  errorContainer: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorOrb: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.danger, marginBottom: 16 },
  errorTitle: { color: C.text, fontSize: 24, fontWeight: 'bold' },
  errorText: { color: C.muted, fontSize: 14, marginTop: 8 },
  errorDetail: { color: C.danger, fontSize: 11, marginTop: 4, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  // Loading
  loadingContainer: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  loadingOrb: { width: 70, height: 70, borderRadius: 35, backgroundColor: C.primary, marginBottom: 16, shadowColor: C.primary, shadowOpacity: 0.6, shadowRadius: 20, elevation: 10 },
  loadingTitle: { color: C.text, fontSize: 22, fontWeight: 'bold' },
  loadingText: { color: C.muted, fontSize: 13, marginTop: 4 },
  // Screen
  screen: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 20, alignItems: 'center' },
  // Brand
  orb: { width: 80, height: 80, borderRadius: 40, marginBottom: 16, justifyContent: 'center', alignItems: 'center' },
  orbInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 25, elevation: 12 },
  brandTitle: { color: C.text, fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  brandSub: { color: C.muted, fontSize: 14, marginBottom: 24 },
  // Card
  card: { width: '100%', backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardWarning: { borderColor: C.warning + '30' },
  cardSuccess: { borderColor: C.success + '30' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardLabel: { color: C.muted, fontSize: 13, flex: 1 },
  cardValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  valueSuccess: { color: C.success },
  valueWarning: { color: C.warning },
  cardUrl: { color: C.muted, fontSize: 10, marginTop: 6, marginLeft: 30 },
  // Stats
  statsRow: { flexDirection: 'row', gap: 8, width: '100%' },
  statBox: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  statValue: { color: C.text, fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: C.muted, fontSize: 10 },
  // Section
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  // Devices
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  deviceCard: { width: 150, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  deviceIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  deviceName: { color: C.text, fontSize: 13, fontWeight: '600' },
  deviceState: { fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  // Chat
  msgBubble: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  msgUser: { alignSelf: 'flex-end', backgroundColor: C.primary },
  msgAI: { alignSelf: 'flex-start', backgroundColor: C.card },
  msgText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  inputBar: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  input: { flex: 1, backgroundColor: C.bg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border, maxHeight: 80 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  // Settings
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 14, marginTop: 8 },
  logoutText: { color: C.danger, fontSize: 15, fontWeight: '600' },
  versionText: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 20 },
});
