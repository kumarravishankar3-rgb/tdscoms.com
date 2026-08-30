import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN')}`;

export default function ExpensesList() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[] | null>(null);
  const load = useCallback(async () => { try { setList(await api.get<any[]>('/expenses')); } catch { setList([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decide = async (id: string, action: 'verify' | 'approve' | 'reject') => {
    try { await api.post(`/expenses/${id}/decision`, { action }); await load(); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="expenses-list">
      <ScreenHeader title="Expenses" right={(
        <Pressable onPress={() => router.push('/accounting/expenses/new' as any)} style={styles.add}><Ionicons name="add" size={22} color={colors.onBrandPrimary} /></Pressable>
      )} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="expenses-empty" icon="wallet-outline" title="No expenses" subtitle="Track outflows" actionLabel="Add Expense" onAction={() => router.push('/accounting/expenses/new' as any)} />
      ) : (
        <FlatList data={list} keyExtractor={i => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/accounting/expenses/${item.id}` as any)} testID={`exp-${item.id}`}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.no}>{item.expense_no} • {item.date}</Text>
                      {(item.attachments?.length || 0) > 0 ? (
                        <View style={styles.attachChip}>
                          <Ionicons name="attach" size={11} color={colors.brandPrimary} />
                          <Text style={styles.attachTxt}>{item.attachments.length}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.title}>{item.category}</Text>
                    <Text style={styles.muted}>{item.vendor || '-'} • {item.payment_mode}</Text>
                    {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.amt}>{inr(item.amount)}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                </View>
                {item.status === 'pending' && (user?.role === 'admin' || user?.role === 'manager') ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm }}>
                    <Pressable onPress={() => decide(item.id, 'reject')} testID={`reject-${item.id}`} style={[styles.btn, { backgroundColor: colors.error + '20' }]}><Text style={{ color: colors.error, fontWeight: '700' }}>Reject</Text></Pressable>
                    <Pressable onPress={() => decide(item.id, 'verify')} testID={`verify-${item.id}`} style={[styles.btn, { backgroundColor: colors.warning + '20' }]}><Text style={{ color: colors.warning, fontWeight: '700' }}>Verify</Text></Pressable>
                    {user?.role === 'admin' ? (
                      <Pressable onPress={() => decide(item.id, 'approve')} testID={`approve-${item.id}`} style={[styles.btn, { backgroundColor: colors.success }]}><Text style={{ color: colors.onSuccess, fontWeight: '700' }}>Approve</Text></Pressable>
                    ) : null}
                  </View>
                ) : null}
                {item.status === 'verified' && user?.role === 'admin' ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm }}>
                    <Pressable onPress={() => decide(item.id, 'approve')} testID={`approve-${item.id}`} style={[styles.btn, { backgroundColor: colors.success, flex: 1 }]}><Text style={{ color: colors.onSuccess, fontWeight: '700', textAlign: 'center' }}>Approve</Text></Pressable>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          )} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  no: { color: colors.brandPrimary, fontWeight: '700', fontSize: font.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface, marginTop: 2 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  amt: { fontSize: font.lg, fontWeight: '800', color: colors.error },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  attachTxt: { color: colors.brandPrimary, fontSize: 10, fontWeight: '800' },
});
