/**
 * Home Assistant Dashboard Screen — Embedded HA WebView
 * 
 * Displays the Home Assistant instance running inside the Smart Ball hardware.
 * Native bridge sends commands to HA entities discovered by the Smart Ball.
 */

import React, { useState } from 'react';
import { View, Text, WebView, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HA_URL = 'http://smart-ball.local:8123'; // Local HA instance on the Smart Ball

const QUICK_DEVICES = [
  { id: 'light.living_room', name: 'نور الصالة', icon: 'bulb' },
  { id: 'media_player.tv', name: 'التلفزيون', icon: 'tv' },
  { id: 'climate.ac', name: 'التكييف', icon: 'snow' },
  { id: 'cover.curtains', name: 'الستارة', icon: 'close-circle' },
];

export default function HomeAssistantScreen() {
  const [showWebView, setShowWebView] = useState(false);
  const [haUrl, setHaUrl] = useState(HA_URL);

  if (showWebView) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowWebView(false)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
            <Text style={styles.backText}>رجوع</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Home Assistant</Text>
        </View>
        <WebView source={{ uri: haUrl }} style={styles.webview} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>لوحة التحكم</Text>
        <TouchableOpacity onPress={() => setShowWebView(true)} style={styles.fullViewButton}>
          <Ionicons name="expand" size={18} color="#7c3aed" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.deviceList}>
        <Text style={styles.sectionTitle}>الأجهزة السريعة</Text>
        {QUICK_DEVICES.map((device) => (
          <TouchableOpacity key={device.id} style={styles.deviceCard}>
            <View style={styles.deviceIcon}>
              <Ionicons name={device.icon as any} size={24} color="#7c3aed" />
            </View>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceId}>{device.id}</Text>
            </View>
            <TouchableOpacity style={styles.toggleButton}>
              <Ionicons name="power" size={20} color="#10b981" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.urlContainer}>
        <Text style={styles.urlLabel}>HA URL:</Text>
        <TextInput
          style={styles.urlInput}
          value={haUrl}
          onChangeText={setHaUrl}
          placeholder="http://smart-ball.local:8123"
          placeholderTextColor="#6b7280"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  backText: { color: '#fff', fontSize: 14 },
  fullViewButton: { padding: 8 },
  webview: { flex: 1 },
  deviceList: { flex: 1, padding: 15 },
  sectionTitle: { color: '#9ca3af', fontSize: 12, marginBottom: 10, textTransform: 'uppercase' },
  deviceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e32', borderRadius: 12, padding: 15, marginBottom: 8 },
  deviceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(124,58,237,0.15)', alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, marginLeft: 12 },
  deviceName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deviceId: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  toggleButton: { padding: 8 },
  urlContainer: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 8 },
  urlLabel: { color: '#9ca3af', fontSize: 12 },
  urlInput: { flex: 1, backgroundColor: '#1e1e32', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 12 },
});
