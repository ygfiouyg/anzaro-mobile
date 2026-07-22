/**
 * Anzaro Mobile — Dashboard Screen
 * V.14: All state guarded with optional chaining + null-coalescing.
 * Includes HASS Mobile Sync Panel + Cloud Brain connection indicator.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Brain, Cpu, Activity, Zap, ShieldCheck, Home, Lightbulb,
  Wind, Tv, Power, Gauge, RefreshCw, Cloud, CloudOff,
  ChevronRight, Sparkles,
} from 'lucide-react-native';
import { useIdentity } from '../mobile/context/IdentityContext';
import { fetchHassDevices, toggleHassDevice } from '../services/hass';
import { ANZARO_API_URL, isHassConfigured, COLORS, type HassDevice } from '../config';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const DOMAIN_ICONS: Record<string, any> = {
  light: Lightbulb,
  switch: Power,
  climate: Wind,
  media_player: Tv,
  sensor: Gauge,
  cover: Home,
  fan: Wind,
};

export default function DashboardScreen({ navigation }: any) {
  const { matrix, token } = useIdentity();
  const [devices, setDevices] = useState<HassDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // V.14: Safe fallback matrix
  const safeMatrix = matrix ?? {
    primaryArchetype: 'Syncing...',
    traits: {},
    cognitiveStyle: 'pragmatic',
    personaVersion: 'v0.0',
  };

  // ─── Fetch HASS devices ───
  const loadDevices = useCallback(async () => {
    try {
      const devs = await fetchHassDevices();
      setDevices(Array.isArray(devs) ? devs : []);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ─── Check Cloud Brain connectivity ───
  const checkCloud = useCallback(async () => {
    try {
      const res = await fetch(`${ANZARO_API_URL}/api/status`, {
        signal: AbortSignal.timeout(5000),
      });
      setCloudConnected(res?.ok ?? false);
    } catch {
      setCloudConnected(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    checkCloud();
  }, [loadDevices, checkCloud]);

  // ─── Toggle device ───
  const handleToggle = async (device: HassDevice) => {
    setToggling(device.entity_id);
    const action = device.state === 'on' ? 'turn_off' : 'turn_on';

    // Optimistic update
    setDevices((prev) =>
      prev.map((d) =>
        d.entity_id === device.entity_id
          ? { ...d, state: action === 'turn_on' ? 'on' : 'off' }
          : d
      )
    );

    try {
      await toggleHassDevice(device.entity_id, action);
    } catch {
      // Revert on error
      setDevices((prev) =>
        prev.map((d) =>
          d.entity_id === device.entity_id ? { ...d, state: device.state } : d
        )
      );
    }
    setToggling(null);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDevices();
    checkCloud();
  };

  // ─── Group devices by domain ───
  const domains = [...new Set(devices.map((d) => d.domain))];
  const controllable = domains.filter((d) => ['light', 'switch', 'climate', 'media_player'].includes(d));
  const sensors = devices.filter((d) => d.domain === 'sensor');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* ─── Cloud Brain Status ─── */}
        <View style={styles.cloudBar}>
          {cloudConnected ? (
            <>
              <Cloud size={16} color={COLORS.success} />
              <Text style={styles.cloudTextConnected}>Cloud Brain متصل</Text>
            </>
          ) : (
            <>
              <CloudOff size={16} color={COLORS.warning} />
              <Text style={styles.cloudTextDisconnected}>Connecting to Cloud Brain...</Text>
            </>
          )}
        </View>

        {/* ─── Identity Matrix Overview ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity Matrix</Text>
          <View style={styles.matrixCard}>
            <View style={styles.matrixHeader}>
              <Brain size={24} color={COLORS.primary} />
              <View style={styles.matrixInfo}>
                <Text style={styles.matrixArchetype}>{safeMatrix.primaryArchetype}</Text>
                <Text style={styles.matrixVersion}>{safeMatrix.personaVersion}</Text>
              </View>
              <TouchableOpacity
                style={styles.matrixEditBtn}
                onPress={() => navigation?.navigate?.('Settings')}
              >
                <Sparkles size={16} color={COLORS.primaryLight} />
              </TouchableOpacity>
            </View>
            <View style={styles.statsRow}>
              <StatChip icon={Zap} label="Leadership" value={`${safeMatrix.traits?.leadership ?? '—'}`} color={COLORS.warning} />
              <StatChip icon={Activity} label="Analytical" value={`${safeMatrix.traits?.analyticalDepth ?? '—'}`} color="#3b82f6" />
              <StatChip icon={ShieldCheck} label="Discipline" value={`${safeMatrix.traits?.discipline ?? '—'}`} color={COLORS.success} />
            </View>
          </View>
        </View>

        {/* ─── HASS Mobile Sync Panel ─── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Smart Home Hub</Text>
            <View style={styles.hassBadge}>
              <Text style={styles.hassBadgeText}>
                {isHassConfigured ? 'HASS متصل' : 'Mock Mode'}
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>جاري تحميل الأجهزة...</Text>
            </View>
          ) : (
            <>
              {/* Controllable devices grid */}
              {controllable.map((domain) => {
                const domainDevices = devices.filter((d) => d.domain === domain);
                if (domainDevices.length === 0) return null;
                return (
                  <View key={domain} style={styles.domainGroup}>
                    <Text style={styles.domainLabel}>{domain}</Text>
                    <View style={styles.deviceGrid}>
                      {domainDevices.map((device) => {
                        const Icon = DOMAIN_ICONS[device.domain] ?? Power;
                        const isOn = device.state === 'on' || device.state === 'playing';
                        const isToggling = toggling === device.entity_id;
                        return (
                          <TouchableOpacity
                            key={device.entity_id}
                            style={[styles.deviceCard, isOn && styles.deviceCardOn]}
                            onPress={() => handleToggle(device)}
                            disabled={isToggling}
                            activeOpacity={0.7}
                          >
                            <View style={styles.deviceHeader}>
                              <View style={[styles.deviceIcon, isOn && styles.deviceIconOn]}>
                                <Icon size={18} color={isOn ? COLORS.text : COLORS.textMuted} />
                              </View>
                              <View style={[styles.toggleSwitch, isOn && styles.toggleSwitchOn]}>
                                {isToggling ? (
                                  <ActivityIndicator size="small" color={COLORS.text} />
                                ) : (
                                  <View style={[styles.toggleKnob, isOn && styles.toggleKnobOn]} />
                                )}
                              </View>
                            </View>
                            <Text style={styles.deviceName} numberOfLines={1}>{device.friendly_name}</Text>
                            <Text style={styles.deviceId} numberOfLines={1}>{device.entity_id}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* Sensors row */}
              {sensors.length > 0 && (
                <View style={styles.domainGroup}>
                  <Text style={styles.domainLabel}>Sensors</Text>
                  <View style={styles.sensorRow}>
                    {sensors.map((sensor) => (
                      <View key={sensor.entity_id} style={styles.sensorCard}>
                        <Gauge size={16} color={COLORS.success} />
                        <Text style={styles.sensorName} numberOfLines={1}>{sensor.friendly_name}</Text>
                        <Text style={styles.sensorValue}>
                          {sensor.state}{sensor.attributes?.unit_of_measurement ?? ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* ─── Quick Actions ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation?.navigate?.('Chat')}
              activeOpacity={0.7}
            >
              <Cpu size={20} color={COLORS.primary} />
              <Text style={styles.quickBtnText}>AI Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation?.navigate?.('Settings')}
              activeOpacity={0.7}
            >
              <Brain size={20} color={COLORS.primaryLight} />
              <Text style={styles.quickBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Stat Chip Component ───
function StatChip({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={styles.statChip}>
      <Icon size={12} color={color} />
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16, paddingBottom: 40 },
  cloudBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, marginBottom: 16,
    backgroundColor: COLORS.card,
  },
  cloudTextConnected: { color: COLORS.success, fontSize: 12, fontWeight: '600' },
  cloudTextDisconnected: { color: COLORS.warning, fontSize: 12, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  hassBadge: { backgroundColor: 'rgba(124,58,237,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  hassBadgeText: { color: COLORS.primaryLight, fontSize: 10, fontWeight: '600' },
  matrixCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16 },
  matrixHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  matrixInfo: { flex: 1 },
  matrixArchetype: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', textTransform: 'capitalize' },
  matrixVersion: { color: COLORS.textMuted, fontSize: 11 },
  matrixEditBtn: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(124,58,237,0.1)' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.cardLight, borderRadius: 10, padding: 8 },
  statLabel: { color: COLORS.textMuted, fontSize: 9 },
  statValue: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  loadingContainer: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: COLORS.textMuted, fontSize: 12, marginTop: 8 },
  domainGroup: { marginBottom: 16 },
  domainLabel: { color: COLORS.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  deviceCard: { width: CARD_WIDTH, backgroundColor: COLORS.card, borderRadius: 14, padding: 12 },
  deviceCardOn: { backgroundColor: 'rgba(124,58,237,0.15)', borderColor: 'rgba(124,58,237,0.3)', borderWidth: 1 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  deviceIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  deviceIconOn: { backgroundColor: 'rgba(124,58,237,0.2)' },
  toggleSwitch: { width: 36, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', paddingHorizontal: 2 },
  toggleSwitchOn: { backgroundColor: COLORS.primary },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: 'flex-start' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  deviceName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  deviceId: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  sensorRow: { flexDirection: 'row', gap: 10 },
  sensorCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  sensorName: { color: COLORS.textMuted, fontSize: 10 },
  sensorValue: { color: COLORS.success, fontSize: 16, fontWeight: 'bold' },
  quickActions: { flexDirection: 'row', gap: 12 },
  quickBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8 },
  quickBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
});
