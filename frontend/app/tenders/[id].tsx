import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, radius, font } from '@/src/theme';
import { api, tokenStore } from '@/src/api';
import { Card, PrimaryButton, ScreenLoader, StatusBadge, SecondaryButton } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

export default function TenderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try { setT(await api.get<any>(`/tenders/${id}`)); } catch {}
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      const updated = await api.uploadTenderFile(String(id), { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' });
      setT(updated);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Try again');
    } finally { setUploading(false); }
  };

  const openFile = async () => {
    if (!t?.file_path) return;
    const token = await tokenStore.get();
    const url = `${api.base}/api/files/${t.file_path}?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      const Linking = await import('expo-linking');
      await Linking.openURL(url);
    }
  };

  if (!t) return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Tender" />
      <ScreenLoader />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="tender-detail">
      <ScreenHeader title="Tender" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={styles.title}>{t.title}</Text>
            <StatusBadge status={t.status} />
          </View>
          {t.reference_no ? <Row label="Reference" value={t.reference_no} /> : null}
          {t.department ? <Row label="Department" value={t.department} /> : null}
          {t.value != null ? <Row label="Value" value={`₹ ${Number(t.value).toLocaleString('en-IN')}`} /> : null}
          {t.submission_deadline ? <Row label="Deadline" value={t.submission_deadline} /> : null}
          {t.description ? <Row label="Description" value={t.description} /> : null}
        </Card>

        <Card>
          <Text style={styles.section}>Document</Text>
          {t.file_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
              <View style={styles.fileIcon}><Ionicons name="document-attach" size={22} color={colors.brandPrimary} /></View>
              <Text style={{ flex: 1, color: colors.onSurface, fontWeight: '600' }} numberOfLines={2}>{t.file_name}</Text>
              <SecondaryButton label="Open" onPress={openFile} testID="open-file" />
            </View>
          ) : (
            <Text style={styles.muted}>No document uploaded yet.</Text>
          )}
          <PrimaryButton label={t.file_name ? 'Replace document' : 'Upload document'} icon="cloud-upload" onPress={pickAndUpload} loading={uploading} testID="upload-btn" style={{ marginTop: spacing.md }} />
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
  title: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface, flex: 1, paddingRight: spacing.md },
  section: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, marginTop: spacing.sm },
  fileIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
});
