import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';

export default function TendersScreen() {
  const router = useRouter();
  const [list, setList] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setList(await api.get<any[]>('/tenders')); } catch { setList([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="tenders-screen">
      <ScreenHeader title="Tender Library" right={(
        <Pressable testID="add-tender" onPress={() => router.push('/tenders/new' as any)} style={styles.add}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      )} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="tenders-empty" icon="document-text-outline" title="No tenders yet" subtitle="Add tenders to track deadlines" actionLabel="Add Tender" onAction={() => router.push('/tenders/new' as any)} />
      ) : (
        <FlatList
          testID="tender-list"
          data={list}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/tenders/${item.id}` as any)} testID={`tender-${item.id}`}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={styles.icon}><Ionicons name="document-text" size={20} color={colors.error} /></View>
                  <View style={{ flex: 1 }}>
                    {item.tender_code ? <Text style={styles.code}>{item.tender_code}</Text> : null}
                    <Text style={styles.title} numberOfLines={2}>{item.name_of_work || item.title}</Text>
                    {item.nit_no ? <Text style={styles.muted}>NIT: {item.nit_no}</Text> : null}
                    {item.district ? <Text style={styles.muted}>📍 {item.district}{item.department ? ` • ${item.department}` : ''}</Text> : null}
                    {item.last_date ? <Text style={styles.muted}>Last date: {item.last_date}</Text> : null}
                    {item.estimated_cost != null ? <Text style={[styles.muted, { color: colors.brandPrimary, fontWeight: '700' }]}>₹ {Number(item.estimated_cost).toLocaleString('en-IN')}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {item.nit_copy ? <View style={styles.badge}><Ionicons name="checkmark" size={10} color={colors.success} /><Text style={styles.badgeText}>NIT</Text></View> : null}
                      {item.boq ? <View style={styles.badge}><Ionicons name="checkmark" size={10} color={colors.success} /><Text style={styles.badgeText}>BOQ</Text></View> : null}
                      {(item.other_documents || []).length > 0 ? <View style={styles.badge}><Ionicons name="attach" size={10} color={colors.muted} /><Text style={styles.badgeText}>{item.other_documents.length}</Text></View> : null}
                    </View>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.error + '15', alignItems: 'center', justifyContent: 'center' },
  code: { color: colors.brandPrimary, fontWeight: '800', fontSize: font.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface, marginTop: 2 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.surfaceSecondary },
  badgeText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
});
