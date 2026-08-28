import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/AuthContext';
import { Card, StatusBadge } from '@/src/ui';

const HERO = 'https://images.unsplash.com/photo-1715593949273-09009558300a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBpbmRpYW4lMjBvZmZpY2UlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc4NzgwMjczMnww&ixlib=rb-4.1.0&q=85';

interface Summary {
  customers: number; employees: number; tasks_total: number; tasks_open: number;
  open_tenders: number; pending_leaves: number; accounts_pending: number;
  urgent_tenders: any[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.get<Summary>('/dashboard/summary'); setData(d); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const stats = [
    { label: 'Customers', value: data?.customers ?? 0, icon: 'people', color: colors.brandPrimary, testID: 'stat-customers' },
    { label: 'Employees', value: data?.employees ?? 0, icon: 'briefcase', color: colors.brandSecondary, testID: 'stat-employees' },
    { label: 'Open Tasks', value: data?.tasks_open ?? 0, icon: 'checkmark-done', color: colors.success, testID: 'stat-tasks' },
    { label: 'Open Tenders', value: data?.open_tenders ?? 0, icon: 'document-text', color: colors.error, testID: 'stat-tenders' },
    { label: 'Pending Bills', value: data?.accounts_pending ?? 0, icon: 'cash', color: colors.warning, testID: 'stat-accounts' },
    { label: 'Leaves', value: data?.pending_leaves ?? 0, icon: 'calendar', color: colors.info, testID: 'stat-leaves' },
  ];

  return (
    <View style={styles.root} testID="dashboard-screen">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient colors={['transparent', 'rgba(9,9,11,0.85)']} style={StyleSheet.absoluteFillObject} />
          <SafeAreaView edges={['top']} style={styles.heroContent}>
            <View style={styles.brandRow}>
              <View style={styles.brandLogo}>
                <Image source={require('../../assets/images/company-logo.jpg')} style={{ width: '100%', height: '100%' }} contentFit="contain" />
              </View>
              <Text style={styles.brandTitle}>TDSC OMS</Text>
            </View>
            <Text style={styles.hello} testID="dashboard-hello">Namaste, {user?.name?.split(' ')[0] || 'User'}</Text>
            <Text style={styles.company}>TDSC Office Management System</Text>
            <View style={styles.heroCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroCardTitle}>Today's overview</Text>
                <Text style={styles.heroCardValue}>{(data?.tasks_open ?? 0) + (data?.open_tenders ?? 0)} pending items</Text>
              </View>
              <Ionicons name="trending-up" size={28} color={colors.success} />
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.grid}>
          {stats.map(s => (
            <Pressable key={s.label} style={styles.statCard} testID={s.testID}>
              <View style={[styles.statIcon, { backgroundColor: s.color + '20' }]}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Urgent Tenders</Text>
            <Pressable onPress={() => router.push('/tenders')}><Text style={styles.link}>View all</Text></Pressable>
          </View>
          {(data?.urgent_tenders || []).length === 0 ? (
            <Card><Text style={styles.mutedText}>No urgent tenders right now.</Text></Card>
          ) : (
            (data!.urgent_tenders).map((t: any) => (
              <Pressable key={t.id} onPress={() => router.push(`/tenders/${t.id}` as any)}>
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <Text style={styles.tenderTitle} numberOfLines={2}>{t.title}</Text>
                      <Text style={styles.mutedText}>Deadline: {t.submission_deadline || 'N/A'}</Text>
                    </View>
                    <StatusBadge status={t.status} />
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionsRow}>
            <QuickAction icon="person-add" label="Add Customer" onPress={() => router.push('/customers/new' as any)} testID="qa-customer" />
            <QuickAction icon="add-circle" label="New Task" onPress={() => router.push('/tasks/new' as any)} testID="qa-task" />
          </View>
          <View style={styles.actionsRow}>
            <QuickAction icon="document" label="New Tender" onPress={() => router.push('/tenders/new' as any)} testID="qa-tender" />
            <QuickAction icon="cash" label="Add Entry" onPress={() => router.push('/accounts/new' as any)} testID="qa-account" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const QuickAction: React.FC<{ icon: any; label: string; onPress: () => void; testID: string }> = ({ icon, label, onPress, testID }) => (
  <Pressable onPress={onPress} style={styles.qa} testID={testID}>
    <View style={styles.qaIcon}><Ionicons name={icon} size={22} color={colors.brandPrimary} /></View>
    <Text style={styles.qaLabel}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hero: { height: 240, overflow: 'hidden' },
  heroContent: { flex: 1, padding: spacing.xl, justifyContent: 'flex-end' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  brandLogo: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface, padding: 4, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: font.lg, letterSpacing: 0.4 },
  hello: { color: colors.onBrandPrimary, fontSize: font.xxl, fontWeight: '800' },
  company: { color: colors.onBrandPrimary, opacity: 0.9, fontSize: font.base, marginTop: 2 },
  heroCard: { marginTop: spacing.lg, backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  heroCardTitle: { color: colors.onBrandPrimary, opacity: 0.85, fontSize: font.sm },
  heroCardValue: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: font.xl, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md },
  statCard: { width: '31%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  statValue: { fontSize: font.xxl, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: '600' },
  mutedText: { color: colors.muted, fontSize: font.base },
  tenderTitle: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  qa: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: 8 },
  qaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: font.base, fontWeight: '600', color: colors.onSurface },
});
