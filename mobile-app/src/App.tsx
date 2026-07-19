/**
 * Anzaro Mobile — v2.3.0 Zero-Crash Root
 * =======================================
 * STRIPPED TO BARE MINIMUM:
 * - No SplashScreen module (causes native init race condition)
 * - No AsyncStorage at root level (deferred to screens)
 * - No SecureStore (removed from deps entirely)
 * - No Constants.expoConfig reads at module scope
 * - No network calls at root
 * - Primitive fallback UI (pure View + Text, zero custom components)
 * - ErrorBoundary wraps everything
 */

import React, { Component, useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, FlatList,
} from 'react-native';

// ═══════════════════════════════════════════════════
// CONSTANTS — hardcoded, no process.env or Constants reads
// ═══════════════════════════════════════════════════
const ANZARO_API = 'https://kopabdo-delta-ai-v2.hf.space';

const C = {
  bg: '#0f0f1e',
  card: '#1a1a2e',
  primary: '#7c3aed',
  text: '#ffffff',
  muted: '#9ca3af',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  border: 'rgba(255,255,255,0.08)',
};

// ═══════════════════════════════════════════════════
// ERROR BOUNDARY — catches ANY render crash
// ═══════════════════════════════════════════════════
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[Anzaro] Crash:', error?.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.danger, marginBottom: 16 }} />
          <Text style={{ color: C.text, fontSize: 22, fontWeight: 'bold' }}>Anzaro</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>حدث خطأ — أعد فتح التطبيق</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════
// PRIMITIVE FALLBACK UI — zero external deps, cannot crash
// ═══════════════════════════════════════════════════
function BootScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: C.primary,
        marginBottom: 20,
      }} />
      <Text style={{ color: C.text, fontSize: 24, fontWeight: 'bold' }}>Anzaro</Text>
      <Text style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>جاري تحميل أنظاره...</Text>
      <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 16 }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════
