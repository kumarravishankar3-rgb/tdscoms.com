import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

export default function NewEmployee() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', email: '', phone: '', department: '', designation: '', role: 'employee', joining_date: '', salary: '' });
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !f.email.trim()) { setErr('Name and email are required'); return; }
    setErr(null); setBusy(true);
    try {
      const salary = f.salary ? parseFloat(f.salary) : null;
      await api.post('/employees', { ...f, name: f.name.trim(), email: f.email.trim(), salary });
      router.back();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-employee">
      <ScreenHeader title="Add Employee" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body}>
          <FormInput label="Name*" value={f.name} onChangeText={set('name')} placeholder="Full name" testID="in-name" />
          <FormInput label="Email*" value={f.email} onChangeText={set('email')} placeholder="name@triveni.com" keyboardType="email-address" testID="in-email" />
          <FormInput label="Phone" value={f.phone} onChangeText={set('phone')} placeholder="+91..." keyboardType="phone-pad" testID="in-phone" />
          <FormInput label="Department" value={f.department} onChangeText={set('department')} placeholder="e.g. Sales" testID="in-dept" />
          <FormInput label="Designation" value={f.designation} onChangeText={set('designation')} placeholder="e.g. Executive" testID="in-desig" />
          <OptionRow label="Role" options={['employee', 'manager', 'admin']} value={f.role} onChange={(v) => setF(p => ({ ...p, role: v }))} testID="role" />
          <FormInput label="Joining date" value={f.joining_date} onChangeText={set('joining_date')} placeholder="YYYY-MM-DD" testID="in-join" />
          <FormInput label="Salary (₹/mo)" value={f.salary} onChangeText={set('salary')} placeholder="50000" keyboardType="numeric" testID="in-salary" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Save Employee" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({ body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl } });
