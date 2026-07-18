/**
 * Anzaro Mobile — Home Assistant Control Center
 * ==============================================
 * V.14: Full production-ready HASS screen.
 * Categorized sections: Lights, Switches, Sensors.
 * Optimistic UI + haptics + pull-to-refresh.
 * Fail-safe guards: Array.isArray, null checks, Arabic warning layouts.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Animated, Easing,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Lightbulb, Power, Wind, Tv, Gauge, RefreshCw,
  Cloud, CloudOff, AlertCircle, Sun, Droplet, Thermometer,
  ChevronRight, Wifi, WifiOff,
} from 'lucide-react-native';
import { useIdentity } from '../context/IdentityContext';
import { fetchHassDevices, toggleHassDevice } from '../../services/hass';
import { isHassConfigured, HASS_URL, COLORS, type HassDevice } from '../../config';

// Enable LayoutAnimation for smooth state transitions
if (Platform.OS === 'android' && UIManager?.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Domain config ───
const DOMAIN_CONFIG: Record<string, { label: string; labelAr: string; icon: any; onColor: string; offColor: string }> = {
  light: { label: 'Lights', labelAr: 'الإنارة', icon: Lightbulb, onColor: '#f59e0b', offColor: '#6b7280' },
  switch: { label: 'Switches', labelAr: 'المفاتيح', icon: Power, onColor: '#3b82f6', offColor: '#6b7280' },
  climate: { label: 'Climate', labelAr: 'التكييف', icon: Wind, onColor: '#06b6d4', offColor: '#6b7280' },
  media_player: { label: 'Media', labelAr: 'الميديا', icon: Tv, onColor: '#8b5cf6', offColor: '#6b7280' },
  cover: { label: 'Covers', labelAr: 'الستائر', icon: ChevronRight, onColor: '#14b8a6', offColor: '#6b7280' },
  fan: { label: 'Fans', labelAr: 'المراوح', icon: Wind, onColor: '#f97316', offColor: '#6b7280' },
};

const SENSOR_ICONS: Record<string, any> = {
  temperature: Thermometer,
  humidity: Droplet,
  illuminance: Sun,
  default: Gauge,
};

export default function HomeAssistantScreen() {
  const { token } = useIdentity();
  const insets = useSafeAreaInsets();

  const [devices, setDevices] = useState<HassDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [cloudConnected, setCloudConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ─── Load devices ───
  const loadDevices = useCallback(async () => {
    setError(null);
    try {
      const devs = await fetchHassDevices();
      // V.14: Strict Array.isArray guard
      const safeDevs = Array.isArray(devs) ? devs : [];
      setDevices(safeDevs);

      // Animate in
      LayoutAnimation?.configureNext?.(LayoutAnimation.Presets?.easeInEaseOut ?? { duration: 0 });

      // Check cloud connectivity
      try {
        const { ANZARO_API_URL } = await import('../../config');
        const res = await fetch(`${ANZARO_API_URL}/api/status`, {
          signal: AbortSignal.timeout(5000),
        });
        setCloudConnected(res?.ok ?? false);
      } catch {
        setCloudConnected(false);
      }
    } catch (err: any) {
      setError(err?.message ?? 'فشل تحميل الأجهزة');
      setDevices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    // Fade in animation
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [loadDevices, fadeAnim]);

  // ─── Toggle device with haptics + optimistic UI ───
  const handleToggle = async (device: HassDevice) => {
    // V.14: Haptic feedback — Selection impact
    Haptics?.selectionAsync?.().catch(() => {});

    const entityId = device?.entity_id;
    if (!entityId) return;

    const currentState = device?.state ?? 'off';
    const action = currentState === 'on' ? 'turn_off' : 'turn_on';
    const newState = action === 'turn_on' ? 'on' : 'off';

    // Mark as toggling
    setToggling((prev) => ({ ...prev, [entityId]: true }));

    // Optimistic update
    setDevices((prev) =>
      (Array.isArray(prev) ? prev : []).map((d) =>
        d?.entity_id === entityId ? { ...d, state: newState } : d
      )
    );

    try {
      const result = await toggleHassDevice(entityId, action);
      if (!result?.success) {
        // Revert on failure
        Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setDevices((prev) =>
          (Array.isArray(prev) ? prev : []).map((d) =>
            d?.entity_id === entityId ? { ...d, state: currentState } : d
          )
        );
      } else {
        // Success haptic
        Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch {
      // Revert on error
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setDevices((prev) =>
        (Array.isArray(prev) ? prev : []).map((d) =>
          d?.entity_id === entityId ? { ...d, state: currentState } : d
        )
      );
    } finally {
      setToggling((prev) => {
        const next = { ...prev };
        delete next[entityId];
        return next;
      });
    }
  };

  // ─── Pull to refresh ───
  const onRefresh = () => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRefreshing(true);
    loadDevices();
  };

  // ─── Group devices by domain ───
  const safeDevices = Array.isArray(devices) ? devices : [];
  const controllableDomains = ['light', 'switch', 'climate', 'media_player', 'cover', 'fan'];
  const sensorDevices = safeDevices.filter((d) => d?.domain === 'sensor');
  const controllableDomainsPresent = controllableDomains.filter((d) =>
    safeDevices.some((dev) => dev?.domain === d)
  );

  // ─── Loading state ───
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingOrb} />
          <Text style={styles.loadingTitle}>Anzaro</Text>
          <Text style={styles.loadingText}>جاري الاتصال بسيرفر الكورة...</Text>
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Error / null state ───
  if (error && safeDevices.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconWrap}>
            <AlertCircle size={32} color={COLORS.warning} />
          </View>
          <Text style={styles.errorTitle}>تأكد من إعدادات الربط</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDevices} activeOpacity={0.7}>
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Empty state (no devices) ───
  if (safeDevices.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconWrap}>
            <WifiOff size={32} color={COLORS.textMuted} />
          </View>
          <Text style={styles.errorTitle}>مفيش أجهزة متصلة</Text>
          <Text style={styles.errorText}>تأكد من إعدادات الربط بـ Home Assistant</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDevices} activeOpacity={0.7}>
            <RefreshCw size={16} color="#fff" />
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>لوحة التحكم</Text>
            <Text style={styles.headerSubtitle}>Smart Home Hub</Text>
          </View>
          <View style={styles.headerRight}>
            {/* Cloud status */}
            <View style={[styles.statusPill, cloudConnected ? styles.statusConnected : styles.statusDisconnected]}>
              {cloudConnected ? (
                <Cloud size={12} color={COLORS.success} />
              ) : cloudConnected === false ? (
                <CloudOff size={12} color={COLORS.warning} />
              ) : (
                <ActivityIndicator size={10} color={COLORS.textMuted} />
              )}
              <Text style={[styles.statusText, cloudConnected ? styles.statusTextConnected : styles.statusTextDisconnected]}>
                {cloudConnected ? 'Cloud' : cloudConnected === false ? 'Offline' : '...'}
              </Text>
            </View>
            {/* HASS config badge */}
            <View style={styles.hassBadge}>
              <Wifi size={10} color={isHassConfigured ? COLORS.success : COLORS.warning} />
              <Text style={styles.hassBadgeText}>
                {isHassConfigured ? 'HASS' : 'Mock'}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── Device List ─── */}
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          {/* ─── Controllable sections ─── */}
          {controllableDomainsPresent.map((domain) => {
            const config = DOMAIN_CONFIG[domain] ?? { label: domain, labelAr: domain, icon: Power, onColor: COLORS.primary, offColor: COLORS.textMuted };
            const Icon = config.icon;
            const domainDevices = safeDevices.filter((d) => d?.domain === domain);

            return (
              <View key={domain} style={styles.section}>
                {/* Section header */}
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: `${config.onColor}22` }]}>
                      <Icon size={14} color={config.onColor} />
                    </View>
                    <Text style={styles.sectionTitle}>{config.labelAr}</Text>
                  </View>
                  <Text style={styles.sectionCount}>{domainDevices.length}</Text>
                </View>

                {/* Device cards */}
                <View style={styles.deviceGrid}>
                  {domainDevices.map((device) => {
                    const isOn = device?.state === 'on' || device?.state === 'playing';
                    const isToggling = toggling[device?.entity_id];
                    const brightness = device?.attributes?.brightness;
                    const brightnessPct = brightness != null ? Math.round((brightness / 255) * 100) : null;
                    const temperature = device?.attributes?.temperature;
                    const fanMode = device?.attributes?.fan_mode;

                    return (
                      <TouchableOpacity
                        key={device?.entity_id ?? Math.random()}
                        style={[styles.deviceCard, isOn && { borderColor: `${config.onColor}40`, backgroundColor: `${config.onColor}0D` }]}
                        onPress={() => handleToggle(device)}
                        disabled={isToggling}
                        activeOpacity={0.7}
                      >
                        {/* Top row: icon + toggle */}
                        <View style={styles.deviceTop}>
                          <View style={[styles.deviceIconWrap, { backgroundColor: isOn ? `${config.onColor}22` : 'rgba(255,255,255,0.05)' }]}>
                            {isToggling ? (
                              <ActivityIndicator size={14} color={isOn ? config.onColor : COLORS.textMuted} />
                            ) : (
                              <Icon size={16} color={isOn ? config.onColor : COLORS.textMuted} />
                            )}
                          </View>
                          {/* Toggle switch */}
                          <View style={[styles.toggle, isOn && { backgroundColor: config.onColor }]}>
                            <Animated.View
                              style={[
                                styles.toggleKnob,
                                isOn && { transform: [{ translateX: 14 }] },
                              ]}
                            />
                          </View>
                        </View>

                        {/* Device info */}
                        <Text style={styles.deviceName} numberOfLines={1}>
                          {device?.friendly_name ?? 'Unknown'}
                        </Text>
                        <Text style={styles.deviceEntityId} numberOfLines={1}>
                          {device?.entity_id ?? 'unknown'}
                        </Text>

                        {/* Brightness slider mock (for lights) */}
                        {domain === 'light' && isOn && brightnessPct != null && (
                          <View style={styles.brightnessBar}>
                            <View style={[styles.brightnessFill, { width: `${brightnessPct}%`, backgroundColor: config.onColor }]} />
                          </View>
                        )}

                        {/* Temperature display (for climate) */}
                        {domain === 'climate' && isOn && temperature != null && (
                          <View style={styles.attrRow}>
                            <Text style={styles.attrText}>{temperature}°C</Text>
                            {fanMode && <Text style={styles.attrTextMuted}>· {fanMode}</Text>}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* ─── Sensors section ─── */}
          {sensorDevices.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionIcon, { backgroundColor: `${COLORS.success}22` }]}>
                    <Gauge size={14} color={COLORS.success} />
                  </View>
                  <Text style={styles.sectionTitle}>المستشعرات</Text>
                </View>
                <Text style={styles.sectionCount}>{sensorDevices.length}</Text>
              </View>
              <View style={styles.sensorRow}>
                {sensorDevices.map((sensor) => {
                  const sensorName = sensor?.friendly_name?.toLowerCase() ?? '';
                  const SensorIcon = sensorName.includes('temp') ? SENSOR_ICONS.temperature :
                    sensorName.includes('humid') ? SENSOR_ICONS.humidity :
                    sensorName.includes('light') || sensorName.includes('illumin') ? SENSOR_ICONS.illuminance :
                    SENSOR_ICONS.default;
                  const unit = sensor?.attributes?.unit_of_measurement ?? '';
                  const value = sensor?.state ?? '—';

                  return (
                    <View key={sensor?.entity_id ?? Math.random()} style={styles.sensorCard}>
                      <SensorIcon size={16} color={COLORS.success} />
                      <Text style={styles.sensorName} numberOfLines={1}>{sensor?.friendly_name ?? 'Sensor'}</Text>
                      <Text style={styles.sensorValue}>
                        {value}<Text style={styles.sensorUnit}> {unit}</Text>
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Loading
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingOrb: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
    marginBottom: 12,
  },
  loadingTitle: { color: COLORS.text, fontSize: 20, fontWeight: 'bold' },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },
  // Error / empty
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  errorIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(245,158,11,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  errorTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  errorText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.card },
  headerLeft: {},
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: COLORS.textMuted, fontSize: 11 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusConnected: { backgroundColor: 'rgba(16,185,129,0.12)' },
  statusDisconnected: { backgroundColor: 'rgba(245,158,11,0.12)' },
  statusText: { fontSize: 10, fontWeight: '600' },
  statusTextConnected: { color: COLORS.success },
  statusTextDisconnected: { color: COLORS.warning },
  hassBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(124,58,237,0.12)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  hassBadgeText: { color: COLORS.primaryLight, fontSize: 9, fontWeight: '700' },
  // Scroll
  scrollContent: { padding: 16, gap: 20 },
  // Section
  section: {},
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  sectionCount: { color: COLORS.textMuted, fontSize: 11 },
  // Device grid
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  deviceCard: { width: (Platform.OS === 'web' ? 200 : (Dimensions_getWidth() - 42) / 2), backgroundColor: COLORS.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  deviceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  deviceIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 34, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', paddingHorizontal: 2 },
  toggleKnob: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' },
  deviceName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  deviceEntityId: { color: COLORS.textMuted, fontSize: 9, marginTop: 2, fontFamily: 'monospace' },
  // Brightness
  brightnessBar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 8, overflow: 'hidden' },
  brightnessFill: { height: '100%', borderRadius: 2 },
  // Attributes
  attrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  attrText: { color: COLORS.text, fontSize: 11, fontWeight: '600' },
  attrTextMuted: { color: COLORS.textMuted, fontSize: 10 },
  // Sensors
  sensorRow: { flexDirection: 'row', gap: 10 },
  sensorCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  sensorName: { color: COLORS.textMuted, fontSize: 10 },
  sensorValue: { color: COLORS.success, fontSize: 18, fontWeight: 'bold' },
  sensorUnit: { color: COLORS.textMuted, fontSize: 10, fontWeight: '400' },
});

// Helper: get screen width
import { Dimensions } from 'react-native';
function Dimensions_getWidth(): number {
  return Dimensions?.get?.('screen')?.width ?? 375;
}
