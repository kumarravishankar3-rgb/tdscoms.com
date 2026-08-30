import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, FlatList, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';

const HEADER_BG = '#E8F0FE';  // light blue like Vyapar
const HEADER_FG = '#1A237E';   // deep indigo
const NAVY = '#00104A';
const BLUE = '#2075FF';
const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

type Row = { icon: any; iconColor: string; iconBg: string; label: string; route?: string; comingSoon?: boolean; params?: any };
type Section = { title: string; rows: Row[]; defaultOpen?: boolean };

const BUSINESS: Section[] = [
  {
    title: 'SALE',
    defaultOpen: true,
    rows: [
      { icon: 'receipt', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Sale Invoice', route: '/accounting/invoices/new' },
      { icon: 'list', iconColor: '#059669', iconBg: '#DCFCE7', label: 'All Sale Invoices', route: '/accounting/invoices' },
      { icon: 'arrow-down-circle', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Payment-In', route: '/accounting/income/new' },
      { icon: 'return-down-back', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Sale Return / Credit Note', comingSoon: true },
      { icon: 'clipboard', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Estimate / Quotation', comingSoon: true },
      { icon: 'document-text', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Proforma Invoice', comingSoon: true },
      { icon: 'cart', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Sale Order', comingSoon: true },
      { icon: 'car', iconColor: '#DB2777', iconBg: '#FCE7F3', label: 'Delivery Challan', comingSoon: true },
      { icon: 'phone-portrait', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Mobile POS', comingSoon: true },
    ],
  },
  {
    title: 'PURCHASE',
    rows: [
      { icon: 'file-tray-full', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Purchase Bills', route: '/accounting/invoices/new', params: { type: 'purchase' } },
      { icon: 'list', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'All Purchase Bills', route: '/accounting/invoices', params: { type: 'purchase' } },
      { icon: 'arrow-up-circle', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Payment-Out', route: '/accounting/expenses/new' },
      { icon: 'return-up-forward', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Purchase Return / Debit Note', comingSoon: true },
      { icon: 'cart', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Purchase Order', comingSoon: true },
    ],
  },
  {
    title: 'EXPENSE',
    rows: [
      { icon: 'wallet', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Add Expense', route: '/accounting/expenses/new' },
      { icon: 'list', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'All Expenses', route: '/accounting/expenses' },
      { icon: 'grid', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Categories & Items', route: '/accounting/items' },
    ],
  },
];

// Reports with star support via async-storage (favourites)
const REPORT_SECTIONS: Section[] = [
  {
    title: 'TRANSACTION REPORTS',
    defaultOpen: true,
    rows: [
      { icon: 'trending-up', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Sale Report', route: '/accounting/income' },
      { icon: 'trending-down', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Purchase Report', comingSoon: true },
      { icon: 'book', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Day Book (Cash / Bank)', route: '/accounting/books' },
      { icon: 'reader', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'All Transactions', route: '/accounting/books' },
      { icon: 'analytics', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Bill Wise Profit', comingSoon: true },
      { icon: 'stats-chart', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Profit & Loss', route: '/accounting' },
      { icon: 'time', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Sale Aging Report', comingSoon: true },
      { icon: 'time', iconColor: '#DB2777', iconBg: '#FCE7F3', label: 'Purchase Aging Report', comingSoon: true },
      { icon: 'water', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Cash Flow', route: '/accounting/books' },
      { icon: 'grid', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Balance Sheet', comingSoon: true },
    ],
  },
  {
    title: 'PARTY REPORTS',
    rows: [
      { icon: 'people', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Party Statement', route: '/accounting/client-ledger' },
      { icon: 'pie-chart', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Party Wise Profit & Loss', comingSoon: true },
      { icon: 'list', iconColor: '#059669', iconBg: '#DCFCE7', label: 'All Parties Report', route: '/(tabs)/business' },
      { icon: 'document', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Party Report by Items', comingSoon: true },
      { icon: 'swap-horizontal', iconColor: '#DB2777', iconBg: '#FCE7F3', label: 'Sale/Purchase by Party', comingSoon: true },
      { icon: 'people-circle', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Sale/Purchase by Party Groups', comingSoon: true },
    ],
  },
  {
    title: 'GST REPORTS',
    rows: [
      { icon: 'document-text', iconColor: '#059669', iconBg: '#DCFCE7', label: 'GSTR-1 (Outward)', comingSoon: true },
      { icon: 'document-text', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'GSTR-2 (Inward)', comingSoon: true },
      { icon: 'document-text', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'GSTR-3B (Monthly Return)', comingSoon: true },
      { icon: 'swap-horizontal', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'GST Transaction Report', comingSoon: true },
      { icon: 'document-text', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'GSTR-9 (Annual)', comingSoon: true },
      { icon: 'pricetags', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Sale Summary by HSN', comingSoon: true },
      { icon: 'construct', iconColor: '#DB2777', iconBg: '#FCE7F3', label: 'SAC Report', comingSoon: true },
      { icon: 'analytics', iconColor: '#059669', iconBg: '#DCFCE7', label: 'GST Report', comingSoon: true },
      { icon: 'analytics', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'GST Rate Report', comingSoon: true },
      { icon: 'document', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Form No. 27EQ', comingSoon: true },
      { icon: 'cash', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'TCS Receivable', comingSoon: true },
      { icon: 'cash', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'TDS Payable', comingSoon: true },
      { icon: 'cash', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'TDS Receivable', comingSoon: true },
    ],
  },
  {
    title: 'EXPENSE REPORTS',
    rows: [
      { icon: 'wallet', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Expense Transaction Report', route: '/accounting/expenses' },
      { icon: 'grid', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Expense Category Report', comingSoon: true },
      { icon: 'list', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Expense Item Report', comingSoon: true },
    ],
  },
  {
    title: 'SALE / PURCHASE ORDER REPORTS',
    rows: [
      { icon: 'cart', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Sale/Purchase Order Transaction Report', comingSoon: true },
      { icon: 'list', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Sale/Purchase Order Item Report', comingSoon: true },
    ],
  },
  {
    title: 'LOAN REPORTS',
    rows: [
      { icon: 'card', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Loan Statement', comingSoon: true },
    ],
  },
  {
    title: 'ITEM / STOCK REPORTS',
    rows: [
      { icon: 'cube', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Stock Summary Report', comingSoon: true },
      { icon: 'people', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'Item Report by Party', comingSoon: true },
      { icon: 'analytics', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Item Wise Profit & Loss', comingSoon: true },
      { icon: 'warning', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'Low Stock Summary Report', comingSoon: true },
    ],
  },
];

const SETTINGS_SECTIONS: Section[] = [
  {
    title: 'SETTINGS',
    defaultOpen: true,
    rows: [
      { icon: 'options', iconColor: '#2075FF', iconBg: '#DBEAFE', label: 'General', comingSoon: true },
      { icon: 'swap-horizontal', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Transaction', comingSoon: true },
      { icon: 'print', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Invoice Print', comingSoon: true },
      { icon: 'receipt', iconColor: '#DC2626', iconBg: '#FEE2E2', label: 'Taxes & GST', comingSoon: true },
      { icon: 'people', iconColor: '#F59E0B', iconBg: '#FEF3C7', label: 'User Management', comingSoon: true },
      { icon: 'chatbubbles', iconColor: '#0891B2', iconBg: '#CFFAFE', label: 'Transaction SMS', comingSoon: true },
      { icon: 'notifications', iconColor: '#DB2777', iconBg: '#FCE7F3', label: 'Reminders', comingSoon: true },
      { icon: 'person', iconColor: '#7C3AED', iconBg: '#EDE9FE', label: 'Party', route: '/(tabs)/business' },
      { icon: 'cube', iconColor: '#059669', iconBg: '#DCFCE7', label: 'Item', route: '/accounting/items' },
    ],
  },
];

const FAV_KEY = 'acc.report.favs';

export default function AccountingMenu() {
  const router = useRouter();
  const [tab, setTab] = useState<'home' | 'reports' | 'bank' | 'settings'>('home');
  const [favs, setFavs] = useState<Record<string, boolean>>({});

  useFocusEffect(useCallback(() => {
    (async () => { try { const s = await SecureStore.getItemAsync(FAV_KEY); if (s) setFavs(JSON.parse(s)); } catch {} })();
  }, []));

  const toggleFav = async (label: string) => {
    const next = { ...favs, [label]: !favs[label] };
    setFavs(next);
    try { await SecureStore.setItemAsync(FAV_KEY, JSON.stringify(next)); } catch {}
  };

  const go = (r: Row) => {
    if (r.comingSoon) return Alert.alert(r.label, 'Yeh feature Phase 2 mein add hoga. Underlying data already Accounts Dashboard mein track ho raha hai.');
    if (r.route) router.push({ pathname: r.route, params: r.params } as any);
  };

  return (
    <View style={styles.root} testID="acc-menu">
      <SafeAreaView edges={['top']} style={{ backgroundColor: HEADER_BG }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={HEADER_FG} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Accounts</Text>
            <Text style={styles.headerSub}>TDSC • Vyapar-style</Text>
          </View>
          <Pressable onPress={() => router.push('/accounting' as any)} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="stats-chart" size={20} color={HEADER_FG} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['home', 'reports', 'bank', 'settings'] as const).map(t => (
          <Pressable key={t} testID={`tab-${t}`} onPress={() => setTab(t)} style={[styles.tabItem, tab === t && styles.tabItemActive]}>
            <Ionicons
              name={t === 'home' ? 'briefcase' : t === 'reports' ? 'bar-chart' : t === 'bank' ? 'business' : 'settings'}
              size={18}
              color={tab === t ? BLUE : colors.muted} />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'home' ? 'My Business' : t === 'reports' ? 'Reports' : t === 'bank' ? 'Bank' : 'Settings'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'bank' ? (
        <BankPanel />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          {(tab === 'home' ? BUSINESS : tab === 'reports' ? REPORT_SECTIONS : SETTINGS_SECTIONS).map(s => (
            <SectionBlock key={s.title} section={s} onPress={go} showStar={tab === 'reports'} favs={favs} onFav={toggleFav} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const SectionBlock: React.FC<{ section: Section; onPress: (r: Row) => void; showStar?: boolean; favs?: Record<string, boolean>; onFav?: (l: string) => void }>
  = ({ section, onPress, showStar, favs = {}, onFav }) => {
  const [open, setOpen] = useState<boolean>(!!section.defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen(o => !o)} style={styles.sectionHeader} testID={`sec-${section.title}`}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <View>
          {section.rows.map(r => (
            <Pressable key={r.label} onPress={() => onPress(r)} style={styles.row} testID={`row-${r.label}`}>
              <View style={[styles.rowIcon, { backgroundColor: r.iconBg }]}>
                <Ionicons name={r.icon} size={20} color={r.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                {r.comingSoon ? <Text style={styles.soonTag}>COMING SOON</Text> : null}
              </View>
              {showStar ? (
                <Pressable onPress={() => onFav?.(r.label)} hitSlop={8} style={{ padding: 6 }} testID={`fav-${r.label}`}>
                  <Ionicons name={favs[r.label] ? 'star' : 'star-outline'} size={18} color={favs[r.label] ? '#F59E0B' : '#9CA3AF'} />
                </Pressable>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const BankPanel: React.FC = () => {
  const router = useRouter();
  const [banks, setBanks] = useState<any[] | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const b = await api.get<any[]>('/bank-accounts');
      setBanks(b);
      const dash = await api.get<any>('/accounting/dashboard').catch(() => null);
      // Best-effort: use opening as running balance placeholder if bank_balances not present in dashboard
      const map: Record<string, number> = {};
      for (const x of b) map[x.id] = Number(x.opening_balance || 0);
      if (dash?.bank_balances) Object.assign(map, dash.bank_balances);
      setBalances(map);
    } catch { setBanks([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shareCard = async (b: any) => {
    const bal = balances[b.id] ?? Number(b.opening_balance || 0);
    const msg = `TDSC • ${b.name}\n${b.bank_name} • A/c ${b.account_no}\nIFSC: ${b.ifsc || '—'}\nCurrent Balance: ${inr(bal)}`;
    try { await Share.share({ message: msg }); } catch {}
  };

  if (banks === null) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Loading…</Text></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bankHeader}>
        <Text style={styles.bankTitle}>Bank Accounts</Text>
        <Pressable testID="add-bank-btn" onPress={() => router.push('/accounting/banks' as any)} style={styles.bankAdd}>
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>Add Bank</Text>
        </Pressable>
      </View>
      {banks.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 32 }}>
          <Ionicons name="business-outline" size={48} color={colors.muted} />
          <Text style={{ color: colors.muted, marginTop: 8 }}>No bank accounts yet</Text>
          <Pressable onPress={() => router.push('/accounting/banks' as any)} style={[styles.bankAdd, { marginTop: 12 }]}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '800' }}>Add First Bank</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={banks}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const bal = balances[item.id] ?? Number(item.opening_balance || 0);
            const pos = bal >= 0;
            return (
              <View style={styles.bankCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={styles.bankLogo}><Ionicons name="business" size={22} color="#FFF" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bankName}>{item.name}</Text>
                    <Text style={styles.bankSub}>{item.bank_name} • ****{String(item.account_no).slice(-4)}</Text>
                  </View>
                  <Pressable onPress={() => shareCard(item)} hitSlop={8} testID={`share-${item.id}`}>
                    <Ionicons name="share-social" size={22} color={colors.brandPrimary} />
                  </Pressable>
                </View>
                <View style={styles.bankBody}>
                  <Text style={styles.bankLbl}>Current Balance</Text>
                  <Text style={[styles.bankBal, { color: pos ? '#059669' : '#DC2626' }]}>{pos ? '' : '-'}{inr(Math.abs(bal))}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable onPress={() => router.push({ pathname: '/accounting/books', params: { bank: item.id } } as any)} style={styles.bankBtn}>
                    <Ionicons name="book" size={14} color={colors.brandPrimary} />
                    <Text style={styles.bankBtnTxt}>Bank Book</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/accounting/banks' as any)} style={styles.bankBtn}>
                    <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
                    <Text style={styles.bankBtnTxt}>Manage</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, paddingTop: 6 },
  headerTitle: { color: HEADER_FG, fontSize: font.xl, fontWeight: '900' },
  headerSub: { color: HEADER_FG + 'aa', fontSize: 11, fontWeight: '600' },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFFcc', alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent', gap: 4 },
  tabItemActive: { borderBottomColor: BLUE },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  tabTextActive: { color: BLUE },
  section: { backgroundColor: '#FFF', marginTop: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: '#F9FAFB' },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: '#374151', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  rowIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: font.base, color: '#111827', fontWeight: '600' },
  soonTag: { color: '#9CA3AF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  bankHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: colors.border },
  bankTitle: { fontSize: font.lg, fontWeight: '800', color: '#111827' },
  bankAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  bankCard: { backgroundColor: '#FFF', borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  bankLogo: { width: 44, height: 44, borderRadius: 22, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  bankName: { color: '#111827', fontWeight: '800', fontSize: font.lg },
  bankSub: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  bankBody: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  bankLbl: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  bankBal: { fontSize: font.xxl, fontWeight: '900', marginTop: 4 },
  bankBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingVertical: 8, borderRadius: radius.md },
  bankBtnTxt: { color: colors.brandPrimary, fontWeight: '700', fontSize: 12 },
});
