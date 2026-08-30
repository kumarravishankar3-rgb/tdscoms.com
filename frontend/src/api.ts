import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

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
    let msg: string;
    if (data && data.detail !== undefined) {
      msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } else if (data && data.message) {
      msg = String(data.message);
    } else {
      msg = `Request failed (${res.status})`;
    }
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
  uploadCustomerFile: async (cid: string, file: { uri: string; name: string; type: string }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${BASE}/api/customers/${cid}/attachments`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.detail) || `Upload failed (${res.status})`);
    return data;
  },
  // Generic voucher attachment upload. kind: 'invoices' | 'expenses' | 'income'
  uploadVoucherFile: async (kind: 'invoices' | 'expenses' | 'income', oid: string, file: { uri: string; name: string; type: string }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${BASE}/api/${kind}/${oid}/attachments`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail = data && data.detail;
      const msg = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `Upload failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  },
  deleteVoucherFile: async (kind: 'invoices' | 'expenses' | 'income', oid: string, path: string) => {
    const token = await tokenStore.get();
    const res = await fetch(`${BASE}/api/${kind}/${oid}/attachments?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.detail) || `Delete failed (${res.status})`);
    return data;
  },
  uploadEmployeePhoto: async (eid: string, file: { uri: string; name: string; type: string }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${BASE}/api/employees/${eid}/photo`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.detail) || `Upload failed (${res.status})`);
    return data;
  },
  createPunch: async (payload: { type: 'in' | 'out'; lat?: number; lng?: number; accuracy?: number; selfie: { uri: string; name: string; type: string } }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    form.append('type', payload.type);
    if (payload.lat != null) form.append('lat', String(payload.lat));
    if (payload.lng != null) form.append('lng', String(payload.lng));
    if (payload.accuracy != null) form.append('accuracy', String(payload.accuracy));
    if (Platform.OS === 'web') {
      const blob = await (await fetch(payload.selfie.uri)).blob();
      form.append('selfie', blob, payload.selfie.name);
    } else {
      form.append('selfie', { uri: payload.selfie.uri, name: payload.selfie.name, type: payload.selfie.type } as any);
    }
    const res = await fetch(`${BASE}/api/punches`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.detail) || `Punch failed (${res.status})`);
    return data;
  },
  uploadTaskFile: async (tid: string, file: { uri: string; name: string; type: string }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${BASE}/api/tasks/${tid}/attachments`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.detail) || `Upload failed (${res.status})`);
    return data;
  },
  uploadTenderSlot: async (tid: string, slot: 'nit-copy' | 'boq' | 'documents', file: { uri: string; name: string; type: string }) => {
    const token = await tokenStore.get();
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    }
    const res = await fetch(`${BASE}/api/tenders/${tid}/${slot}`, {
      method: 'POST',
      body: form as any,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.detail) || `Upload failed (${res.status})`);
    return data;
  },
};

export const captureSelfie = async (): Promise<{ uri: string; name: string; type: string } | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is required for face verification');
  const res = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.6,
    allowsEditing: false,
    mediaTypes: ['images'],
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.fileName || 'selfie.jpg', type: a.mimeType || 'image/jpeg' };
};

export const getCurrentLocation = async (): Promise<{ lat: number; lng: number; accuracy?: number }> => {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error('Location permission is required for punch-in');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || undefined };
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
