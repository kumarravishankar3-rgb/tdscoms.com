import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenLoader } from '@/src/ui';
import { useAuth } from '@/src/AuthContext';

const NAVY = '#00104A';
const NAVY_LIGHT = '#1A2A6B';
const BLUE = '#2075FF';
const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN')}`;

export default function AccountingDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [d, setD] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setD(await api.get<any>('/accounting/dashboard')); } catch {} }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!d) return (<View style={{ flex: 1, backgroundColor: '#F4F6FB' }}><Header user={user} onBack={() => router.back()} /><ScreenLoader /></View>);

  const stats = [
    { label: "Today Collection", value: inr(d.today_income), y: inr(d.yesterday_income), icon: 'wallet', bg: '#DCFCE7', fg: '#059669', up: d.today_income >= d.yesterday_income },
    { label: "Today Expense", value: inr(d.today_expense), y: inr(d.yesterday_expense), icon: 'mail', bg: '#FEE2E2', fg: '#DC2626', up: d.today_expense >= d.yesterday_expense },
    { label: "Cash in Hand", value: inr(d.cash_in_hand), y: inr(d.cash_in_hand), icon: 'card', bg: '#DBEAFE', fg: '#2563EB' },
    { label: "Bank Balance", value: inr(d.total_bank), y: null, icon: 'business', bg: '#EDE9FE', fg: '#7C3AED' },
    { label: "Total Outstanding", value: inr(d.total_outstanding), y: `Clients: ${d.outstanding_clients}`, icon: 'people', bg: '#FEF3C7', fg: '#D97706' },
  ];

  const maxSeries = Math.max(1, ...d.monthly_series.flatMap((m: any) => [m.income, m.expense]));

  const alerts = [
    { icon: 'alert-circle', bg: '#FEE2E2', fg: '#DC2626', title: 'Pending Verification', sub: `${d.pending_expense_approvals} expenses`, right: '' },
    { icon: 'person-circle', bg: '#FEF3C7', fg: '#D97706', title: 'Outstanding Amount', sub: `${d.outstanding_clients} clients`, right: inr(d.total_outstanding) },
    { icon: 'document-text', bg: '#FCE7F3', fg: '#DB2777', title: 'Expense Approval Pending', sub: `${d.pending_expense_approvals} requests`, right: '' },
    d.cash_in_hand < 50000 ? { icon: 'cash', bg: '#DCFCE7', fg: '#059669', title: 'Low Cash Alert', sub: 'Cash in hand < ₹ 50,000', right: inr(d.cash_in_hand) } : null,
  ].filter(Boolean) as any[];

  const svcTotal = Math.max(1, d.top_services.reduce((s: number, x: any) => s + x.amount, 0));
  const svcColors = [BLUE, '#F472B6', '#10B981', '#F59E0B', '#8B5CF6'];

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }} testID="acc-dashboard">
      <Header user={user} onBack={() => router.back()} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <View style={styles.crumb}><Text style={styles.crumbTxt}>Home / Dashboard</Text></View>

        {/* Stat cards 2×3 */}
        <View style={styles.grid}>
          {stats.map(s => (
            <View key={s.label} style={styles.stat} testID={`stat-${s.label}`}>
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon as any} size={20} color={s.fg} />
              </View>
              <Text style={styles.statLbl}>{s.label.toUpperCase()}</Text>
              <Text style={styles.statVal}>{s.value}</Text>
              {s.y ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text style={styles.statY}>{s.y}</Text>
                  {s.up !== undefined ? <Ionicons name={s.up ? 'arrow-up' : 'arrow-down'} size={10} color={s.up ? '#10B981' : '#EF4444'} /> : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Monthly Income vs Expense */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>MONTHLY INCOME vs EXPENSE</Text>
          <View style={styles.chart}>
            {d.monthly_series.map((m: any, i: number) => (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBars}>
                  <View style={[styles.chartBar, { height: (m.income / maxSeries) * 100, backgroundColor: BLUE }]} />
                  <View style={[styles.chartBar, { height: (m.expense / maxSeries) * 100, backgroundColor: '#F472B6' }]} />
                </View>
                <Text style={styles.chartLbl}>{m.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: BLUE }]} /><Text style={styles.legendTxt}>Income</Text></View>
            <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#F472B6' }]} /><Text style={styles.legendTxt}>Expense</Text></View>
          </View>
          <View style={styles.summaryRow}>
            <View><Text style={styles.summaryLbl}>Total Income</Text><Text style={[styles.summaryVal, { color: '#059669' }]}>{inr(d.month_income)}</Text></View>
            <View><Text style={styles.summaryLbl}>Total Expense</Text><Text style={[styles.summaryVal, { color: '#DC2626' }]}>{inr(d.month_expense)}</Text></View>
            <View><Text style={styles.summaryLbl}>Net Profit</Text><Text style={[styles.summaryVal, { color: NAVY }]}>{inr(d.month_profit)}</Text></View>
          </View>
        </View>

        {/* Important Alerts */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>IMPORTANT ALERTS</Text>
          {alerts.length === 0 ? <Text style={styles.muted}>No alerts.</Text> : alerts.map((a, i) => (
            <View key={i} style={styles.alertRow}>
              <View style={[styles.alertIcon, { backgroundColor: a.bg }]}><Ionicons name={a.icon} size={16} color={a.fg} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{a.title}</Text>
                <Text style={styles.muted}>{a.sub}</Text>
              </View>
              {a.right ? <Text style={styles.alertRight}>{a.right}</Text> : null}
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </View>
          ))}
        </View>

        {/* Top Services */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TOP SERVICES (THIS MONTH)</Text>
          <View style={styles.stackBar}>
            {d.top_services.map((s: any, i: number) => (
              <View key={s.name} style={{ flex: s.amount || 0.01, backgroundColor: svcColors[i % svcColors.length], height: '100%' }} />
            ))}
          </View>
          {d.top_services.map((s: any, i: number) => (
            <View key={s.name} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: svcColors[i % svcColors.length] }]} />
              <Text style={[styles.legendTxt, { flex: 1 }]}>{s.name}</Text>
              <Text style={styles.legendTxt}>{inr(s.amount)} ({Math.round((s.amount / svcTotal) * 100)}%)</Text>
            </View>
          ))}
          {d.top_services.length === 0 ? <Text style={styles.muted}>No income this month.</Text> : null}
        </View>

        {/* Top Employees */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TOP EMPLOYEES (COLLECTION)</Text>
          {d.top_employees.map((e: any, i: number) => (
            <View key={e.name} style={styles.empRow}>
              <View style={styles.rankDot}><Text style={styles.rankTxt}>{i + 1}</Text></View>
              <Text style={{ flex: 1, color: '#111827', fontWeight: '600' }}>{e.name}</Text>
              <Text style={{ color: '#059669', fontWeight: '800' }}>{inr(e.amount)}</Text>
            </View>
          ))}
          {d.top_employees.length === 0 ? <Text style={styles.muted}>No employee collections yet.</Text> : null}
        </View>

        {/* Recent Collections */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>RECENT COLLECTIONS</Text>
            <Pressable onPress={() => router.push('/accounting/income' as any)}><Text style={styles.link}>View All</Text></Pressable>
          </View>
          {d.recent_collections.map((r: any) => (
            <View key={r.id} style={styles.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txTitle}>{r.client_name}</Text>
                <Text style={styles.muted}>{r.date} • {r.service_category} • {r.income_no}</Text>
              </View>
              <Text style={[styles.txAmt, { color: '#059669' }]}>+ {inr(r.amount)}</Text>
            </View>
          ))}
          {d.recent_collections.length === 0 ? <Text style={styles.muted}>No collections yet.</Text> : null}
        </View>

        {/* Recent Expenses */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>RECENT EXPENSES</Text>
            <Pressable onPress={() => router.push('/accounting/expenses' as any)}><Text style={styles.link}>View All</Text></Pressable>
          </View>
          {d.recent_expenses.map((r: any) => (
            <View key={r.id} style={styles.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txTitle}>{r.vendor || r.category}</Text>
                <Text style={styles.muted}>{r.date} • {r.category} • {r.status.toUpperCase()}</Text>
              </View>
              <Text style={[styles.txAmt, { color: '#DC2626' }]}>- {inr(r.amount)}</Text>
            </View>
          ))}
          {d.recent_expenses.length === 0 ? <Text style={styles.muted}>No expenses yet.</Text> : null}
        </View>

        {/* Outstanding Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>OUTSTANDING SUMMARY</Text>
          {['0-30', '31-60', '61-90', '90+'].map(k => (
            <View key={k} style={styles.txRow}>
              <Text style={{ flex: 1, color: '#111827', fontWeight: '600' }}>{k} days</Text>
              <Text style={{ color: k === '90+' ? '#DC2626' : '#111827', fontWeight: '700' }}>{inr(d.aging_buckets[k])}</Text>
            </View>
          ))}
          <View style={styles.totalBar}>
            <Text style={{ color: 'white', fontWeight: '700' }}>Total</Text>
            <Text style={{ color: 'white', fontWeight: '800' }}>{inr(d.total_outstanding)}</Text>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>QUICK ACTIONS</Text>
          <View style={styles.qaGrid}>
            <QA icon="cash" color="#059669" label="Income" onPress={() => router.push('/accounting/income/new' as any)} />
            <QA icon="wallet-outline" color="#DC2626" label="Expense" onPress={() => router.push('/accounting/expenses/new' as any)} />
            <QA icon="book" color={BLUE} label="Books" onPress={() => router.push('/accounting/books' as any)} />
            <QA icon="people" color="#7C3AED" label="Ledger" onPress={() => router.push('/accounting/client-ledger' as any)} />
            <QA icon="business" color="#0891B2" label="Banks" onPress={() => router.push('/accounting/banks' as any)} />
          </View>
        </View>

        <Text style={styles.footer}>© TDSC Accounts • Powered by TDSC OMS</Text>
      </ScrollView>
    </View>
  );
}

const Header: React.FC<{ user: any; onBack: () => void }> = ({ user, onBack }) => (
  <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY }}>
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.headerBtn}><Ionicons name="chevron-back" size={22} color="#FFF" /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.brand}>TDSC</Text>
        <Text style={styles.brandSub}>ACCOUNTS MANAGEMENT</Text>
      </View>
      <View style={styles.bell}><Ionicons name="notifications" size={18} color="#FFF" /></View>
      <View style={styles.avatar}><Text style={{ color: '#FFF', fontWeight: '800' }}>{(user?.name || 'A').charAt(0).toUpperCase()}</Text></View>
    </View>
    <View style={styles.userStrip}>
      <Text style={styles.userName}>{user?.name}</Text>
      <View style={styles.roleBadge}><Text style={styles.roleTxt}>{(user?.role || 'user').toUpperCase()}</Text></View>
      <View style={{ flex: 1 }} />
      <View style={styles.onlineDot} />
      <Text style={styles.online}>Online</Text>
    </View>
  </SafeAreaView>
);

const QA: React.FC<{ icon: any; color: string; label: string; onPress: () => void }> = ({ icon, color, label, onPress }) => (
  <Pressable onPress={onPress} style={styles.qa}>
    <View style={[styles.qaIcon, { backgroundColor: color + '22' }]}><Ionicons name={icon} size={20} color={color} /></View>
    <Text style={styles.qaLbl}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#FFF', fontSize: font.xl, fontWeight: '900', letterSpacing: 1 },
  brandSub: { color: '#93C5FD', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: -2 },
  bell: { width: 32, height: 32, borderRadius: 16, backgroundColor: NAVY_LIGHT, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  userStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  userName: { color: '#FFF', fontWeight: '700' },
  roleBadge: { backgroundColor: BLUE, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  roleTxt: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  online: { color: '#93C5FD', fontSize: font.sm },
  crumb: { paddingHorizontal: 4 },
  crumbTxt: { color: '#6B7280', fontSize: font.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { width: '48%', backgroundColor: '#FFF', borderRadius: radius.md, padding: spacing.md, ...shadow.card, borderLeftWidth: 3, borderLeftColor: BLUE },
  statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statLbl: { color: '#6B7280', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  statVal: { color: '#0F172A', fontSize: font.xl, fontWeight: '800', marginTop: 2 },
  statY: { color: '#6B7280', fontSize: 10, marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: radius.md, padding: spacing.lg, ...shadow.card, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: NAVY, fontSize: font.sm, fontWeight: '800', letterSpacing: 0.8 },
  link: { color: BLUE, fontWeight: '700', fontSize: font.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6, marginTop: spacing.sm },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2 },
  chartBar: { width: 8, borderRadius: 2, minHeight: 2 },
  chartLbl: { color: '#6B7280', fontSize: 10, fontWeight: '600' },
  legendRow: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { color: '#374151', fontSize: font.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: spacing.md, marginTop: spacing.sm },
  summaryLbl: { color: '#6B7280', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  summaryVal: { fontWeight: '800', fontSize: font.base, marginTop: 2 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  alertIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: '#111827', fontWeight: '700' },
  alertRight: { color: '#111827', fontWeight: '700', fontSize: font.sm },
  stackBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginVertical: spacing.sm, backgroundColor: '#F3F4F6' },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rankDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  rankTxt: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  txTitle: { color: '#111827', fontWeight: '700' },
  txAmt: { fontWeight: '800' },
  muted: { color: '#6B7280', fontSize: font.sm, marginTop: 4 },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: NAVY, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  qa: { width: '30%', alignItems: 'center', gap: 4, padding: spacing.sm, backgroundColor: '#F9FAFB', borderRadius: radius.md },
  qaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  qaLbl: { color: '#111827', fontWeight: '600', fontSize: font.sm },
  footer: { color: '#9CA3AF', fontSize: font.sm, textAlign: 'center', marginTop: spacing.md },
});
