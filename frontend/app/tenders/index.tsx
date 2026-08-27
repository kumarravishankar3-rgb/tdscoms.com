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
                    <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                    {item.reference_no ? <Text style={styles.muted}>Ref: {item.reference_no}</Text> : null}
                    {item.submission_deadline ? <Text style={styles.muted}>Deadline: {item.submission_deadline}</Text> : null}
                    {item.file_name ? <Text style={[styles.muted, { color: colors.brandPrimary }]}><Ionicons name="attach" size={12} /> {item.file_name}</Text> : null}
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
  title: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
});
