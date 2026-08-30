import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, EmptyState, ScreenLoader } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN')}`;

export default function IncomeList() {
  const router = useRouter();
  const [list, setList] = useState<any[] | null>(null);
  const load = useCallback(async () => { try { setList(await api.get<any[]>('/income')); } catch { setList([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="income-list">
      <ScreenHeader title="Income" right={(
        <Pressable onPress={() => router.push('/accounting/income/new' as any)} style={styles.add}><Ionicons name="add" size={22} color={colors.onBrandPrimary} /></Pressable>
      )} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="income-empty" icon="cash-outline" title="No income entries" actionLabel="Add Income" onAction={() => router.push('/accounting/income/new' as any)} />
      ) : (
        <FlatList data={list} keyExtractor={i => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/accounting/income/${item.id}` as any)} testID={`inc-${item.id}`}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.no}>{item.income_no} • {item.date}</Text>
                      {(item.attachments?.length || 0) > 0 ? (
                        <View style={styles.attachChip}>
                          <Ionicons name="attach" size={11} color={colors.brandPrimary} />
                          <Text style={styles.attachTxt}>{item.attachments.length}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.title}>{item.client_name}</Text>
                    <Text style={styles.muted}>{item.service_category}{item.service_name ? ` • ${item.service_name}` : ''}</Text>
                    <Text style={styles.muted}>{item.payment_mode}{item.employee_name ? ` • by ${item.employee_name}` : ''}</Text>
                  </View>
                  <Text style={styles.amt}>{inr(item.amount)}</Text>
                </View>
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
  amt: { fontSize: font.lg, fontWeight: '800', color: colors.success },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  attachTxt: { color: colors.brandPrimary, fontSize: 10, fontWeight: '800' },
});
