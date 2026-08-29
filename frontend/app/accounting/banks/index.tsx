import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, EmptyState, ScreenLoader, PrimaryButton } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput } from '@/src/forms';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN')}`;
type F = { id?: string; name: string; bank_name: string; account_no: string; ifsc: string; opening_balance: string };
const empty: F = { name: '', bank_name: '', account_no: '', ifsc: '', opening_balance: '0' };

export default function BanksScreen() {
  const [list, setList] = useState<any[] | null>(null);
  const [showForm, setShow] = useState(false);
  const [f, setF] = useState<F>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { try { setList(await api.get<any[]>('/bank-accounts')); } catch { setList([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setF(empty); setErr(null); setShow(true); };
  const openEdit = (b: any) => { setF({ id: b.id, name: b.name, bank_name: b.bank_name, account_no: b.account_no, ifsc: b.ifsc || '', opening_balance: String(b.opening_balance || 0) }); setErr(null); setShow(true); };

  const save = async () => {
    if (!f.name.trim() || !f.bank_name.trim() || !f.account_no.trim()) { setErr('Name, bank, account number required'); return; }
    setBusy(true); setErr(null);
    try {
      const payload = { name: f.name.trim(), bank_name: f.bank_name.trim(), account_no: f.account_no.trim(), ifsc: f.ifsc || null, opening_balance: parseFloat(f.opening_balance || '0') || 0, is_active: true };
      if (f.id) await api.patch(`/bank-accounts/${f.id}`, payload);
      else await api.post('/bank-accounts', payload);
      setShow(false); await load();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  const remove = (b: any) => Alert.alert('Delete bank?', b.name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.del(`/bank-accounts/${b.id}`); await load(); } catch {} } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="banks-screen">
      <ScreenHeader title="Bank Accounts" right={(<Pressable testID="add-bank" onPress={openNew} style={styles.add}><Ionicons name="add" size={22} color={colors.onBrandPrimary} /></Pressable>)} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="banks-empty" icon="business-outline" title="No bank accounts" actionLabel="Add Bank" onAction={openNew} />
      ) : (
        <FlatList data={list} keyExtractor={i => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={styles.icon}><Ionicons name="business" size={20} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.muted}>{item.bank_name} • {item.account_no}</Text>
                  {item.ifsc ? <Text style={styles.muted}>IFSC: {item.ifsc}</Text> : null}
                  <Text style={styles.muted}>Opening: {inr(item.opening_balance)}</Text>
                </View>
                <Pressable onPress={() => openEdit(item)} style={styles.iconBtn}><Ionicons name="create-outline" size={20} color={colors.brandPrimary} /></Pressable>
                <Pressable onPress={() => remove(item)} style={styles.iconBtn}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
              </View>
            </Card>
          )} />
      )}
      <Modal transparent visible={showForm} animationType="slide" onRequestClose={() => setShow(false)}>
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{f.id ? 'Edit Bank' : 'New Bank'}</Text>
                <Pressable onPress={() => setShow(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
                <FormInput label="Nickname *" value={f.name} onChangeText={v => setF(p => ({ ...p, name: v }))} placeholder="e.g. Current A/c" testID="in-name" />
                <FormInput label="Bank Name *" value={f.bank_name} onChangeText={v => setF(p => ({ ...p, bank_name: v }))} placeholder="SBI, HDFC…" testID="in-bank" />
                <FormInput label="Account No. *" value={f.account_no} onChangeText={v => setF(p => ({ ...p, account_no: v }))} keyboardType="number-pad" testID="in-acc" />
                <FormInput label="IFSC" value={f.ifsc} onChangeText={v => setF(p => ({ ...p, ifsc: v }))} testID="in-ifsc" />
                <FormInput label="Opening Balance (₹)" value={f.opening_balance} onChangeText={v => setF(p => ({ ...p, opening_balance: v }))} keyboardType="numeric" testID="in-open" />
                {err ? <Text style={{ color: colors.error }}>{err}</Text> : null}
                <PrimaryButton label="Save Bank" onPress={save} loading={busy} testID="save-bank" />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
});
