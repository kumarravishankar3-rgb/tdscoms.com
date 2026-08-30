import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Platform, Linking } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';
import { confirm, notify } from '@/src/dialog';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function InvoicesList() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const params = useLocalSearchParams<{ type?: string }>();
  const kind = params?.type === 'purchase' ? 'purchase' : 'sale';
  const [list, setList] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.get<any[]>(`/invoices?invoice_type=${kind}`)); } catch { setList([]); }
  }, [kind]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const printPdf = async (inv: any) => {
    try {
      const url = await api.invoicePdfUrl(inv.id);
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank');
      else await Linking.openURL(url);
    } catch (e: any) { notify('Failed', e?.message || 'Unable to open PDF'); }
  };
  const edit = (inv: any) => {
    router.push({ pathname: '/accounting/invoices/new', params: { edit_id: inv.id, type: inv.invoice_type } } as any);
  };
  const remove = async (inv: any) => {
    const ok = await confirm('Delete Invoice?', `Delete ${inv.invoice_no}? This cannot be undone.`, { confirmText: 'Delete', destructive: true });
    if (!ok) return;
    try { await api.del(`/invoices/${inv.id}`); await load(); }
    catch (e: any) { notify('Failed', e?.message || 'Try again'); }
  };

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
            <View style={styles.card} testID={`inv-${item.id}`}>
              <Pressable onPress={() => router.push(`/accounting/invoices/${item.id}` as any)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
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
                    {item.payment_mode ? <Text style={styles.meta}>• {String(item.payment_mode).replace('_', ' ').toUpperCase()}</Text> : null}
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
              <View style={styles.actions}>
                <Pressable onPress={() => printPdf(item)} testID={`print-${item.id}`} style={[styles.actBtn, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="print" size={16} color={colors.brandPrimary} />
                  <Text style={[styles.actTxt, { color: colors.brandPrimary }]}>Print</Text>
                </Pressable>
                {isAdmin ? (
                  <>
                    <Pressable onPress={() => edit(item)} testID={`edit-${item.id}`} style={[styles.actBtn, { backgroundColor: '#FEF3C7' }]}>
                      <Ionicons name="create-outline" size={16} color="#B45309" />
                      <Text style={[styles.actTxt, { color: '#B45309' }]}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => remove(item)} testID={`del-${item.id}`} style={[styles.actBtn, { backgroundColor: '#FEE2E2' }]}>
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      <Text style={[styles.actTxt, { color: '#DC2626' }]}>Delete</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  actions: { flexDirection: 'row', gap: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 8 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: radius.sm },
  actTxt: { fontWeight: '800', fontSize: 12 },
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
