import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Avatar, Card, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';

type Segment = 'customers' | 'accounts';

const daysUntil = (dateStr?: string | null): number | null => {
  if (!dateStr) return null;
  // accept YYYY-MM-DD or DD-MM-YYYY
  let iso = dateStr.trim();
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(iso)) {
    const [d, m, y] = iso.split(/[-/]/);
    iso = `${y}-${m}-${d}`;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export default function BusinessScreen() {
  const router = useRouter();
  const [seg, setSeg] = useState<Segment>('customers');
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.get<any[]>('/customers'), api.get<any[]>('/accounts')]);
      setCustomers(c); setAccounts(a);
    } catch { setCustomers([]); setAccounts([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filteredCustomers = useMemo(() => {
    if (!customers) return null;
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.mobile || '').toLowerCase().includes(s) ||
      (c.whatsapp || '').toLowerCase().includes(s) ||
      (c.pan || '').toLowerCase().includes(s) ||
      (c.customer_code || '').toLowerCase().includes(s) ||
      (c.gst_no || '').toLowerCase().includes(s)
    );
  }, [customers, q]);

  const filteredAccounts = useMemo(() => {
    if (!accounts) return null;
    const s = q.trim().toLowerCase();
    if (!s) return accounts;
    return accounts.filter(a => (a.title || '').toLowerCase().includes(s) || (a.party || '').toLowerCase().includes(s));
  }, [accounts, q]);

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="business-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>Business</Text>
        <Pressable
          testID="add-btn"
          style={styles.addBtn}
          onPress={() => router.push(seg === 'customers' ? '/customers/new' as any : '/accounts/new' as any)}
        >
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <View style={styles.segments}>
        <Pressable testID="seg-customers" onPress={() => setSeg('customers')} style={[styles.seg, seg === 'customers' && styles.segActive]}>
          <Text style={[styles.segText, seg === 'customers' && styles.segTextActive]}>Customers</Text>
        </Pressable>
        <Pressable testID="seg-accounts" onPress={() => setSeg('accounts')} style={[styles.seg, seg === 'accounts' && styles.segActive]}>
          <Text style={[styles.segText, seg === 'accounts' && styles.segTextActive]}>Accounts</Text>
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="search-input"
          value={q}
          onChangeText={setQ}
          placeholder={seg === 'customers' ? 'Search name, mobile, PAN, ID…' : 'Search title or party…'}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} testID="search-clear">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {seg === 'customers' ? (
        filteredCustomers === null ? <ScreenLoader /> : filteredCustomers.length === 0 ? (
          q ? (
            <EmptyState testID="customers-nomatch" icon="search-outline" title="No matches" subtitle={`Nothing found for "${q}"`} />
          ) : (
            <EmptyState testID="customers-empty" icon="people-outline" title="No customers yet" subtitle="Add your first client to get started" actionLabel="Add Customer" onAction={() => router.push('/customers/new' as any)} />
          )
        ) : (
          <FlatList
            testID="customer-list"
            data={filteredCustomers}
            keyExtractor={(i) => i.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
            renderItem={({ item }) => {
              const dscDays = daysUntil(item.dsc_expired_date);
              const dscWarn = dscDays !== null && dscDays <= 30;
              const dscExpired = dscDays !== null && dscDays < 0;
              return (
                <Pressable onPress={() => router.push(`/customers/${item.id}` as any)} testID={`customer-${item.id}`}>
                  <Card style={dscWarn ? { borderColor: dscExpired ? colors.error : colors.warning, borderWidth: 2 } : undefined}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <Avatar name={item.name} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.name}</Text>
                        {item.customer_code ? <Text style={[styles.muted, { color: colors.brandPrimary, fontWeight: '700' }]}>{item.customer_code}</Text> : null}
                        {item.mobile ? <Text style={styles.muted}>📱 {item.mobile}</Text> : null}
                        {item.pan ? <Text style={styles.muted}>PAN: {item.pan}</Text> : null}
                        {dscWarn ? (
                          <Text style={[styles.muted, { color: dscExpired ? colors.error : colors.warning, fontWeight: '700' }]}>
                            {dscExpired ? `⚠ DSC expired ${-dscDays!}d ago` : `⚠ DSC expires in ${dscDays}d`}
                          </Text>
                        ) : null}
                      </View>
                      {(item.attachments || []).length > 0 ? (
                        <View style={styles.attachTag}><Ionicons name="attach" size={12} color={colors.onBrandTertiary} /><Text style={styles.attachText}>{item.attachments.length}</Text></View>
                      ) : null}
                      {item.gst_no ? <View style={styles.gstTag}><Text style={styles.gstText}>GST</Text></View> : null}
                    </View>
                  </Card>
                </Pressable>
              );
            }}
          />
        )
      ) : (
        filteredAccounts === null ? <ScreenLoader /> : filteredAccounts.length === 0 ? (
          q ? (
            <EmptyState testID="accounts-nomatch" icon="search-outline" title="No matches" subtitle={`Nothing found for "${q}"`} />
          ) : (
            <EmptyState testID="accounts-empty" icon="cash-outline" title="No account entries" subtitle="Track invoices and expenses" actionLabel="Add Entry" onAction={() => router.push('/accounts/new' as any)} />
          )
        ) : (
          <FlatList
            testID="accounts-list"
            data={filteredAccounts}
            keyExtractor={(i) => i.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
            renderItem={({ item }) => (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.muted}>{item.party || '-'} • {item.type}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.amount, { color: item.status === 'paid' ? colors.success : colors.error }]}>₹ {Number(item.amount).toLocaleString('en-IN')}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                </View>
              </Card>
            )}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  h1: { fontSize: font.display, fontWeight: '800', color: colors.onSurface },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  seg: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segActive: { backgroundColor: colors.surface },
  segText: { color: colors.muted, fontWeight: '600' },
  segTextActive: { color: colors.brandPrimary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: font.base, paddingVertical: 0 },
  itemTitle: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  amount: { fontWeight: '800', fontSize: font.lg },
  gstTag: { backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  gstText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: '800' },
  attachTag: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.brandTertiary, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  attachText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: '800' },
});
