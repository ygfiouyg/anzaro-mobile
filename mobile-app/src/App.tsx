import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();

const COLORS = {
  background: '#0f0f1e',
  card: '#1a1a2e',
  primary: '#7c3aed',
  text: '#ffffff',
  textMuted: '#9ca3af',
  success: '#10b981',
  warning: '#f59e0b',
  border: 'rgba(255,255,255,0.1)',
};

const ANZARO_API = 'https://kopabdo-delta-ai-v2.hf.space';

function DashboardScreen() {
  const [status, setStatus] = useState('Checking...');
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const checkCloud = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${ANZARO_API}/api/status`, { signal: AbortSignal.timeout(5000) });
      setConnected(res?.ok ?? false);
      setStatus(res?.ok ? 'Cloud Brain متصل ✅' : 'Cloud Brain غير متصل ❌');
    } catch {
      setConnected(false);
      setStatus('فشل الاتصال ❌');
    }
    setRefreshing(false);
  };

  useEffect(() => { checkCloud(); }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={checkCloud} tintColor={COLORS.primary} />}
      >
        <View style={styles.orb} />
        <Text style={styles.title}>Anzaro AI</Text>
        <Text style={styles.subtitle}>الكرة الذكية</Text>
        <View style={[styles.card, { borderColor: connected ? COLORS.success + '40' : COLORS.warning + '40' }]}>
          <Text style={styles.statusText}>{status}</Text>
          <Text style={styles.urlText}>{ANZARO_API}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identity Matrix</Text>
          <Text style={styles.cardValue}>لم يتم التهيئة</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Smart Ball</Text>
          <Text style={styles.cardValue}>جاري المزامنة...</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatScreen() {
  const [messages, setMessages] = useState([{ id: '1', role: 'assistant', text: 'أهلاً! أنا Anzaro. كيف أقدر أساعدك؟' }]);
  const [input, setInput] = useState('');

  const send = () => {
    if (!input.trim()) return;
    setMessages([...messages, { id: Date.now().toString(), role: 'user', text: input }]);
    setInput('');
    setMessages(m => [...m, { id: (Date.now()+1).toString(), role: 'assistant', text: 'تمام، أنا بفكرك 🤔' }]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.chatList} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {messages.map(m => (
          <View key={m.id} style={[styles.msgBubble, m.role === 'user' ? styles.msgUser : styles.msgAI]}>
            <Text style={styles.msgText}>{m.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputBar}>
        <input
          style={styles.input}
          value={input}
          onChange={(e: any) => setInput(e.target.value)}
          onKeyDown={(e: any) => e.key === 'Enter' && send()}
          placeholder="اكتب لـ Anzaro..."
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>لوحة التحكم</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Light - Living Room</Text>
          <Text style={styles.cardValue}>Off</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Switch - Smart Plug</Text>
          <Text style={styles.cardValue}>Off</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sensor - Temperature</Text>
          <Text style={styles.cardValue}>24.5°C</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>الإعدادات</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anzaro AI</Text>
          <Text style={styles.cardValue}>v2.0.0 · V.14</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cloud Brain</Text>
          <Text style={styles.cardValue}>{ANZARO_API}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: COLORS.textMuted,
            tabBarStyle: { backgroundColor: COLORS.background, borderTopColor: COLORS.border, height: 60 },
            headerStyle: { backgroundColor: COLORS.background },
            headerTintColor: COLORS.text,
          }}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'الرئيسية', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
          <Tab.Screen name="Chat" component={ChatScreen} options={{ title: 'أنظاره', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble" size={size} color={color} /> }} />
          <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'المنزل', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
          <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'الإعدادات', tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, alignItems: 'center' },
  orb: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, marginBottom: 16, shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 24 },
  card: { width: '100%', backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { color: COLORS.textMuted, fontSize: 12, marginBottom: 4 },
  cardValue: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  statusText: { color: COLORS.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  urlText: { color: COLORS.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' },
  chatList: { flex: 1 },
  msgBubble: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  msgUser: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  msgAI: { alignSelf: 'flex-start', backgroundColor: COLORS.card },
  msgText: { color: COLORS.text, fontSize: 14 },
  inputBar: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.card },
  input: { flex: 1, backgroundColor: COLORS.background, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.text, fontSize: 14, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});
