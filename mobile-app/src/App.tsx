/**
 * Anzaro Mobile — v2.4.0 Absolute Minimum
 * =========================================
 * ZERO external navigation libraries.
 * ZERO native modules beyond expo core.
 * Manual tab switching via state.
 * This CANNOT crash — it's just View + Text + TouchableOpacity.
 */

import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, FlatList,
  SafeAreaView,
} from 'react-native';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════
const API = 'https://kopabdo-delta-ai-v2.hf.space';

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
function Dashboard({ onTab }: { onTab: (t: string) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const check = useCallback(async () => {
    setRefreshing(true);
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      const r = await fetch(`${API}/api/status`, { signal: c.signal });
      clearTimeout(t);
      setConnected(r?.ok ?? false);
    } catch { setConnected(false); }
    setRefreshing(false);
  }, []);

  React.useEffect(() => { check(); }, [check]);

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={check} tintColor="#7c3aed" />}
      >
        <View style={s.orb} />
        <Text style={s.title}>Anzaro</Text>
        <Text style={s.sub}>الكرة الذكية</Text>

        <View style={[s.card, connected === true && { borderColor: '#10b98130' }, connected === false && { borderColor: '#f59e0b30' }]}>
          <View style={s.row}>
            <Ionicons name={connected ? 'cloud' : 'cloud-offline'} size={20} color={connected ? '#10b981' : '#f59e0b'} />
            <Text style={s.label}>Cloud Brain</Text>
            <Text style={[s.val, { color: connected ? '#10b981' : '#f59e0b' }]}>
              {connected === true ? 'متصل ✅' : connected === false ? 'غير متصل' : '...'}
            </Text>
          </View>
          <Text style={s.url}>{API}</Text>
        </View>

        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="cube" size={20} color="#7c3aed" />
            <Text style={s.label}>الأدوات</Text>
            <Text style={s.val}>68</Text>
          </View>
        </View>
        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="hardware-chip" size={20} color="#7c3aed" />
            <Text style={s.label}>النماذج</Text>
            <Text style={s.val}>26</Text>
          </View>
        </View>
        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="bulb" size={20} color="#7c3aed" />
            <Text style={s.label}>الأجهزة</Text>
            <Text style={s.val}>8</Text>
          </View>
        </View>

        <TouchableOpacity style={s.actionBtn} onPress={() => onTab('chat')}>
          <Ionicons name="chatbubble" size={18} color="#fff" />
          <Text style={s.actionText}>ابدأ محادثة مع أنظاره</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════
interface Msg { id: string; role: 'user' | 'assistant'; text: string; }

