import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

export default function NewAccount() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ type: 'invoice', title: '', party: '', amount: '', status: 'pending', date: '', notes: '' });

  const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    const amt = parseFloat(f.amount);
    if (!f.title.trim() || Number.isNaN(amt)) { setErr('Title & valid amount required'); return; }
    setErr(null); setBusy(true);
    try { await api.post('/accounts', { ...f, title: f.title.trim(), amount: amt }); router.back(); }
    catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-account">
      <ScreenHeader title="New Entry" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body}>
          <OptionRow label="Type" options={['invoice', 'expense']} value={f.type} onChange={(v) => setF(p => ({ ...p, type: v }))} testID="type" />
          <FormInput label="Title*" value={f.title} onChangeText={set('title')} placeholder="e.g. INV-001, Rent" testID="in-title" />
          <FormInput label="Party" value={f.party} onChangeText={set('party')} placeholder="Customer / Vendor" testID="in-party" />
          <FormInput label="Amount (₹)*" value={f.amount} onChangeText={set('amount')} placeholder="10000" keyboardType="numeric" testID="in-amt" />
          <FormInput label="Date" value={f.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" testID="in-date" />
          <OptionRow label="Status" options={['pending', 'paid']} value={f.status} onChange={(v) => setF(p => ({ ...p, status: v }))} testID="status" />
          <FormInput label="Notes" value={f.notes} onChangeText={set('notes')} placeholder="Any remarks" multiline testID="in-notes" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Save Entry" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({ body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl } });
