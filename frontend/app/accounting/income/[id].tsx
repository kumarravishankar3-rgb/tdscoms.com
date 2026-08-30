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

export default function IncomeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [inc, setInc] = useState<any | null>(null);
  const load = useCallback(async () => { try { setInc(await api.get<any>(`/income/${id}`)); } catch {} }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAttachmentsChange = (list: Attachment[]) => setInc((p: any) => p ? { ...p, attachments: list } : p);

  const remove = () => Alert.alert('Delete Income?', `Delete ${inc.income_no}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.del(`/income/${id}`); router.back(); } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); } } },
  ]);

  if (!inc) return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }}>
      <ScreenHeader title="Income" />
      <View style={{ padding: 24 }}><Text style={{ color: colors.muted }}>Loading…</Text></View>
    </View>
  );

  const canDelete = user?.role === 'admin' || user?.role === 'manager';

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }} testID="income-detail">
      <ScreenHeader title="Payment / Income" right={canDelete ? (
        <Pressable onPress={remove} hitSlop={8}><Ionicons name="trash-outline" size={22} color={colors.error} /></Pressable>
      ) : undefined} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <View style={styles.card}>
          <Text style={styles.no}>{inc.income_no}</Text>
          <Text style={styles.title}>{inc.client_name}</Text>
          <Text style={styles.meta}>{inc.date} • {String(inc.payment_mode).toUpperCase()}{inc.employee_name ? ` • by ${inc.employee_name}` : ''}</Text>
          <Text style={styles.meta}>{inc.service_category}{inc.service_name ? ` • ${inc.service_name}` : ''}</Text>
          {inc.remarks ? <Text style={{ marginTop: 6, color: '#374151' }}>{inc.remarks}</Text> : null}
          <View style={styles.divider} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>Amount</Text>
            <Text style={styles.amt}>{inr(inc.amount)}</Text>
          </View>
        </View>

        <AttachmentsSection attachments={inc.attachments || []} onChange={onAttachmentsChange} voucherKind="income" oid={inc.id} title="Receipt / Proof Attachments" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  no: { fontSize: font.xl, fontWeight: '900', color: '#111827' },
  title: { fontSize: font.lg, fontWeight: '700', color: '#111827', marginTop: 4 },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 6 },
  amt: { fontSize: font.xl, fontWeight: '900', color: '#059669' },
});
