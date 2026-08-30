import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ScreenHeader';
import { AttachmentsSection, Attachment } from '@/src/AttachmentsSection';
import { useAuth } from '@/src/AuthContext';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [exp, setExp] = useState<any | null>(null);
  const load = useCallback(async () => { try { setExp(await api.get<any>(`/expenses/${id}`)); } catch {} }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAttachmentsChange = (list: Attachment[]) => setExp((p: any) => p ? { ...p, attachments: list } : p);

  const remove = () => Alert.alert('Delete Expense?', `Delete ${exp.expense_no}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.del(`/expenses/${id}`); router.back(); } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); } } },
  ]);

  const decide = async (action: 'verify' | 'approve' | 'reject') => {
    try { await api.post(`/expenses/${id}/decision`, { action }); await load(); }
    catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
  };

  if (!exp) return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }}>
      <ScreenHeader title="Expense" />
      <View style={{ padding: 24 }}><Text style={{ color: colors.muted }}>Loading…</Text></View>
    </View>
  );

  const statusColor = exp.status === 'approved' ? '#059669' : exp.status === 'rejected' ? '#DC2626' : exp.status === 'verified' ? '#F59E0B' : colors.muted;
  const statusBg = exp.status === 'approved' ? '#DCFCE7' : exp.status === 'rejected' ? '#FEE2E2' : exp.status === 'verified' ? '#FEF3C7' : '#F3F4F6';

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }} testID="expense-detail">
      <ScreenHeader title="Expense" right={user?.role === 'admin' ? (
        <Pressable onPress={remove} hitSlop={8}><Ionicons name="trash-outline" size={22} color={colors.error} /></Pressable>
      ) : undefined} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.no}>{exp.expense_no}</Text>
            <View style={[styles.badge, { backgroundColor: statusBg }]}><Text style={[styles.badgeTxt, { color: statusColor }]}>{String(exp.status).toUpperCase()}</Text></View>
          </View>
          <Text style={styles.title}>{exp.category}</Text>
          <Text style={styles.meta}>{exp.date} • {String(exp.payment_mode).toUpperCase()}{exp.vendor ? ` • ${exp.vendor}` : ''}</Text>
          {exp.description ? <Text style={{ marginTop: 6, color: '#374151' }}>{exp.description}</Text> : null}
          <View style={styles.divider} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>Amount</Text>
            <Text style={styles.amt}>{inr(exp.amount)}</Text>
          </View>
        </View>

        {exp.status === 'pending' && (user?.role === 'admin' || user?.role === 'manager') ? (
          <View style={styles.card}>
            <Text style={styles.section}>Actions</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable testID="rej-btn" onPress={() => decide('reject')} style={[styles.actBtn, { backgroundColor: '#FEE2E2' }]}><Text style={{ color: '#DC2626', fontWeight: '800' }}>Reject</Text></Pressable>
              <Pressable testID="ver-btn" onPress={() => decide('verify')} style={[styles.actBtn, { backgroundColor: '#FEF3C7' }]}><Text style={{ color: '#B45309', fontWeight: '800' }}>Verify</Text></Pressable>
              {user?.role === 'admin' ? (
                <Pressable testID="app-btn" onPress={() => decide('approve')} style={[styles.actBtn, { backgroundColor: '#059669' }]}><Text style={{ color: '#FFF', fontWeight: '800' }}>Approve</Text></Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <AttachmentsSection attachments={exp.attachments || []} onChange={onAttachmentsChange} voucherKind="expenses" oid={exp.id} title="Bill / Receipt Attachments" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  no: { fontSize: font.xl, fontWeight: '900', color: '#111827' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  title: { fontSize: font.lg, fontWeight: '700', color: '#111827', marginTop: 4 },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 6 },
  amt: { fontSize: font.xl, fontWeight: '900', color: '#DC2626' },
  section: { fontSize: 11, fontWeight: '900', color: '#374151', letterSpacing: 1, marginBottom: 4 },
  actBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
});
