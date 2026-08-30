import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ScreenHeader';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function InvoicesList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const kind = params?.type === 'purchase' ? 'purchase' : 'sale';
  const [list, setList] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.get<any[]>(`/invoices?invoice_type=${kind}`)); } catch { setList([]); }
  }, [kind]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }}>
      <ScreenHeader title={kind === 'purchase' ? 'Purchase Bills' : 'Sale Invoices'} right={(
        <Pressable onPress={() => router.push({ pathname: '/accounting/invoices/new', params: kind === 'purchase' ? { type: 'purchase' } : undefined } as any)} testID="new-invoice-btn"
          style={styles.newBtn}>
          <Ionicons name="add" size={22} color="#FFF" />
        </Pressable>
      )} />
      {list === null ? (
        <View style={{ padding: 24 }}><Text style={{ color: colors.muted }}>Loading…</Text></View>
      ) : list.length === 0 ? (
        <View style={{ padding: 32, alignItems: 'center' }}>
          <Ionicons name="receipt-outline" size={48} color={colors.muted} />
          <Text style={{ color: colors.muted, marginTop: 8 }}>No {kind === 'purchase' ? 'bills' : 'invoices'} yet</Text>
          <Pressable onPress={() => router.push('/accounting/invoices/new' as any)} style={[styles.newBtn, { marginTop: 12, paddingHorizontal: 20, borderRadius: radius.md, width: undefined, height: undefined }]}>
            <Text style={{ color: '#FFF', fontWeight: '800', padding: 10 }}>+ Create First</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md, gap: 8, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/accounting/invoices/${item.id}` as any)} style={styles.card} testID={`inv-${item.id}`}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.no}>{item.invoice_no}</Text>
                  <View style={[styles.badge, item.status === 'paid' ? { backgroundColor: '#DCFCE7' } : item.status === 'partial' ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.badgeTxt, { color: item.status === 'paid' ? '#059669' : item.status === 'partial' ? '#B45309' : '#DC2626' }]}>{String(item.status).toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.party}>{item.party_name}</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 }}>
                  <Text style={styles.meta}>{item.date}</Text>
                  {(item.attachments?.length || 0) > 0 ? (
                    <View style={styles.attachChip}>
                      <Ionicons name="attach" size={12} color={colors.brandPrimary} />
                      <Text style={styles.attachTxt}>{item.attachments.length}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amt}>{inr(item.total_amount)}</Text>
                {item.balance > 0 ? <Text style={styles.bal}>Bal: {inr(item.balance)}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' },
  no: { color: '#111827', fontWeight: '800', fontSize: font.base },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  party: { color: '#374151', fontWeight: '600', fontSize: font.sm, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 11 },
  amt: { color: '#059669', fontWeight: '800', fontSize: font.base },
  bal: { color: '#DC2626', fontSize: 11, marginTop: 2 },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  attachTxt: { color: colors.brandPrimary, fontSize: 10, fontWeight: '800' },
});
