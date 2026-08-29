import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, ScreenLoader } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN')}`;

export default function BooksScreen() {
  const [mode, setMode] = useState<'cash' | 'bank'>('cash');
  const [banks, setBanks] = useState<any[]>([]);
  const [bankId, setBankId] = useState<string>('');
  const [data, setData] = useState<any | null>(null);

  useEffect(() => { (async () => { try { const b = await api.get<any[]>('/bank-accounts'); setBanks(b); if (b[0]) setBankId(b[0].id); } catch {} })(); }, []);

  const load = useCallback(async () => {
    setData(null);
    try {
      if (mode === 'cash') setData(await api.get<any>('/accounting/cash-book'));
      else if (bankId) setData(await api.get<any>(`/accounting/bank-book?bank_id=${bankId}`));
    } catch {}
  }, [mode, bankId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="books-screen">
      <ScreenHeader title="Books" />
      <View style={styles.tabs}>
        <Pressable testID="tab-cash" onPress={() => setMode('cash')} style={[styles.tab, mode === 'cash' && styles.tabActive]}>
          <Text style={[styles.tabText, mode === 'cash' && styles.tabTextActive]}>Cash Book</Text>
        </Pressable>
        <Pressable testID="tab-bank" onPress={() => setMode('bank')} style={[styles.tab, mode === 'bank' && styles.tabActive]}>
          <Text style={[styles.tabText, mode === 'bank' && styles.tabTextActive]}>Bank Book</Text>
        </Pressable>
      </View>
      {mode === 'bank' && banks.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bankChips}>
          {banks.map(b => (
            <Pressable key={b.id} onPress={() => setBankId(b.id)} style={[styles.chip, bankId === b.id && styles.chipActive]}>
              <Text style={[styles.chipText, bankId === b.id && { color: colors.onBrandPrimary }]}>{b.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {data === null ? <ScreenLoader /> : (
        <FlatList
          data={data.entries}
          keyExtractor={(_, i) => String(i)}
          ListHeaderComponent={(
            <Card style={{ margin: spacing.lg, marginBottom: 0 }}>
              {mode === 'cash' ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View><Text style={styles.muted}>Total In</Text><Text style={[styles.mv, { color: colors.success }]}>{inr(data.total_in)}</Text></View>
                  <View><Text style={styles.muted}>Total Out</Text><Text style={[styles.mv, { color: colors.error }]}>{inr(data.total_out)}</Text></View>
                  <View><Text style={styles.muted}>Closing</Text><Text style={styles.mv}>{inr(data.closing)}</Text></View>
                </View>
              ) : (
                <View><Text style={styles.muted}>{data.bank?.name} • {data.bank?.bank_name}</Text><Text style={styles.mv}>{inr(data.closing)}</Text></View>
              )}
            </Card>
          )}
          contentContainerStyle={{ padding: spacing.lg, gap: 6, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.date}>{item.date}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.party || '-'}</Text>
                <Text style={styles.muted}>{item.no} • {item.category}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.amt, { color: (item.type === 'in' || item.type === 'credit') ? colors.success : colors.error }]}>
                  {(item.type === 'in' || item.type === 'credit') ? '+' : '-'} {inr(item.amount)}
                </Text>
                <Text style={styles.muted}>Bal {inr(item.running)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ padding: spacing.xl, textAlign: 'center', color: colors.muted }}>No entries.</Text>}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, margin: spacing.lg, marginBottom: 0, padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.brandPrimary },
  bankChips: { padding: spacing.lg, gap: 8, paddingBottom: 0 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurface, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  date: { color: colors.muted, fontSize: font.sm, width: 76 },
  title: { color: colors.onSurface, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  amt: { fontWeight: '800' },
  mv: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface, marginTop: 2 },
});
