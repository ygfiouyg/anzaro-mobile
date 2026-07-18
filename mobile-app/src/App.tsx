/**
 * Anzaro Mobile — Root App with Identity Gate
 * V.14: All navigation state guarded. Identity check before dashboard access.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { IdentityProvider, useIdentity } from './mobile/context/IdentityContext';
import DashboardScreen from './mobile/screens/DashboardScreen';
import ChatScreen from './mobile/screens/ChatScreen';
import HomeAssistantScreen from './screens/HomeAssistantScreen';
import SettingsScreen from './screens/SettingsScreen';
import OnboardingBridgeScreen from './mobile/screens/OnboardingBridgeScreen';
import { COLORS } from './config';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  const { isLoading, needsOnboarding } = useIdentity();

  // V.14: Loading state — don't crash while AsyncStorage loads
  if (isLoading) {
    return null; // Splash screen handled by native
  }

  // V.14: Identity gate — if no matrix, show onboarding bridge
  if (needsOnboarding) {
    return <OnboardingBridgeScreen />;
  }

  // ─── Main App (identity confirmed) ───
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarStyle: {
            backgroundColor: COLORS.background,
            borderTopColor: COLORS.border,
            paddingBottom: 5,
            height: 60,
          },
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
        screenListeners={{
          tabPress: () => {
            Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: 'التحكم',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid" size={size ?? 24} color={color ?? COLORS.primary} />
            ),
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: 'أنظاره',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubble-ellipses" size={size ?? 24} color={color ?? COLORS.primary} />
            ),
          }}
        />
        <Tab.Screen
          name="HomeAssistant"
          component={HomeAssistantScreen}
          options={{
            title: 'المنزل',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size ?? 24} color={color ?? COLORS.primary} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'الإعدادات',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size ?? 24} color={color ?? COLORS.primary} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <IdentityProvider>
        <AppNavigator />
      </IdentityProvider>
    </SafeAreaProvider>
  );
}
