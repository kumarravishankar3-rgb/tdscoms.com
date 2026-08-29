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
  const [f, setF] = useState({
    name_of_work: '', estimated_cost: '', contractor_class: '',
    nit_no: '', department: '', district: '', last_date: '',
    status: 'open', description: '',
  });
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name_of_work.trim()) { setErr('Name of Work is required'); return; }
    setErr(null); setBusy(true);
    try {
      const est = f.estimated_cost ? parseFloat(f.estimated_cost) : null;
      const created = await api.post<any>('/tenders', {
        name_of_work: f.name_of_work.trim(),
        estimated_cost: est,
        contractor_class: f.contractor_class || null,
        nit_no: f.nit_no || null,
        department: f.department || null,
        district: f.district || null,
        last_date: f.last_date || null,
        status: f.status,
        description: f.description || null,
      });
      router.replace(`/tenders/${created.id}` as any);
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-tender">
      <ScreenHeader title="New Tender" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Tender ID (TND-0001, TND-0002…) auto-generates on save. Upload NIT copy, BOQ and other documents on the next screen.</Text>
          </View>
          <FormInput label="Name of Work *" value={f.name_of_work} onChangeText={set('name_of_work')} placeholder="Construction of…" multiline testID="in-work" />
          <FormInput label="Estimated Cost (₹)" value={f.estimated_cost} onChangeText={set('estimated_cost')} placeholder="e.g. 2500000" keyboardType="numeric" testID="in-cost" />
          <FormInput label="Contractor Class" value={f.contractor_class} onChangeText={set('contractor_class')} placeholder="e.g. Class A / Class-I" testID="in-class" />
          <FormInput label="NIT No." value={f.nit_no} onChangeText={set('nit_no')} placeholder="NIT reference number" testID="in-nit" />
          <FormInput label="Department" value={f.department} onChangeText={set('department')} placeholder="Issuing department" testID="in-dept" />
          <FormInput label="District" value={f.district} onChangeText={set('district')} placeholder="District" testID="in-dist" />
          <FormInput label="Last Date of Tender" value={f.last_date} onChangeText={set('last_date')} placeholder="YYYY-MM-DD" testID="in-last" />
          <OptionRow label="Status" options={['open', 'submitted', 'awarded', 'lost']} value={f.status} onChange={(v) => setF(p => ({ ...p, status: v }))} testID="status" />
          <FormInput label="Description" value={f.description} onChangeText={set('description')} placeholder="Scope, remarks…" multiline testID="in-desc" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Create Tender" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  notice: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.brandTertiary },
  noticeText: { color: colors.onBrandTertiary, fontSize: 13 },
});
