import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ScreenHeader';
import { AttachmentsSection, Attachment } from '@/src/AttachmentsSection';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<any | null>(null);

  const load = useCallback(async () => { try { setInv(await api.get<any>(`/invoices/${id}`)); } catch {} }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAttachmentsChange = (list: Attachment[]) => setInv((p: any) => p ? { ...p, attachments: list } : p);

  const remove = () => Alert.alert('Delete Invoice?', `Delete ${inv.invoice_no}? This cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.del(`/invoices/${id}`); router.back(); } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); } } },
  ]);

  if (!inv) return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }}>
      <ScreenHeader title="Invoice" />
      <View style={{ padding: 24 }}><Text style={{ color: colors.muted }}>Loading…</Text></View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }} testID="invoice-detail">
      <ScreenHeader title={inv.invoice_type === 'purchase' ? 'Purchase Bill' : 'Sale Invoice'} right={(
        <Pressable onPress={remove} hitSlop={8}><Ionicons name="trash-outline" size={22} color={colors.error} /></Pressable>
      )} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.invNo}>{inv.invoice_no}</Text>
            <View style={[styles.badge, inv.status === 'paid' ? { backgroundColor: '#DCFCE7' } : inv.status === 'partial' ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.badgeTxt, { color: inv.status === 'paid' ? '#059669' : inv.status === 'partial' ? '#B45309' : '#DC2626' }]}>{String(inv.status).toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.party}>{inv.party_name}</Text>
          <Text style={styles.meta}>📱 {inv.party_mobile || '—'} • {inv.date} • {inv.payment_type?.toUpperCase()} • Due: {inv.due_date || '—'}</Text>
        </View>

        {inv.items?.length ? (
          <View style={styles.card}>
            <Text style={styles.section}>Items</Text>
            {inv.items.map((it: any, i: number) => (
              <View key={i} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.meta}>{it.qty} × ₹{it.price} {it.tax_rate ? `• GST ${it.tax_rate}%` : ''} {it.discount ? `• Disc ₹${it.discount}` : ''}</Text>
                </View>
                <Text style={styles.itemAmt}>{inr(it.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>Totals</Text>
          <Row label="Subtotal" value={inr(inv.subtotal)} />
          {inv.total_discount ? <Row label="Discount" value={`- ${inr(inv.total_discount)}`} /> : null}
          {inv.total_tax ? <Row label="GST" value={inr(inv.total_tax)} /> : null}
          <View style={styles.divider} />
          <Row label="Total Amount" value={inr(inv.total_amount)} bold />
          <Row label="Paid" value={inr(inv.paid_amount)} />
          <Row label="Balance" value={inr(inv.balance)} bold color={inv.balance > 0 ? '#DC2626' : '#059669'} />
        </View>

        <AttachmentsSection attachments={inv.attachments || []} onChange={onAttachmentsChange} voucherKind="invoices" oid={inv.id} title="Attachments" />

        {inv.notes ? (
          <View style={styles.card}>
            <Text style={styles.section}>Notes</Text>
            <Text style={{ color: '#111827' }}>{inv.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const Row: React.FC<{ label: string; value: string; bold?: boolean; color?: string }> = ({ label, value, bold, color }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
    <Text style={{ color: colors.muted }}>{label}</Text>
    <Text style={{ color: color || '#111827', fontWeight: bold ? '800' : '600' }}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  invNo: { fontSize: font.xl, fontWeight: '900', color: '#111827' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  party: { fontSize: font.lg, fontWeight: '700', color: '#111827', marginTop: 4 },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  section: { fontSize: 11, fontWeight: '900', color: '#374151', letterSpacing: 1, marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 8 },
  itemName: { color: '#111827', fontWeight: '700' },
  itemAmt: { color: '#059669', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },
});
