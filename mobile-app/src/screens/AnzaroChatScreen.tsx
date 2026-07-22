/**
 * Anzaro Main Ecosystem Screen — Chat Interface
 * 
 * Features:
 * - Real-time chat with Anzaro AI (SSE streaming)
 * - Smart Ball status indicator (idle/processing/speaking)
 * - Voice input (expo-speech recognition)
 * - TTS output (expo-speech)
 * - Personality-aware responses
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

const ANZARO_SERVER = 'https://kopabdo-delta-ai-v2.hf.space';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function AnzaroChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [ballState, setBallState] = useState<'idle' | 'processing' | 'speaking'>('idle');
  const [token, setToken] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const ballScale = useRef(new Animated.Value(1)).current;

  // Ball pulse animation when processing
  useEffect(() => {
    if (ballState === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ballScale, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(ballScale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      ballScale.setValue(1);
    }
  }, [ballState]);

  const sendMessage = async () => {
    if (!input.trim() || !token) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setBallState('processing');

    try {
      const response = await fetch(`${ANZARO_SERVER}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMsg.content,
          model: 'delta-general',
          language: 'ar',
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantId = (Date.now() + 1).toString();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;
                setMessages((prev) => {
                  const exists = prev.find((m) => m.id === assistantId);
                  if (exists) {
                    return prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m);
                  }
                  return [...prev, { id: assistantId, role: 'assistant', content: assistantContent, timestamp: Date.now() }];
                });
              }
            } catch {}
          }
        }
      }

      // Speak the response
      if (assistantContent) {
        setBallState('speaking');
        Speech.speak(assistantContent.replace(/[🎯▶⏹⏸💡🔌🎭🎵✅❌]/g, '').replace(/\*\*/g, ''), {
          language: 'ar-EG',
          onDone: () => setBallState('idle'),
        });
      }
    } catch (e) {
      console.error('Chat error:', e);
    } finally {
      setIsStreaming(false);
      setBallState('idle');
    }
  };

  const ballColors = {
    idle: '#6b7280',
    processing: '#f59e0b',
    speaking: '#7c3aed',
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Smart Ball Status Orb */}
      <View style={styles.ballContainer}>
        <Animated.View
          style={[
            styles.ball,
            {
              backgroundColor: ballColors[ballState],
              transform: [{ scale: ballScale }],
            },
          ]}
        />
        <Text style={styles.ballLabel}>
          {ballState === 'idle' ? 'في انتظارك' : ballState === 'processing' ? 'بفكّر' : 'بتكلم'}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.message, item.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
            <Text style={styles.messageText}>{item.content}</Text>
          </View>
        )}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="اكتب لـ Anzaro..."
          placeholderTextColor="#6b7280"
          multiline
          textAlign="right"
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={isStreaming || !input.trim()}>
          {isStreaming ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1e' },
  ballContainer: { alignItems: 'center', paddingVertical: 15 },
  ball: { width: 50, height: 50, borderRadius: 25, shadowColor: '#7c3aed', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 },
  ballLabel: { color: '#9ca3af', fontSize: 11, marginTop: 5 },
  messagesList: { paddingHorizontal: 15, paddingBottom: 10 },
  message: { maxWidth: '80%', padding: 12, borderRadius: 16, marginVertical: 4 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#7c3aed' },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: '#1e1e32' },
  messageText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  inputContainer: { flexDirection: 'row', padding: 10, gap: 8 },
  input: { flex: 1, backgroundColor: '#1e1e32', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 80 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
});
