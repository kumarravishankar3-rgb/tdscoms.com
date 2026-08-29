import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

const today = () => new Date().toISOString().slice(0, 10);

export default function NewExpense() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>({ expense_categories: [], payment_modes: ['cash', 'bank', 'upi', 'cheque'] });
  const [banks, setBanks] = useState<any[]>([]);
  const [f, setF] = useState({ date: today(), category: '', amount: '', payment_mode: 'cash', bank_account_id: '', vendor: '', description: '' });
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [m, b] = await Promise.all([api.get<any>('/accounting/meta'), api.get<any[]>('/bank-accounts')]);
        setMeta(m); setBanks(b);
        if (m.expense_categories?.[0]) setF(p => ({ ...p, category: m.expense_categories[0] }));
      } catch {}
    })();
  }, []);

  const save = async () => {
    const amt = parseFloat(f.amount);
    if (Number.isNaN(amt) || amt <= 0) { setErr('Valid amount required'); return; }
    if (!f.category) { setErr('Category required'); return; }
    setErr(null); setBusy(true);
    try {
      await api.post('/expenses', {
        date: f.date, category: f.category, amount: amt,
        payment_mode: f.payment_mode,
        bank_account_id: f.payment_mode !== 'cash' ? (f.bank_account_id || null) : null,
        vendor: f.vendor || null, description: f.description || null,
      });
      router.back();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-expense">
      <ScreenHeader title="Add Expense" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
          <FormInput label="Date" value={f.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" testID="in-date" />
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(meta.expense_categories || []).map((c: string) => (
                <Pressable key={c} onPress={() => setF(p => ({ ...p, category: c }))} style={[styles.chip, f.category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, f.category === c && { color: colors.onBrandPrimary }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FormInput label="Amount (₹) *" value={f.amount} onChangeText={set('amount')} keyboardType="numeric" testID="in-amount" />
          <OptionRow label="Payment Mode" options={meta.payment_modes || ['cash', 'bank', 'upi', 'cheque']} value={f.payment_mode} onChange={v => setF(p => ({ ...p, payment_mode: v }))} testID="mode" />
          {f.payment_mode !== 'cash' && banks.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Bank Account</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {banks.map(b => (
                  <Pressable key={b.id} onPress={() => setF(p => ({ ...p, bank_account_id: b.id }))} style={[styles.chip, f.bank_account_id === b.id && styles.chipActive]}>
                    <Text style={[styles.chipText, f.bank_account_id === b.id && { color: colors.onBrandPrimary }]}>{b.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <FormInput label="Vendor / Paid To" value={f.vendor} onChangeText={set('vendor')} testID="in-vendor" />
          <FormInput label="Description" value={f.description} onChangeText={set('description')} multiline testID="in-desc" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: font.sm, textAlign: 'center' }}>Expense will be marked as Pending. Accounts/Admin can verify & approve later.</Text>
          <PrimaryButton label="Save Expense" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: font.sm, fontWeight: '600' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurface, fontWeight: '600' },
});
