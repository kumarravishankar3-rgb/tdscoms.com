import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, radius, font } from './theme';
import { api, tokenStore } from './api';

export const MAX_ATTACH_BYTES = 10 * 1024 * 1024;
export const humanFileSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

export type Attachment = { path?: string; name: string; size?: number; content_type?: string; uploaded_at?: string; uri?: string; type?: string; pending?: boolean };

type Props = {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  // If oid provided, uploads/deletes go directly to server.
  // If not provided, files are queued in local state to be uploaded after save.
  voucherKind?: 'invoices' | 'expenses' | 'income';
  oid?: string;
  title?: string;
  hint?: string;
};

export const AttachmentsSection: React.FC<Props> = ({ attachments, onChange, voucherKind, oid, title = 'Attachments', hint = 'PDF / Image / Doc etc. • Max 10 MB per file' }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canServer = !!(voucherKind && oid);

  const pick = async () => {
    setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);
      const next: Attachment[] = [...attachments];
      for (const a of res.assets) {
        if (a.size && a.size > MAX_ATTACH_BYTES) {
          setErr(`"${a.name}" is ${humanFileSize(a.size)}. Max is 10 MB per file.`);
          continue;
        }
        if (canServer) {
          try {
            const updated: any = await api.uploadVoucherFile(voucherKind!, oid!, {
              uri: a.uri, name: a.name || 'file', type: a.mimeType || 'application/octet-stream',
            });
            if (Array.isArray(updated?.attachments)) {
              onChange(updated.attachments);
              continue;
            }
          } catch (e: any) { setErr(e?.message || `Failed uploading ${a.name}`); continue; }
        }
        next.push({ name: a.name || 'file', size: a.size, uri: a.uri, type: a.mimeType || 'application/octet-stream', pending: true });
      }
      if (!canServer) onChange(next);
    } catch (e: any) {
      Alert.alert('Attachment failed', e?.message || 'Try again');
    } finally { setBusy(false); }
  };

  const remove = async (idx: number) => {
    const a = attachments[idx];
    if (a.pending || !canServer || !a.path) {
      const next = [...attachments]; next.splice(idx, 1); onChange(next);
      return;
    }
    try {
      const updated: any = await api.deleteVoucherFile(voucherKind!, oid!, a.path!);
      onChange(updated?.attachments || []);
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
  };

  const open = async (a: Attachment) => {
    if (a.pending && a.uri) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(a.uri, '_blank');
      return;
    }
    if (!a.path) return;
    const token = await tokenStore.get();
    const url = `${api.base}/api/files/${a.path}?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank');
    else { const Linking = await import('expo-linking'); await Linking.openURL(url); }
  };

  const iconFor = (a: Attachment) => {
    const ct = (a.content_type || a.type || '').toLowerCase();
    const nm = (a.name || '').toLowerCase();
    if (ct.includes('image') || /\.(png|jpg|jpeg|webp|gif)$/i.test(nm)) return 'image';
    if (ct.includes('pdf') || nm.endsWith('.pdf')) return 'document-text';
    if (nm.endsWith('.xlsx') || nm.endsWith('.xls') || nm.endsWith('.csv')) return 'grid';
    if (nm.endsWith('.doc') || nm.endsWith('.docx')) return 'document';
    return 'document-attach';
  };
  const iconColorFor = (a: Attachment) => {
    const nm = (a.name || '').toLowerCase(); const ct = (a.content_type || a.type || '').toLowerCase();
    if (ct.includes('image') || /\.(png|jpg|jpeg|webp|gif)$/i.test(nm)) return '#7C3AED';
    if (ct.includes('pdf') || nm.endsWith('.pdf')) return '#DC2626';
    if (nm.endsWith('.xlsx') || nm.endsWith('.xls') || nm.endsWith('.csv')) return '#059669';
    return colors.brandPrimary;
  };

  return (
    <View style={styles.wrap} testID="attach-section">
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{attachments.length} file{attachments.length === 1 ? '' : 's'} • {hint}</Text>
        </View>
        <Pressable testID="attach-add" onPress={pick} disabled={busy} style={[styles.addBtn, busy && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator size="small" color="#FFF" /> : (<>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.addTxt}>Add</Text>
          </>)}
        </Pressable>
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {attachments.length === 0 ? (
        <Pressable onPress={pick} style={styles.empty}>
          <Ionicons name="cloud-upload-outline" size={26} color={colors.brandPrimary} />
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: font.sm }}>Tap to attach files (PDF / Image / Doc)</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8 }}>
          {attachments.map((a, i) => (
            <View key={(a.path || a.uri || a.name) + i} style={styles.row} testID={`attach-${i}`}>
              <View style={[styles.icon, { backgroundColor: iconColorFor(a) + '22' }]}>
                <Ionicons name={iconFor(a)} size={20} color={iconColorFor(a)} />
              </View>
              <Pressable style={{ flex: 1 }} onPress={() => open(a)}>
                <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.meta}>
                  {a.size ? humanFileSize(a.size) : ''}{a.pending ? ' • Will upload on save' : ''}
                </Text>
              </Pressable>
              <Pressable onPress={() => remove(i)} hitSlop={8} testID={`attach-del-${i}`}>
                <Ionicons name="close-circle" size={22} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#111827', fontWeight: '800', fontSize: font.base },
  hint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  addTxt: { color: '#FFF', fontWeight: '800' },
  err: { color: colors.error, fontSize: 12 },
  empty: { alignItems: 'center', padding: 16, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: '#F9FAFB' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: '#F9FAFB', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#111827', fontWeight: '700', fontSize: font.sm },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
