import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, radius, font } from '@/src/theme';
import { api, tokenStore } from '@/src/api';
import { Card, PrimaryButton, ScreenLoader, SecondaryButton } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

const MAX_BYTES = 10 * 1024 * 1024;
const humanSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setC(await api.get<any>(`/customers/${id}`)); } catch {}
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickAndUpload = async () => {
    setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (res.canceled || !res.assets?.length) return;
      setUploading(true);
      let updated: any = c;
      for (const asset of res.assets) {
        if (asset.size && asset.size > MAX_BYTES) {
          setErr(`"${asset.name}" is ${humanSize(asset.size)}. Max is 10 MB per file.`);
          continue;
        }
        try {
          updated = await api.uploadCustomerFile(String(id), { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' });
        } catch (e: any) {
          setErr(e?.message || `Failed uploading ${asset.name}`);
        }
      }
      if (updated) setC(updated);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Try again');
    } finally { setUploading(false); }
  };

  const removeAttachment = async (path: string) => {
    try {
      const updated = await api.del<any>(`/customers/${id}/attachments?path=${encodeURIComponent(path)}`);
      setC(updated);
    } catch (e: any) { setErr(e?.message || 'Failed'); }
  };

  const openFile = async (path: string) => {
    const token = await tokenStore.get();
    const url = `${api.base}/api/files/${path}?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      const Linking = await import('expo-linking');
      await Linking.openURL(url);
    }
  };

  if (!c) return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Customer" />
      <ScreenLoader />
    </View>
  );

  const attachments: any[] = c.attachments || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="customer-detail">
      <ScreenHeader title="Customer" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              {c.customer_code ? <Text style={styles.code}>{c.customer_code}</Text> : null}
            </View>
          </View>
          <Row label="Mobile" value={c.mobile} />
          <Row label="WhatsApp" value={c.whatsapp} />
          {c.email ? <Row label="Email" value={c.email} /> : null}
          <Row label="PAN" value={c.pan} />
          <Row label="Aadhar" value={c.aadhar} />
          {c.address ? <Row label="Address" value={c.address} /> : null}
          {c.gst_no ? <Row label="GST No." value={c.gst_no} /> : null}
          {c.dsc_serial_no ? <Row label="DSC Serial" value={c.dsc_serial_no} /> : null}
          {c.dsc_expired_date ? <Row label="DSC Expiry" value={c.dsc_expired_date} /> : null}
          {c.contractor_reg_no ? <Row label="Reg. No." value={c.contractor_reg_no} /> : null}
          {c.registration_class ? <Row label="Reg. Class" value={c.registration_class} /> : null}
          {c.registration_validity ? <Row label="Reg. Valid" value={c.registration_validity} /> : null}
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Attachments</Text>
              <Text style={styles.muted}>{attachments.length} file{attachments.length === 1 ? '' : 's'} • Max 10 MB each</Text>
            </View>
            <Pressable testID="add-file-btn" onPress={pickAndUpload} disabled={uploading} style={[styles.addBtn, uploading && { opacity: 0.6 }]}>
              <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.addBtnText}>{uploading ? 'Uploading…' : 'Add'}</Text>
            </Pressable>
          </View>

          {err ? <Text style={styles.err} testID="file-error">{err}</Text> : null}

          {attachments.length === 0 ? (
            <View style={styles.emptySlot} testID="attachments-empty">
              <Ionicons name="cloud-upload-outline" size={28} color={colors.muted} />
              <Text style={styles.muted}>No files uploaded yet. Tap Add to upload documents.</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {attachments.map((a, i) => (
                <View key={a.path} style={styles.fileSlot} testID={`file-slot-${i}`}>
                  <View style={styles.fileIcon}>
                    <Ionicons name={a.content_type?.includes('image') ? 'image' : a.content_type?.includes('pdf') ? 'document-text' : 'document'} size={20} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.fileMeta}>{humanSize(a.size)} • {new Date(a.uploaded_at).toLocaleDateString()}</Text>
                  </View>
                  <Pressable testID={`open-${i}`} onPress={() => openFile(a.path)} style={styles.iconBtn} hitSlop={10}>
                    <Ionicons name="eye-outline" size={20} color={colors.brandPrimary} />
                  </Pressable>
                  <Pressable testID={`remove-${i}`} onPress={() => removeAttachment(a.path)} style={styles.iconBtn} hitSlop={10}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flexDirection: 'row', marginTop: spacing.md, gap: spacing.md }}>
    <Text style={{ color: colors.muted, width: 100, fontWeight: '600' }}>{label}</Text>
    <Text style={{ flex: 1, color: colors.onSurface }}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  name: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
  code: { color: colors.brandPrimary, fontWeight: '700', marginTop: 4 },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  addBtnText: { color: colors.onBrandPrimary, fontWeight: '700' },
  emptySlot: { marginTop: spacing.md, padding: spacing.xl, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary },
  fileSlot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fileIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  fileName: { color: colors.onSurface, fontWeight: '600' },
  fileMeta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.error, marginTop: spacing.sm, fontSize: font.sm },
});
