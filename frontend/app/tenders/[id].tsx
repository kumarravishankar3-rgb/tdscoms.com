import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, radius, font } from '@/src/theme';
import { api, tokenStore } from '@/src/api';
import { Card, PrimaryButton, ScreenLoader, StatusBadge, SecondaryButton } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

const MAX = 25 * 1024 * 1024;
const humanSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

export default function TenderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setT(await api.get<any>(`/tenders/${id}`)); } catch {}
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickAndUpload = async (slot: 'nit-copy' | 'boq' | 'documents', multiple = false) => {
    setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple });
      if (res.canceled || !res.assets?.length) return;
      setBusy(slot);
      let updated: any = t;
      for (const asset of res.assets) {
        if (asset.size && asset.size > MAX) { setErr(`"${asset.name}" > 25 MB. Skipped.`); continue; }
        try { updated = await api.uploadTenderSlot(String(id), slot, { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' }); }
        catch (e: any) { setErr(e?.message || 'Upload failed'); }
        if (!multiple) break;
      }
      if (updated) setT(updated);
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
    finally { setBusy(null); }
  };

  const removeDoc = async (path: string) => {
    try { const u = await api.del<any>(`/tenders/${id}/documents?path=${encodeURIComponent(path)}`); setT(u); } catch {}
  };

  const openFile = async (path: string) => {
    const token = await tokenStore.get();
    const url = `${api.base}/api/files/${path}?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else { const Linking = await import('expo-linking'); await Linking.openURL(url); }
  };

  if (!t) return (<View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}><ScreenHeader title="Tender" /><ScreenLoader /></View>);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="tender-detail">
      <ScreenHeader title={t.tender_code || 'Tender'} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.code}>{t.tender_code}</Text>
              <Text style={styles.title}>{t.name_of_work || t.title}</Text>
            </View>
            <StatusBadge status={t.status} />
          </View>
          {t.estimated_cost != null ? <Row label="Estimated Cost" value={`₹ ${Number(t.estimated_cost).toLocaleString('en-IN')}`} /> : null}
          {t.contractor_class ? <Row label="Contractor Class" value={t.contractor_class} /> : null}
          {t.nit_no ? <Row label="NIT No." value={t.nit_no} /> : null}
          {t.department ? <Row label="Department" value={t.department} /> : null}
          {t.district ? <Row label="District" value={t.district} /> : null}
          {t.last_date ? <Row label="Last Date" value={t.last_date} /> : null}
          {t.description ? <Row label="Description" value={t.description} /> : null}
        </Card>

        <SingleFileCard
          title="NIT Ki Copy"
          icon="document-text"
          file={t.nit_copy}
          busy={busy === 'nit-copy'}
          onPick={() => pickAndUpload('nit-copy', false)}
          onOpen={() => openFile(t.nit_copy.path)}
        />
        <SingleFileCard
          title="BOQ"
          icon="list"
          file={t.boq}
          busy={busy === 'boq'}
          onPick={() => pickAndUpload('boq', false)}
          onOpen={() => openFile(t.boq.path)}
        />

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Other Documents</Text>
              <Text style={styles.muted}>{(t.other_documents || []).length} file(s) • Max 25 MB each</Text>
            </View>
            <Pressable testID="add-docs" onPress={() => pickAndUpload('documents', true)} disabled={busy === 'documents'} style={[styles.smallAdd, busy === 'documents' && { opacity: 0.6 }]}>
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.smallAddText}>{busy === 'documents' ? '…' : 'Add'}</Text>
            </Pressable>
          </View>
          {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text> : null}
          {(t.other_documents || []).length === 0 ? (
            <View style={styles.emptySlot}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.muted} />
              <Text style={styles.muted}>No documents yet.</Text>
            </View>
          ) : (
            <View style={{ gap: 6, marginTop: spacing.md }}>
              {t.other_documents.map((a: any) => (
                <View key={a.path} style={styles.fileSlot}>
                  <View style={styles.fileIcon}><Ionicons name={a.content_type?.includes('image') ? 'image' : 'document'} size={18} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurface, fontWeight: '600' }} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.muted}>{humanSize(a.size)}</Text>
                  </View>
                  <Pressable onPress={() => openFile(a.path)} style={styles.iconBtn}><Ionicons name="eye-outline" size={18} color={colors.brandPrimary} /></Pressable>
                  <Pressable onPress={() => removeDoc(a.path)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const SingleFileCard: React.FC<{ title: string; icon: any; file: any; busy: boolean; onPick: () => void; onOpen: () => void }>
  = ({ title, icon, file, busy, onPick, onOpen }) => (
  <Card>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={styles.slotIcon}><Ionicons name={icon} size={22} color={colors.brandPrimary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.muted}>{file ? file.name : 'Not uploaded'}</Text>
      </View>
    </View>
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
      {file ? <SecondaryButton label="Open" icon="eye-outline" onPress={onOpen} style={{ flex: 1 }} /> : null}
      <PrimaryButton label={file ? 'Replace' : 'Upload'} icon="cloud-upload" onPress={onPick} loading={busy} style={{ flex: 1 }} />
    </View>
  </Card>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flexDirection: 'row', marginTop: spacing.sm, gap: spacing.md }}>
    <Text style={{ color: colors.muted, width: 130, fontWeight: '600' }}>{label}</Text>
    <Text style={{ flex: 1, color: colors.onSurface }}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  code: { color: colors.brandPrimary, fontWeight: '800', fontSize: font.sm, letterSpacing: 0.4 },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface, marginTop: 4 },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  slotIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  smallAdd: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  smallAddText: { color: colors.onBrandPrimary, fontWeight: '700', fontSize: font.sm },
  emptySlot: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', gap: 6 },
  fileSlot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fileIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
