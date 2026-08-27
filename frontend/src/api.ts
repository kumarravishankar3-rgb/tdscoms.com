import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = 'triveni_session_token';

let inMemoryToken: string | null = null;

export const tokenStore = {
  async get(): Promise<string | null> {
    if (inMemoryToken) return inMemoryToken;
    if (Platform.OS === 'web') {
      const t = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
      inMemoryToken = t;
      return t;
    }
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    inMemoryToken = t;
    return t;
  },
  async set(token: string) {
    inMemoryToken = token;
    if (Platform.OS === 'web') {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
  },
  async clear() {
    inMemoryToken = null;
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  },
};

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await tokenStore.get();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body: any) => request<T>(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(p: string, body: any) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(p: string, body: any) => request<T>(p, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
  base: BASE,
  uploadTenderFile: async (tid: string, file: { uri: string; name: string; type: string }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${BASE}/api/tenders/${tid}/upload`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return res.json();
  },
};

export type UserRole = 'admin' | 'manager' | 'employee';
export interface AppUser {
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  picture?: string | null;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
}
