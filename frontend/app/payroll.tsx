import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, ScreenLoader } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function PayrollScreen() {
  const [month, setMonth] = useState<string>(monthKey());
  const [data, setData] = useState<any | null>(null);

  const load = useCallback(async (m: string) => {
    setData(null);
    try { setData(await api.get<any>(`/payroll?month=${m}`)); } catch { setData({ month: m, employees: [] }); }
  }, []);
  useFocusEffect(useCallback(() => { load(month); }, [load, month]));

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  };

  const totalNet = useMemo(() => (data?.employees || []).reduce((s: number, e: any) => s + (e.net_payable || 0), 0), [data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="payroll-screen">
      <ScreenHeader title="Payroll" />
      <View style={styles.monthBar}>
        <Pressable onPress={() => changeMonth(-1)} style={styles.navBtn} testID="prev-month" hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.monthText}>{month}</Text>
        <Pressable onPress={() => changeMonth(1)} style={styles.navBtn} testID="next-month" hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      {data === null ? <ScreenLoader /> : (
        <FlatList
          data={data.employees || []}
          keyExtractor={i => i.employee_id}
          ListHeaderComponent={(
            <Card style={{ margin: spacing.lg, marginBottom: 0 }}>
              <Text style={styles.summary}>Total Net Payable</Text>
              <Text style={styles.summaryVal} testID="total-net">₹ {totalNet.toLocaleString('en-IN')}</Text>
              <Text style={styles.muted}>Working days: {data.settings?.working_days_per_month} • Late fine/day: ₹ {data.settings?.late_fine_per_day}</Text>
            </Card>
          )}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.muted}>{item.employee_code || ''} • {item.designation || '-'}</Text>
                </View>
                <Text style={styles.net}>₹ {Number(item.net_payable).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Days present</Text><Text style={styles.rowVal}>{item.days_present} / {item.working_days}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Earned</Text><Text style={styles.rowVal}>₹ {Number(item.earned).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Late days</Text><Text style={[styles.rowVal, { color: colors.error }]}>{item.late_days} (₹ {item.late_fine})</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Fixed deductions</Text><Text style={styles.rowVal}>₹ {Number(item.deductions).toLocaleString('en-IN')}</Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', padding: spacing.xl }]}>No employees to compute for.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface, minWidth: 90, textAlign: 'center' },
  summary: { color: colors.muted, fontSize: font.sm },
  summaryVal: { color: colors.brandPrimary, fontSize: 28, fontWeight: '800', marginTop: 4 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  name: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  net: { fontSize: font.xl, fontWeight: '800', color: colors.success },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  rowLabel: { color: colors.muted, fontSize: font.sm },
  rowVal: { color: colors.onSurface, fontWeight: '600' },
});
