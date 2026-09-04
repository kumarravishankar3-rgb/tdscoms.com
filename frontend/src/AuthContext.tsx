import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api, tokenStore, AppUser } from './api';

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role?: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const usedSessionIds = useRef<Set<string>>(new Set());
  const capturedUrl = useRef<string | null>(null);

  const exchange = useCallback(async (session_id: string) => {
    if (usedSessionIds.current.has(session_id)) return;
    usedSessionIds.current.add(session_id);
    const resp = await api.post<{ session_token: string; user: AppUser }>('/auth/session', { session_id });
    await tokenStore.set(resp.session_token);
    setUser(resp.user);
  }, []);

  const checkExisting = useCallback(async () => {
    try {
      const me = await api.get<AppUser>('/auth/me');
      setUser(me);
    } catch {
      await tokenStore.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      capturedUrl.current = url;
      const sid = extractSessionId(url);
      if (sid) exchange(sid).catch(() => {});
    });
    return () => sub.remove();
  }, [exchange]);

  useEffect(() => {
    (async () => {
      try {
        // Web: process session_id in URL first
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const sid = extractSessionId(window.location.hash) || extractSessionId(window.location.search);
          if (sid) {
            try {
              await exchange(sid);
              // clean URL
              const cleanHash = window.location.hash.replace(/[?#&]?session_id=[^&#]+/, '');
              const cleanSearch = window.location.search.replace(/([?&])session_id=[^&]+&?/, '$1').replace(/[?&]$/, '');
              window.history.replaceState(window.history.state, '', window.location.pathname + cleanSearch + cleanHash);
            } catch (e) {}
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            try { await exchange(sid); } catch (e) {}
          }
        }
        const token = await tokenStore.get();
        if (token) await checkExisting();
      } finally {
        setLoading(false);
      }
    })();
  }, [exchange, checkExisting]);

  const loginEmail = useCallback(async (email: string, password: string) => {
    const resp = await api.post<{ session_token: string; user: AppUser }>('/auth/login', { email, password });
    await tokenStore.set(resp.session_token);
    setUser(resp.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string, role = 'employee') => {
    const resp = await api.post<{ session_token: string; user: AppUser }>('/auth/signup', { email, password, name, role });
    await tokenStore.set(resp.session_token);
    setUser(resp.user);
  }, []);

  const loginGoogle = useCallback(async () => {
    const redirect = Platform.OS === 'web'
      ? window.location.origin + '/'
      : Linking.createURL('');
    const rawAuthBase = process.env.EXPO_PUBLIC_AUTH_BASE_URL;
    if (!rawAuthBase) {
      throw new Error('EXPO_PUBLIC_AUTH_BASE_URL is not configured. Set it in /app/frontend/.env.');
    }
    const authBase = rawAuthBase.replace(/\/$/, '');
    const authUrl = `${authBase}/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === 'web') {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    let sid: string | null = null;
    if ((result as any).url) sid = extractSessionId((result as any).url);
    if (!sid && capturedUrl.current) sid = extractSessionId(capturedUrl.current);
    if (!sid) {
      const initial = await Linking.getInitialURL();
      sid = extractSessionId(initial);
    }
    if (sid) await exchange(sid);
  }, [exchange]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch {}
    await tokenStore.clear();
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.del('/auth/me');
    await tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    await checkExisting();
  }, [checkExisting]);

  const value = useMemo(() => ({ user, loading, loginEmail, signup, loginGoogle, logout, deleteAccount, refresh }), [user, loading, loginEmail, signup, loginGoogle, logout, deleteAccount, refresh]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};
