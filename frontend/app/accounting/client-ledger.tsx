import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, ScreenLoader } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { Ionicons } from '@expo/vector-icons';

const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN')}`;

export default function ClientLedger() {
  const [clients, setClients] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [ledger, setLedger] = useState<any | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => { (async () => { try { setClients(await api.get<any[]>('/customers')); } catch {} })(); }, []);
  useEffect(() => { (async () => {
    if (!selected) { setLedger(null); return; }
    try { setLedger(await api.get<any>(`/accounting/client-ledger?client_id=${selected.id}`)); } catch {}
  })(); }, [selected]);

  const filtered = clients.filter(c => (c.name || '').toLowerCase().includes(q.toLowerCase()) || (c.mobile || '').includes(q));

  if (selected && ledger) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="ledger-screen">
        <ScreenHeader title="Client Ledger" />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{ledger.client.name}</Text>
                {ledger.client.customer_code ? <Text style={styles.code}>{ledger.client.customer_code}</Text> : null}
                {ledger.client.mobile ? <Text style={styles.muted}>📱 {ledger.client.mobile}</Text> : null}
              </View>
              <Pressable onPress={() => { setSelected(null); setLedger(null); }} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.tLbl}>Total Received</Text>
              <Text style={[styles.tVal, { color: colors.success }]}>{inr(ledger.total_received)}</Text>
            </View>
          </Card>
          <Text style={styles.sectionTitle}>Payment History ({ledger.income_entries.length})</Text>
          {ledger.income_entries.length === 0 ? (
            <Text style={styles.muted}>No income entries recorded for this client yet.</Text>
          ) : ledger.income_entries.map((e: any) => (
            <Card key={e.id}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.date}>{e.date} • {e.income_no}</Text>
                  <Text style={styles.title}>{e.service_category}</Text>
                  <Text style={styles.muted}>{e.payment_mode}{e.employee_name ? ` • by ${e.employee_name}` : ''}</Text>
                  {e.remarks ? <Text style={styles.muted}>{e.remarks}</Text> : null}
                </View>
                <Text style={[styles.amt, { color: colors.success }]}>{inr(e.amount)}</Text>
              </View>
            </Card>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="ledger-picker">
      <ScreenHeader title="Client Ledger" />
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search client…" placeholderTextColor={colors.muted} style={styles.searchInput} testID="ledger-search" />
      </View>
      {clients.length === 0 ? <ScreenLoader /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
          {filtered.map(c => (
            <Pressable key={c.id} testID={`led-${c.id}`} onPress={() => setSelected(c)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{c.name}</Text>
                <Text style={styles.muted}>{c.customer_code} • {c.mobile || '-'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: spacing.lg, marginBottom: 0, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: font.base, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
  code: { color: colors.brandPrimary, fontWeight: '700', marginTop: 4 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.success + '15', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  tLbl: { color: colors.muted, fontWeight: '600' },
  tVal: { fontSize: font.xl, fontWeight: '800' },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface, marginTop: spacing.md },
  date: { color: colors.muted, fontSize: font.sm },
  amt: { fontWeight: '800', fontSize: font.lg },
});