// DASHBOARD SCREEN
// ═══════════════════════════════════════════════════
function DashboardScreen() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkCloud = useCallback(async () => {
    setRefreshing(true);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${ANZARO_API}/api/status`, { signal: controller.signal });
      clearTimeout(t);
      setConnected(res?.ok ?? false);
    } catch {
      setConnected(false);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { checkCloud(); }, [checkCloud]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={checkCloud} tintColor={C.primary} />}
      >
        <View style={styles.orb} />
        <Text style={styles.title}>Anzaro</Text>
        <Text style={styles.sub}>الكرة الذكية</Text>

        <View style={[styles.card, connected === true && { borderColor: C.success + '30' }, connected === false && { borderColor: C.warning + '30' }]}>
          <View style={styles.row}>
            <Ionicons name={connected ? 'cloud' : 'cloud-offline'} size={20} color={connected ? C.success : C.warning} />
            <Text style={styles.label}>Cloud Brain</Text>
            <Text style={[styles.val, connected ? { color: C.success } : { color: C.warning }]}>
              {connected === true ? 'متصل' : connected === false ? 'غير متصل' : '...'}
            </Text>
          </View>
          <Text style={styles.url}>{ANZARO_API}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="cube" size={20} color={C.primary} />
            <Text style={styles.label}>الأدوات</Text>
            <Text style={styles.val}>68</Text>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="hardware-chip" size={20} color={C.primary} />
            <Text style={styles.label}>النماذج</Text>
            <Text style={styles.val}>26</Text>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="bulb" size={20} color={C.primary} />
            <Text style={styles.label}>الأجهزة</Text>
            <Text style={styles.val}>8</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// CHAT SCREEN
// ═══════════════════════════════════════════════════
interface Msg { id: string; role: 'user' | 'assistant'; text: string; }

function ChatScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: '1', role: 'assistant', text: 'أهلاً! أنا أنظاره. كيف أقدر أساعدك؟' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const text = input?.trim();
    if (!text || sending) return;

    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${ANZARO_API}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: 'delta-general', language: 'ar' }),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (res?.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk?.split('\n') ?? []) {
            if (!line?.startsWith('data: ')) continue;
            const d = line.slice(6).trim();
            if (d === '[DONE]') continue;
            try {
              const p = JSON.parse(d);
              if (p?.content) full += p.content;
            } catch {}
          }
        }
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', text: full || 'تمام' }]);
      } else {
        setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', text: 'مش قادر أوصل للسيرفر' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', text: 'فيه مشكلة في النت' }]);
    }
    setSending(false);
  }, [input, sending]);

  const renderItem = useCallback(({ item }: { item: Msg }) => (
    <View style={[styles.msg, item.role === 'user' ? styles.msgUser : styles.msgAI]}>
      <Text style={styles.msgText}>{item.text}</Text>
    </View>
  ), []);

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={messages}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="اكتب لـ Anzaro..."
          placeholderTextColor={C.muted}
          editable={!sending}
        />
        <TouchableOpacity style={[styles.send, (!input?.trim() || sending) && { opacity: 0.4 }]} onPress={send} disabled={!input?.trim() || sending}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════
function HomeScreen() {
  const [devices, setDevices] = useState([
    { id: '1', name: 'Light - Living Room', icon: 'bulb', state: 'off' },
    { id: '2', name: 'Light - Office', icon: 'bulb', state: 'off' },
    { id: '3', name: 'Smart Plug', icon: 'power', state: 'off' },
    { id: '4', name: 'Phone DND', icon: 'notifications-off', state: 'off' },
    { id: '5', name: 'AC - Living Room', icon: 'snow', state: 'off' },
    { id: '6', name: 'Temperature', icon: 'speedometer', state: '24.5°C' },
    { id: '7', name: 'Humidity', icon: 'water', state: '55%' },
  ]);

  const toggle = useCallback((id: string) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, state: d.state === 'on' ? 'off' : 'on' } : d));
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.sectionTitle}>الأجهزة</Text>
        <View style={styles.grid}>
          {devices.map(d => {
            const isOn = d.state === 'on';
            return (
              <TouchableOpacity
                key={d.id}
                style={[styles.devCard, isOn && { borderColor: C.primary + '40', backgroundColor: C.primary + '0D' }]}
                onPress={() => !d.state.includes('°') && !d.state.includes('%') && toggle(d.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.devIcon, { backgroundColor: isOn ? C.primary + '22' : 'rgba(255,255,255,0.05)' }]}>
                  <Ionicons name={d.icon} size={18} color={isOn ? C.primary : C.muted} />
                </View>
                <Text style={styles.devName} numberOfLines={1}>{d.name}</Text>
                <Text style={[styles.devState, { color: isOn ? C.primary : C.muted }]}>{d.state}</Text>
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
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.title}>الإعدادات</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="information-circle" size={20} color={C.primary} />
            <Text style={styles.label}>التطبيق</Text>
            <Text style={styles.val}>Anzaro v2.3.0</Text>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="server" size={20} color={C.success} />
            <Text style={styles.label}>Cloud Brain</Text>
          </View>
          <Text style={styles.url}>{ANZARO_API}</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="shield-checkmark" size={20} color={C.success} />
            <Text style={styles.label}>الحالة</Text>
            <Text style={styles.val}>V.14 Defensive</Text>
          </View>
        </View>
        <Text style={styles.version}>Anzaro AI · Smart Ball · V.14</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// ROOT APP — Minimal boot, no native modules at root
// ═══════════════════════════════════════════════════
const Tab = createBottomTabNavigator();

function AppContent() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fail-safe bootstrap: minimal delay, no native calls
    const boot = async () => {
      await new Promise(r => setTimeout(r, 500));
      setReady(true);
    };
    // 2s hard timeout
    const timeout = setTimeout(() => setReady(true), 2000);
    boot();
    return () => clearTimeout(timeout);
  }, []);

  if (!ready) {
    return <BootScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: C.primary,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border, height: 60, paddingBottom: 5 },
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen}
          options={{ title: 'الرئيسية', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
        <Tab.Screen name="Chat" component={ChatScreen}
          options={{ title: 'أنظاره', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble" size={size} color={color} /> }} />
        <Tab.Screen name="Home" component={HomeScreen}
          options={{ title: 'المنزل', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
        <Tab.Screen name="Settings" component={SettingsScreen}
          options={{ title: 'الإعدادات', tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
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
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, alignItems: 'center' },
  orb: { width: 70, height: 70, borderRadius: 35, backgroundColor: C.primary, marginBottom: 16, shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  title: { color: C.text, fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  sub: { color: C.muted, fontSize: 14, marginBottom: 24 },
  card: { width: '100%', backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: C.muted, fontSize: 13, flex: 1 },
  val: { color: C.text, fontSize: 14, fontWeight: '600' },
  url: { color: C.muted, fontSize: 10, marginTop: 6, marginLeft: 30 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  devCard: { width: 150, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  devIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  devName: { color: C.text, fontSize: 13, fontWeight: '600' },
  devState: { fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  msg: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  msgUser: { alignSelf: 'flex-end', backgroundColor: C.primary },
  msgAI: { alignSelf: 'flex-start', backgroundColor: C.card },
  msgText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  inputBar: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  input: { flex: 1, backgroundColor: C.bg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border, maxHeight: 80 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  version: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 20 },
});
