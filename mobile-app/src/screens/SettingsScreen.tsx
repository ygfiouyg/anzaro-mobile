/**
 * Anzaro Mobile — Settings Screen
 * V.14: Simple settings page with personality, theme, and system info.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Brain, Palette, Key, Cloud, Volume2, Info, LogOut } from 'lucide-react-native';
import { useIdentity } from '../mobile/context/IdentityContext';
import { ANZARO_API_URL, isHassConfigured, COLORS } from '../config';

export default function SettingsScreen() {
  const { matrix, clearIdentity } = useIdentity();

  const settingsGroups = [
    {
      title: 'الشخصية',
      items: [
        { icon: Brain, label: 'ملف الشخصية', value: matrix?.primaryArchetype ?? '—', color: COLORS.primary },
        { icon: Palette, label: 'الثيم', value: 'داكن', color: '#ec4899' },
      ],
    },
    {
      title: 'النظام',
      items: [
        { icon: Key, label: 'مفاتيح API', value: 'إدارة', color: '#f59e0b' },
        { icon: Cloud, label: 'Cloud Brain', value: ANZARO_API_URL?.replace(/^https?:\/\//, '').split('/')[0] ?? '—', color: '#10b981' },
        { icon: Info, label: 'HASS', value: isHassConfigured ? 'متصل' : 'Mock', color: isHassConfigured ? '#10b981' : '#f59e0b' },
      ],
    },
    {
      title: 'الصوت',
      items: [
        { icon: Volume2, label: 'النطق التلقائي', value: 'مفعل', color: '#8b5cf6' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>الإعدادات</Text>
        {settingsGroups.map((group, gi) => (
          <View key={gi} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity key={i} style={styles.row} activeOpacity={0.7}>
                  <View style={[styles.rowIcon, { backgroundColor: `${item.color}22` }]}>
                    <Icon size={18} color={item.color} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.rowValue}>{item.value}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => clearIdentity?.()} activeOpacity={0.7}>
          <LogOut size={18} color={COLORS.danger} />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>Anzaro AI v2.0.0 · V.14</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16 },
  headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  group: { marginBottom: 25 },
  groupTitle: { color: COLORS.textMuted, fontSize: 12, marginBottom: 10, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1 },
  rowLabel: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  rowValue: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 14, marginTop: 10 },
  logoutText: { color: COLORS.danger, fontSize: 15, fontWeight: '600' },
  versionText: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20 },
});