function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: '1', role: 'assistant', text: 'أهلاً! أنا أنظاره. كيف أقدر أساعدك؟' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const text = input?.trim();
    if (!text || sending) return;
    setMessages(p => [...p, { id: `u${Date.now()}`, role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 30000);
      const r = await fetch(`${API}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, model: 'delta-general', language: 'ar' }),
        signal: c.signal,
      });
      clearTimeout(t);
      if (r?.ok && r.body) {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          for (const line of chunk?.split('\n') ?? []) {
            if (!line?.startsWith('data: ')) continue;
            const d = line.slice(6).trim();
            if (d === '[DONE]') continue;
            try { const p = JSON.parse(d); if (p?.content) full += p.content; } catch {}
          }
        }
        setMessages(p => [...p, { id: `a${Date.now()}`, role: 'assistant', text: full || 'تمام' }]);
      } else {
        setMessages(p => [...p, { id: `a${Date.now()}`, role: 'assistant', text: 'مش قادر أوصل للسيرفر' }]);
      }
    } catch {
      setMessages(p => [...p, { id: `a${Date.now()}`, role: 'assistant', text: 'فيه مشكلة في النت' }]);
    }
    setSending(false);
  }, [input, sending]);

  return (
    <SafeAreaView style={s.screen}>
      <FlatList
        data={messages}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={[s.msg, item.role === 'user' ? s.msgU : s.msgA]}>
            <Text style={s.msgT}>{item.text}</Text>
          </View>
        )}
        contentContainerStyle={{ padding: 16 }}
      />
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="اكتب لـ Anzaro..."
          placeholderTextColor="#9ca3af"
          editable={!sending}
        />
        <TouchableOpacity style={[s.send, (!input?.trim() || sending) && { opacity: 0.4 }]} onPress={send} disabled={!input?.trim() || sending}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════
function Home() {
  const [devs, setDevs] = useState([
    { id: '1', name: 'Light - Living Room', icon: 'bulb', state: 'off' },
    { id: '2', name: 'Light - Office', icon: 'bulb', state: 'off' },
    { id: '3', name: 'Smart Plug', icon: 'power', state: 'off' },
    { id: '4', name: 'Phone DND', icon: 'notifications-off', state: 'off' },
    { id: '5', name: 'AC', icon: 'snow', state: 'off' },
    { id: '6', name: 'Temperature', icon: 'speedometer', state: '24.5°C' },
    { id: '7', name: 'Humidity', icon: 'water', state: '55%' },
  ]);
  const toggle = useCallback((id: string) => {
    setDevs(p => p.map(d => d.id === id ? { ...d, state: d.state === 'on' ? 'off' : 'on' } : d));
  }, []);
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.sectionTitle}>الأجهزة</Text>
        <View style={s.grid}>
          {devs.map(d => {
            const on = d.state === 'on';
            return (
              <TouchableOpacity
                key={d.id}
                style={[s.devCard, on && { borderColor: '#7c3aed40', backgroundColor: '#7c3aed0D' }]}
                onPress={() => !d.state.includes('°') && !d.state.includes('%') && toggle(d.id)}
                activeOpacity={0.7}
              >
                <View style={[s.devIcon, { backgroundColor: on ? '#7c3aed22' : 'rgba(255,255,255,0.05)' }]}>
                  <Ionicons name={d.icon as any} size={18} color={on ? '#7c3aed' : '#9ca3af'} />
                </View>
                <Text style={s.devName} numberOfLines={1}>{d.name}</Text>
                <Text style={[s.devState, { color: on ? '#7c3aed' : '#9ca3af' }]}>{d.state}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════
function Settings() {
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.title}>الإعدادات</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="information-circle" size={20} color="#7c3aed" />
            <Text style={s.label}>التطبيق</Text>
            <Text style={s.val}>Anzaro v2.4.0</Text>
          </View>
        </View>
        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="server" size={20} color="#10b981" />
            <Text style={s.label}>Cloud Brain</Text>
          </View>
          <Text style={s.url}>{API}</Text>
        </View>
        <Text style={s.version}>Anzaro AI · Smart Ball · V.14</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// ROOT — Manual tab switching, ZERO navigation libs
// ═══════════════════════════════════════════════════
type Tab = 'dashboard' | 'chat' | 'home' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: 'grid' },
  { id: 'chat', label: 'أنظاره', icon: 'chatbubble' },
  { id: 'home', label: 'المنزل', icon: 'home' },
  { id: 'settings', label: 'الإعدادات', icon: 'settings' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {/* Content */}
      <View style={{ flex: 1 }}>
        {tab === 'dashboard' && <Dashboard onTab={setTab} />}
        {tab === 'chat' && <Chat />}
        {tab === 'home' && <Home />}
        {tab === 'settings' && <Settings />}
      </View>
      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={s.tab}
            onPress={() => setTab(t.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t.icon as any}
              size={22}
              color={tab === t.id ? '#7c3aed' : '#9ca3af'}
            />
            <Text style={[s.tabLabel, { color: tab === t.id ? '#7c3aed' : '#9ca3af' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f1e' },
  screen: { flex: 1, backgroundColor: '#0f0f1e' },
  scroll: { padding: 20, alignItems: 'center' },
  orb: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#7c3aed', marginBottom: 16, shadowColor: '#7c3aed', shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  sub: { color: '#9ca3af', fontSize: 14, marginBottom: 24 },
  card: { width: '100%', backgroundColor: '#1a1a2e', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: '#9ca3af', fontSize: 13, flex: 1 },
  val: { color: '#fff', fontSize: 14, fontWeight: '600' },
  url: { color: '#9ca3af', fontSize: 10, marginTop: 6, marginLeft: 30 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  devCard: { width: 150, backgroundColor: '#1a1a2e', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  devIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  devName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  devState: { fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  msg: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  msgU: { alignSelf: 'flex-end', backgroundColor: '#7c3aed' },
  msgA: { alignSelf: 'flex-start', backgroundColor: '#1a1a2e' },
  msgT: { color: '#fff', fontSize: 14, lineHeight: 20 },
  inputBar: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#1a1a2e' },
  input: { flex: 1, backgroundColor: '#0f0f1e', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxHeight: 80 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  version: { color: '#9ca3af', fontSize: 11, textAlign: 'center', marginTop: 20 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7c3aed', borderRadius: 14, padding: 14, marginTop: 8, width: '100%' },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#0f0f1e', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingBottom: 8, paddingTop: 8, height: 60 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
