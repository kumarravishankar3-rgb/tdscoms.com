import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';
import { AttachmentsSection, Attachment } from '@/src/AttachmentsSection';

const today = () => new Date().toISOString().slice(0, 10);

export default function NewIncome() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>({ income_categories: [], payment_modes: ['cash', 'bank', 'upi', 'cheque'] });
  const [banks, setBanks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [f, setF] = useState({
    date: today(), client_id: '', client_name: '', client_mobile: '',
    service_category: '', service_name: '', amount: '',
    payment_mode: 'cash', bank_account_id: '',
    employee_id: '', employee_name: '', remarks: '',
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [m, b, c, e] = await Promise.all([api.get<any>('/accounting/meta'), api.get<any[]>('/bank-accounts'), api.get<any[]>('/customers'), api.get<any[]>('/employees')]);
        setMeta(m); setBanks(b); setClients(c); setEmployees(e);
        if (m.income_categories?.[0]) setF(p => ({ ...p, service_category: m.income_categories[0] }));
      } catch {}
    })();
  }, []);

  const save = async () => {
    const amt = parseFloat(f.amount);
    if (!f.client_name.trim() || Number.isNaN(amt) || amt <= 0) { setErr('Client name and valid amount required'); return; }
    if (!f.service_category) { setErr('Service category required'); return; }
    setErr(null); setBusy(true);
    try {
      const created: any = await api.post('/income', {
        date: f.date,
        client_id: f.client_id || null,
        client_name: f.client_name.trim(),
        client_mobile: f.client_mobile || null,
        service_category: f.service_category,
        service_name: f.service_name || null,
        amount: amt,
        payment_mode: f.payment_mode,
        bank_account_id: f.payment_mode !== 'cash' ? (f.bank_account_id || null) : null,
        employee_id: f.employee_id || null,
        employee_name: f.employee_name || null,
        remarks: f.remarks || null,
      });
      for (const a of attachments) {
        if (a.pending && a.uri) {
          try { await api.uploadVoucherFile('income', created.id, { uri: a.uri, name: a.name, type: a.type || 'application/octet-stream' }); } catch {}
        }
      }
      router.back();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-income">
      <ScreenHeader title="Add Income" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
          <FormInput label="Date" value={f.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" testID="in-date" />
          <FormInput label="Client Name *" value={f.client_name} onChangeText={set('client_name')} testID="in-client" />
          <FormInput label="Mobile" value={f.client_mobile} onChangeText={set('client_mobile')} keyboardType="phone-pad" testID="in-mobile" />
          {clients.length > 0 && (
            <View>
              <Text style={styles.muted}>Or pick existing customer:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
                {clients.slice(0, 20).map(c => (
                  <Pressable key={c.id} onPress={() => setF(p => ({ ...p, client_id: c.id, client_name: c.name, client_mobile: c.mobile || '' }))} style={[styles.chip, f.client_id === c.id && styles.chipActive]}>
                    <Text style={[styles.chipText, f.client_id === c.id && { color: colors.onBrandPrimary }]}>{c.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Service Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(meta.income_categories || []).map((c: string) => (
                <Pressable key={c} onPress={() => setF(p => ({ ...p, service_category: c }))} style={[styles.chip, f.service_category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, f.service_category === c && { color: colors.onBrandPrimary }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FormInput label="Service Name (optional)" value={f.service_name} onChangeText={set('service_name')} testID="in-svcname" />
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
          {employees.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Received by (Employee)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {employees.map(e => (
                  <Pressable key={e.id} onPress={() => setF(p => ({ ...p, employee_id: e.id, employee_name: e.name }))} style={[styles.chip, f.employee_id === e.id && styles.chipActive]}>
                    <Text style={[styles.chipText, f.employee_id === e.id && { color: colors.onBrandPrimary }]}>{e.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <FormInput label="Remarks" value={f.remarks} onChangeText={set('remarks')} multiline testID="in-remarks" />
          <AttachmentsSection attachments={attachments} onChange={setAttachments} title="Receipt / Proof Attachments" hint="Receipt / bank slip / photos • Max 10 MB per file" />
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Save Income" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: font.sm, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurface, fontWeight: '600' },
});
