import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

export default function NewTender() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', reference_no: '', department: '', value: '', submission_deadline: '', status: 'open', description: '' });
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) { setErr('Title is required'); return; }
    setErr(null); setBusy(true);
    try {
      const value = f.value ? parseFloat(f.value) : null;
      const created = await api.post<any>('/tenders', { ...f, title: f.title.trim(), value });
      router.replace(`/tenders/${created.id}` as any);
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-tender">
      <ScreenHeader title="New Tender" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body}>
          <FormInput label="Title*" value={f.title} onChangeText={set('title')} placeholder="Tender title" testID="in-title" />
          <FormInput label="Reference No." value={f.reference_no} onChangeText={set('reference_no')} placeholder="e.g. GEM/2025/…" testID="in-ref" />
          <FormInput label="Department" value={f.department} onChangeText={set('department')} placeholder="Issuing dept." testID="in-dept" />
          <FormInput label="Value (₹)" value={f.value} onChangeText={set('value')} placeholder="Estimated value" keyboardType="numeric" testID="in-value" />
          <FormInput label="Submission Deadline" value={f.submission_deadline} onChangeText={set('submission_deadline')} placeholder="YYYY-MM-DD" testID="in-deadline" />
          <OptionRow label="Status" options={['open', 'submitted', 'awarded', 'lost']} value={f.status} onChange={(v) => setF(p => ({ ...p, status: v }))} testID="status" />
          <FormInput label="Description" value={f.description} onChangeText={set('description')} placeholder="Notes and scope" multiline testID="in-desc" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Create Tender" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({ body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl } });
