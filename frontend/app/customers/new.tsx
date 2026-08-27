import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

export default function NewCustomer() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', gst: '', pan: '', address: '', notes: '' });

  const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { setErr('Name is required'); return; }
    setErr(null); setBusy(true);
    try {
      await api.post('/customers', { ...f, name: f.name.trim() });
      router.back();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-customer">
      <ScreenHeader title="Add Customer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body}>
          <FormInput label="Contact Name*" value={f.name} onChangeText={set('name')} placeholder="Full name" testID="in-name" />
          <FormInput label="Company" value={f.company} onChangeText={set('company')} placeholder="Company name" testID="in-company" />
          <FormInput label="Email" value={f.email} onChangeText={set('email')} placeholder="email@company.com" keyboardType="email-address" testID="in-email" />
          <FormInput label="Phone" value={f.phone} onChangeText={set('phone')} placeholder="+91..." keyboardType="phone-pad" testID="in-phone" />
          <FormInput label="GST Number" value={f.gst} onChangeText={set('gst')} placeholder="GSTIN" testID="in-gst" />
          <FormInput label="PAN" value={f.pan} onChangeText={set('pan')} placeholder="AAAAA0000A" testID="in-pan" />
          <FormInput label="Address" value={f.address} onChangeText={set('address')} placeholder="Full address" multiline testID="in-address" />
          <FormInput label="Notes" value={f.notes} onChangeText={set('notes')} placeholder="Any remarks" multiline testID="in-notes" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Save Customer" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
});
