/**
 * Anzaro Mobile — Secure Identity Context
 * ======================================
 * V.14: Manages the user's Identity Matrix via AsyncStorage.
 * If identityMatrix is null/missing → routes to OnboardingBridge.
 * All storage operations wrapped in try/catch with fallback objects.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANZARO_API_URL, EMPTY_MATRIX, type IdentityMatrix } from '../config';

const IDENTITY_STORAGE_KEY = '@anzaro_identity_matrix';
const AUTH_TOKEN_KEY = '@anzaro_auth_token';

interface IdentityContextType {
  matrix: IdentityMatrix | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  setMatrix: (matrix: IdentityMatrix) => Promise<void>;
  setToken: (token: string) => Promise<void>;
  clearIdentity: () => Promise<void>;
  fetchMatrixFromServer: (serverToken: string) => Promise<void>;
}

const IdentityContext = createContext<IdentityContextType>({
  matrix: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  needsOnboarding: true,
  setMatrix: async () => {},
  setToken: async () => {},
  clearIdentity: async () => {},
  fetchMatrixFromServer: async () => {},
});

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [matrix, setMatrixState] = useState<IdentityMatrix | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Load from AsyncStorage on mount ───
  useEffect(() => {
    const load = async () => {
      try {
        const [storedMatrix, storedToken] = await Promise.all([
          AsyncStorage?.getItem?.(IDENTITY_STORAGE_KEY) ?? null,
          AsyncStorage?.getItem?.(AUTH_TOKEN_KEY) ?? null,
        ]);

        // V.14: Safe parse with fallback
        if (storedMatrix) {
          try {
            const parsed = JSON.parse(storedMatrix);
            setMatrixState(parsed ?? null);
          } catch {
            setMatrixState(null);
          }
        }

        if (storedToken) {
          setTokenState(storedToken);
          // Try to fetch fresh matrix from server
          await fetchMatrixFromServer(storedToken);
        }
      } catch (err) {
        // V.14: Silent fail — don't crash on storage errors
        console.warn('[Identity] Storage load failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ─── Fetch matrix from server (sync with Cloud Brain) ───
  const fetchMatrixFromServer = useCallback(async (serverToken: string) => {
    if (!serverToken) return;
    try {
      const res = await fetch(`${ANZARO_API_URL}/api/anzaro/personality/profile`, {
        headers: { Authorization: `Bearer ${serverToken}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!res?.ok) return;

      const data = await res.json();
      if (data?.profile) {
        // Server has a profile — convert to IdentityMatrix format
        const serverMatrix: IdentityMatrix = {
          ...EMPTY_MATRIX,
          primaryArchetype: data.profile.personaType ?? 'unknown',
          traits: {
            leadership: data.profile.leadership ?? 50,
            analyticalDepth: data.profile.analytical ?? 50,
            emotionalIntelligence: data.profile.emotional ?? 50,
            discipline: data.profile.discipline ?? 50,
          },
          personaVersion: `v${data.profile.version ?? 1}`,
        };
        setMatrixState(serverMatrix);
        await AsyncStorage?.setItem?.(IDENTITY_STORAGE_KEY, JSON.stringify(serverMatrix));
      } else {
        // No profile on server — needs onboarding
        setMatrixState(null);
      }
    } catch (err) {
      // V.14: Network error — keep existing local matrix if any
      console.warn('[Identity] Server sync failed:', err);
    }
  }, []);

  // ─── Save matrix to AsyncStorage ───
  const setMatrix = useCallback(async (newMatrix: IdentityMatrix) => {
    try {
      await AsyncStorage?.setItem?.(IDENTITY_STORAGE_KEY, JSON.stringify(newMatrix));
      setMatrixState(newMatrix);
    } catch (err) {
      console.error('[Identity] Failed to save matrix:', err);
      // Still update state even if storage fails
      setMatrixState(newMatrix);
    }
  }, []);

  // ─── Save auth token ───
  const setToken = useCallback(async (newToken: string) => {
    try {
      await AsyncStorage?.setItem?.(AUTH_TOKEN_KEY, newToken);
      setTokenState(newToken);
      // Fetch matrix from server after setting token
      await fetchMatrixFromServer(newToken);
    } catch (err) {
      console.error('[Identity] Failed to save token:', err);
      setTokenState(newToken);
    }
  }, [fetchMatrixFromServer]);

  // ─── Clear all identity data ───
  const clearIdentity = useCallback(async () => {
    try {
      await AsyncStorage?.multiRemove?.([IDENTITY_STORAGE_KEY, AUTH_TOKEN_KEY]);
    } catch (err) {
      console.warn('[Identity] Clear failed:', err);
    }
    setMatrixState(null);
    setTokenState(null);
  }, []);

  const value: IdentityContextType = {
    matrix,
    token,
    isLoading,
    isAuthenticated: !!token,
    needsOnboarding: !matrix,
    setMatrix,
    setToken,
    clearIdentity,
    fetchMatrixFromServer,
  };

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

// ─── Hook ───
export function useIdentity() {
  const ctx = useContext(IdentityContext);
  // V.14: Always return a safe object even if context is missing
  return ctx ?? {
    matrix: null,
    token: null,
    isLoading: false,
    isAuthenticated: false,
    needsOnboarding: true,
    setMatrix: async () => {},
    setToken: async () => {},
    clearIdentity: async () => {},
    fetchMatrixFromServer: async () => {},
  };
}
