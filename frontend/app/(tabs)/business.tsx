import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Avatar, Card, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';

type Segment = 'customers' | 'accounts';

export default function BusinessScreen() {
  const router = useRouter();
  const [seg, setSeg] = useState<Segment>('customers');
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.get<any[]>('/customers'), api.get<any[]>('/accounts')]);
      setCustomers(c); setAccounts(a);
    } catch { setCustomers([]); setAccounts([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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

      {seg === 'customers' ? (
        customers === null ? <ScreenLoader /> : customers.length === 0 ? (
          <EmptyState testID="customers-empty" icon="people-outline" title="No customers yet" subtitle="Add your first client to get started" actionLabel="Add Customer" onAction={() => router.push('/customers/new' as any)} />
        ) : (
          <FlatList
            testID="customer-list"
            data={customers}
            keyExtractor={(i) => i.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
            renderItem={({ item }) => (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={item.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.name}</Text>
                    {item.company ? <Text style={styles.muted}>{item.company}</Text> : null}
                    {item.phone ? <Text style={styles.muted}>{item.phone}</Text> : null}
                  </View>
                  {item.gst ? <View style={styles.gstTag}><Text style={styles.gstText}>GST</Text></View> : null}
                </View>
              </Card>
            )}
          />
        )
      ) : (
        accounts === null ? <ScreenLoader /> : accounts.length === 0 ? (
          <EmptyState testID="accounts-empty" icon="cash-outline" title="No account entries" subtitle="Track invoices and expenses" actionLabel="Add Entry" onAction={() => router.push('/accounts/new' as any)} />
        ) : (
          <FlatList
            testID="accounts-list"
            data={accounts}
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
  itemTitle: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  amount: { fontWeight: '800', fontSize: font.lg },
  gstTag: { backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  gstText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: '800' },
});
